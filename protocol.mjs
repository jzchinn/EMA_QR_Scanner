// E1 raw-byte and E2 alphanumeric exports, paired with app/export-format.js.
// Record decoding and the saved file, paired with app/record-format.js. No network or DOM access.
export const PAGE_BYTES = 548;
export const E2_PAGE_BYTES = 870;
export const MAX_BYTES = 1048576;
const E2_MAX_CHARS = 938;
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const ALNUM_OK = new Uint8Array(256);
for (const c of ALNUM) ALNUM_OK[c.charCodeAt(0)] = 1;
const E2_UNSWAP = { 36: 10, 46: 44, 43: 61 };   // "$" -> newline, "." -> ",", "+" -> "="
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
function parseE2(bytes) {
  if (bytes.length > E2_MAX_CHARS || bytes.some(b => !ALNUM_OK[b])) throw unreadablePage();
  const end = bytes.indexOf(36);
  if (end < 0 || end > 63) throw unreadablePage();
  const header = String.fromCharCode(...bytes.subarray(0, end));
  const match = /^E2 ([0-9A-F]{1,16}-[0-9A-F]{1,8}) ([1-9][0-9]{0,3}) ([1-9][0-9]{0,3}) ([1-9][0-9]{0,6}) ([0-9A-F]{8}) ([SD])$/.exec(header);
  if (!match) throw unreadablePage();
  const [, id, p, t, s, crc, kind] = match;
  const page = Number(p), total = Number(t), size = Number(s);
  if (size > MAX_BYTES || total !== Math.ceil(size / E2_PAGE_BYTES) || page > total) throw unreadablePage();
  const payload = bytes.slice(end + 1).map(b => E2_UNSWAP[b] ?? b);
  const expected = Math.min(E2_PAGE_BYTES, size - (page - 1) * E2_PAGE_BYTES);
  if (payload.length !== expected) throw unreadablePage();
  return { protocol: 'E2', id: id.toLowerCase(), page, total, size, crc: crc.toLowerCase(), kind, payload };
}
export function parsePage(input) {
  const bytes = Uint8Array.from(input);
  if (bytes[0] === 69 && bytes[1] === 50 && bytes[2] === 32) return parseE2(bytes);   // "E2 "
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
  return { protocol: 'E1', id, page, total, size, crc, kind, payload };
}
export class ExportSession {
  constructor() { this.meta = null; this.pages = new Map(); this.verified = null; this.failed = false; }
  add(input) {
    if (this.failed) throw new Error('This export failed verification. Start a new export and rescan.');
    const p = parsePage(input);
    if (this.meta && ['protocol', 'id', 'total', 'size', 'crc', 'kind'].some(key => this.meta[key] !== p[key])) {
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
      const pageSize = p.protocol === 'E2' ? E2_PAGE_BYTES : PAGE_BYTES;
      const output = new Uint8Array(p.size);
      for (let i = 1; i <= p.total; i++) output.set(this.pages.get(i), (i - 1) * pageSize);
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

// ---- Survey records ----
// New: "R <time> <answers> <ms x10>" (codebook in PROTOCOL.md). Legacy: "*Q2:...TIME:...Z&".
const RECORD = /^R ([0-9A-Z]{1,6}) ([0-69])([0-69])([0-489]{9})((?: -?[0-9A-Z]+){10})$/;
const LEGACY = /^\*Q2:(-?[0-3]|9),Q3:(-?[0-3]|9),EMO:((?:\d+,){8}\d+),MS:((?:-?\d+,){9}-?\d+),TIME:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3})Z&$/;
const PID_LINE = /^PID:(\d{4}[A-Z])$/;
export const EMO_ITEMS = ['energetic', 'happy', 'at_ease', 'angry', 'on_edge', 'sad', 'thankful', 'lonely', 'guilty'];
const MS_COLUMNS = ['q2', 'q3', 'q1a', 'q1b', 'q1c'].flatMap(s => [`${s}_touch_ms`, `${s}_done_ms`]);
const pad = n => String(n).padStart(2, '0');
function decodeRecord(m) {
  const d = new Date(parseInt(m[1], 36) * 60000);   // local wall-clock minutes, read with UTC getters
  const answer = c => c === '9' ? 9 : Number(c) - 3;
  const emo = [...m[4]].map(c => c === '8' ? 888 : c === '9' ? 999 : Number(c) * 25);
  const ms = m[5].trim().split(' ').map(s => parseInt(s, 36));
  return {
    time: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    year: d.getUTCFullYear(), q2: answer(m[2]), q3: answer(m[3]), emo, ms
  };
}
// Decodes every line. Returns null if the bytes are not UTF-8.
export function decodeFile(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
  const rows = [], pids = [];
  let pid = '', ws = '', malformed = 0, other = 0, inconsistent = 0, badTime = 0, number = 0;
  for (const raw of text.split('\n')) {
    number++;
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line) continue;
    if (line.startsWith('R ')) {
      const m = RECORD.exec(line);
      if (!m) { malformed++; continue; }
      const r = decodeRecord(m);
      const abandoned = r.q2 === 9;
      if ((r.q3 === 9) !== abandoned || r.emo.some(v => v === 999) !== abandoned || (abandoned && r.emo.some(v => v !== 999))) inconsistent++;
      if (r.year < 2026 || r.year > 2030) badTime++;
      rows.push({ pid, time: r.time, abandoned, q2: r.q2, q3: r.q3, emo: r.emo, ms: r.ms, ws, format: 'R', line: number });
    } else if (line.startsWith('*Q2:')) {
      const m = LEGACY.exec(line);
      const emo = m ? m[3].split(',') : [];
      if (!m || !emo.every(v => ['0','25','50','75','100','888','999'].includes(v))) { malformed++; continue; }
      rows.push({ pid, time: m[5].replace('T', ' '), abandoned: m[1] === '9', q2: Number(m[1]), q3: Number(m[2]),
        emo: emo.map(Number), ms: m[4].split(',').map(Number), ws, format: 'legacy', line: number });
    } else {
      other++;
      const p = PID_LINE.exec(line);
      if (p) { pid = p[1]; if (!pids.includes(pid)) pids.push(pid); }
      else if (line.startsWith('WS:')) ws = line.slice(3);
    }
  }
  return { rows, pid, pids, malformed, other, inconsistent, badTime };
}
export function summarize(bytes) {
  const decoded = decodeFile(bytes);
  if (!decoded) return { records: 0, warnings: ['File is not valid UTF-8. Original bytes are preserved.'], needsReview: true, decoded: null };
  const { rows, malformed, other, inconsistent, badTime } = decoded;
  const warnings = [];
  if (malformed) warnings.push(`${malformed} survey-like line(s) have an unexpected format.`);
  if (inconsistent) warnings.push(`${inconsistent} record(s) are only partly marked abandoned.`);
  if (badTime) warnings.push(`${badTime} record(s) have a watch time outside 2026–2030; check the watch clock.`);
  if (other) warnings.push(`${other} other line(s), such as setup or POSTED markers, retained.`);
  if (bytes.length && bytes[bytes.length - 1] !== 10) warnings.push('No final newline: inspect the last record for truncation.');
  const needsReview = malformed > 0 || inconsistent > 0 || badTime > 0 || (bytes.length > 0 && bytes[bytes.length - 1] !== 10);
  return { records: rows.length, warnings, needsReview, decoded };
}

// ---- Saved file: header, the exact watch file, then a readable CSV ----
function csvField(v) { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
export function readableCsv(rows) {
  const header = ['pid', 'local_time', 'abandoned', 'q2', 'q3', ...EMO_ITEMS, ...MS_COLUMNS, 'wake_sleep', 'format', 'line'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.pid, r.time, r.abandoned ? 1 : 0, r.q2, r.q3, ...r.emo, ...r.ms, r.ws, r.format, r.line].map(csvField).join(','));
  }
  return lines.join('\n') + '\n';
}
const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
export function fileName(meta, decoded, now) {
  if (meta.kind === 'S') return `SAMPLE_esm_data_${stamp(now)}.txt`;
  if (decoded && decoded.pid) return `${decoded.pid}_esm_data_${stamp(now)}.txt`;
  return `NOPID_esm_data_${stamp(now)}_${meta.id}.txt`;
}
export const ORIGINAL_BEGIN = '---- BEGIN ORIGINAL WATCH FILE ----';
export const ORIGINAL_END = '---- END ORIGINAL WATCH FILE ----';
export const READABLE_BEGIN = '---- BEGIN READABLE CSV ----';
export const READABLE_END = '---- END READABLE CSV ----';
export function savedFile(bytes, meta, now, readerVersion) {
  const decoded = decodeFile(bytes);
  const saved = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const head = [
    'ESM WATCH EXPORT',
    `pid: ${decoded ? decoded.pid || 'none' : 'unknown'}`,
    `saved: ${saved} (phone time)`,
    `export: ${meta.protocol} ${meta.id}, ${meta.total} page(s)${meta.kind === 'S' ? ', SAMPLE (not participant data)' : ''}`,
    `original: ${bytes.length} bytes, CRC-32 ${meta.crc}`,
    `reader: ${readerVersion}`,
    'The original section is the exact watch file: the bytes after the BEGIN line, minus the one newline added before the END line.',
    'The readable section is decoded from it; codebook in PROTOCOL.md.',
    ORIGINAL_BEGIN, ''].join('\n');
  const csv = decoded ? readableCsv(decoded.rows) : '(not decoded: the watch file is not valid UTF-8)\n';
  const tail = `\n${ORIGINAL_END}\n${READABLE_BEGIN}\n${csv}${READABLE_END}\n`;
  const encoder = new TextEncoder(), a = encoder.encode(head), c = encoder.encode(tail);
  const out = new Uint8Array(a.length + bytes.length + c.length);
  out.set(a); out.set(bytes, a.length); out.set(c, a.length + bytes.length);
  return out;
}
// Recovers the exact watch file from a saved file (size taken from the "original:" line).
export function extractOriginal(saved) {
  const text = new TextDecoder('latin1').decode(saved);
  const size = Number(/^original: (\d+) bytes/m.exec(text)[1]);
  const start = text.indexOf(ORIGINAL_BEGIN + '\n') + ORIGINAL_BEGIN.length + 1;
  return saved.slice(start, start + size);
}
