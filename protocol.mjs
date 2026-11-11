// E1 raw-byte export, paired with app/export-format.js. No network or DOM access.
export const PAGE_BYTES = 548;
export const MAX_BYTES = 1048576;
export function checksum(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0');
}
function unreadablePage() {
  const error = new Error('Could not read this page. Move the phone slightly farther away, keep the whole code visible, and hold steady.');
  error.code = 'unreadable';
  return error;
}
export function parsePage(input) {
  const bytes = Uint8Array.from(input);
  if (bytes.length > 644) throw unreadablePage();
  const end = bytes.indexOf(10);
  if (end < 0 || end > 95) throw unreadablePage();
  const header = String.fromCharCode(...bytes.subarray(0, end));
  const match = /^E1\|([0-9a-f]{1,16}-[0-9a-f]{1,8})\|([1-9][0-9]{0,3})\|([1-9][0-9]{0,3})\|([1-9][0-9]{0,6})\|([0-9a-f]{8})\|([SD])$/.exec(header);
  if (!match) throw unreadablePage();
  const [, id, p, t, s, crc, kind] = match;
  const page = Number(p), total = Number(t), size = Number(s);
  if (size > MAX_BYTES || total !== Math.ceil(size / PAGE_BYTES) || page > total) throw unreadablePage();
  const payload = bytes.slice(end + 1);
  const expected = Math.min(PAGE_BYTES, size - (page - 1) * PAGE_BYTES);
  if (payload.length !== expected) throw unreadablePage();
  return { id, page, total, size, crc, kind, payload };
}
export class ExportSession {
  constructor() { this.meta = null; this.pages = new Map(); this.verified = null; this.failed = false; }
  add(input) {
    if (this.failed) throw new Error('This export failed verification. Start a new export and rescan.');
    const p = parsePage(input);
    if (this.meta && ['id', 'total', 'size', 'crc', 'kind'].some(key => this.meta[key] !== p[key])) {
      throw new Error('Different export detected. Current pages were kept. Return to this watch/export or start a new export.');
    }
    const old = this.pages.get(p.page);
    if (old) {
      if (old.some((byte, i) => byte !== p.payload[i])) {
        this.failed = true; this.verified = null;
        throw new Error('Conflicting copies of the same page. Start a new export and rescan.');
      }
      return { duplicate: true, page: p.page };
    }
    if (!this.meta) {
      const { payload, page, ...meta } = p;
      this.meta = meta;
    }
    this.pages.set(p.page, p.payload);
    if (this.pages.size === p.total) {
      const output = new Uint8Array(p.size);
      for (let i = 1; i <= p.total; i++) output.set(this.pages.get(i), (i - 1) * PAGE_BYTES);
      if (checksum(output) !== p.crc) {
        this.failed = true;
        throw new Error('Whole-file checksum failed. Do not clear the watch. Start a new export and rescan.');
      }
      this.verified = output;
    }
    return { duplicate: false, page: p.page };
  }
  missing() {
    if (!this.meta) return [];
    return Array.from({ length: this.meta.total }, (_, i) => i + 1).filter(p => !this.pages.has(p));
  }
}
export function summarize(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return { records: 0, warnings: ['File is not valid UTF-8. Original bytes are preserved.'], needsReview: true }; }
  const warnings = [];
  let records = 0, malformed = 0, other = 0;
  const record = /^\*Q2:(-?[0-3]|9),Q3:(-?[0-3]|9),EMO:((?:\d+,){8}\d+),MS:((?:-?\d+,){9}-?\d+),TIME:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z&$/;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line) continue;
    if (line.startsWith('*Q2:')) {
      const m = record.exec(line);
      if (m && m[3].split(',').every(v => ['0','25','50','75','100','888','999'].includes(v))) records++;
      else malformed++;
    } else other++;
  }
  if (malformed) warnings.push(`${malformed} survey-like line(s) have an unexpected format.`);
  if (other) warnings.push(`${other} other line(s), such as setup or POSTED markers, retained.`);
  if (bytes.length && bytes[bytes.length - 1] !== 10) warnings.push('No final newline: inspect the last record for truncation.');
  return { records, warnings, needsReview: malformed > 0 || (bytes.length > 0 && bytes[bytes.length - 1] !== 10) };
}
