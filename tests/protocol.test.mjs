import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ExportSession, checksum, parsePage, summarize, PAGE_BYTES, MAX_BYTES } from '../protocol.mjs';
// Load the actual pure watch modules without requiring device APIs or a Fitbit build.
const watch = await import('data:text/javascript;base64,' + readFileSync(new URL('../../../app/export-format.js', import.meta.url)).toString('base64'));
const qrEncoder = await import('data:text/javascript;base64,' + readFileSync(new URL('../../../app/qr.js', import.meta.url)).toString('base64'));
const require = createRequire(import.meta.url);
const jsQR = require('../vendor/jsQR.js');
const encode = text => new TextEncoder().encode(text);
function pages(bytes, id = '19a1234-abcdef01', kind = false) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 512) {
    const chunk = bytes.subarray(i, i + 512); crc = watch.crcUpdate(crc, chunk, chunk.length);
  }
  const total = Math.ceil(bytes.length / watch.EXPORT_PAGE_BYTES);
  return Array.from({ length: total }, (_, i) => {
    const header = encode(watch.exportHeader(id, i + 1, total, bytes.length, watch.crcHex(crc), kind));
    const body = bytes.subarray(i * PAGE_BYTES, (i + 1) * PAGE_BYTES);
    const output = new Uint8Array(header.length + body.length); output.set(header); output.set(body, header.length);
    return output;
  });
}
function decodeQR(payload) {
  const qr = qrEncoder.encodeBytes(payload, payload.length, 17, 2);
  const scale = 3, side = (qr.size + 8) * scale;
  const rgba = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const mx = Math.floor(x / scale) - 4, my = Math.floor(y / scale) - 4;
    const dark = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && (qr.modules[my * qr.size + mx] & 1);
    const o = (y * side + x) * 4;
    rgba[o] = rgba[o+1] = rgba[o+2] = dark ? 0 : 255; rgba[o+3] = 255;
  }
  const decoded = jsQR(rgba, side, side, { inversionAttempts: 'dontInvert' });
  assert.ok(decoded, 'bundled decoder reads the watch matrix');
  return Uint8Array.from(decoded.binaryData);
}
const record = '*Q2:2,Q3:1,EMO:50,75,25,100,50,0,75,50,25,MS:1840,4102,5230,7710,9900,16400,18200,24050,25900,31200,TIME:2026-07-30T14:22:09.331Z&\n';
test('CRC independent published check vector and shared protocol limits', () => {
  assert.equal(checksum(encode('123456789')), 'cbf43926');
  assert.equal(watch.crcHex(watch.crcUpdate(-1, encode('123456789'), 9)), 'cbf43926');
  assert.equal(watch.EXPORT_PAGE_BYTES, PAGE_BYTES); assert.equal(watch.EXPORT_MAX_BYTES, MAX_BYTES);
});
test('150 records survive real watch QR encoding, bundled decoding, reverse order, and duplicate scans', () => {
  const bytes = encode('SETUP:PID=123\n' + record.repeat(150) + 'POSTED\n');
  const encoded = pages(bytes); const session = new ExportSession();
  for (const page of encoded.reverse()) {
    const decoded = decodeQR(page); assert.deepEqual(decoded, page);
    session.add(decoded); assert.equal(session.add(decoded).duplicate, true);
  }
  assert.deepEqual(session.verified, bytes); assert.deepEqual(session.missing(), []);
  assert.equal(summarize(session.verified).records, 150);
});
test('arbitrary bytes, split UTF-8, CRLF, and absent final newline are preserved', () => {
  for (const bytes of [encode('a'.repeat(547) + '🙂\r\n' + record), Uint8Array.from({length: 1800}, (_, i) => i % 256)]) {
    const session = new ExportSession();
    for (const page of pages(bytes)) session.add(decodeQR(page));
    assert.deepEqual(session.verified, bytes);
  }
});
test('missing page blocks saving and is identified', () => {
  const session = new ExportSession(), all = pages(encode(record.repeat(20)));
  all.forEach((p, i) => { if (i !== 1) session.add(p); });
  assert.equal(session.verified, null); assert.deepEqual(session.missing(), [2]);
});
test('another export is rejected without discarding existing pages', () => {
  const bytes = encode(record.repeat(20)), session = new ExportSession();
  session.add(pages(bytes)[0]);
  assert.throws(() => session.add(pages(bytes, '19a1234-abcd0002')[1]), /Different export/);
  assert.equal(session.pages.size, 1); assert.equal(session.failed, false);
  for (const page of pages(bytes).slice(1)) session.add(page);
  assert.deepEqual(session.verified, bytes);
});
test('conflicting duplicates invalidate the session', () => {
  const session = new ExportSession(), p = pages(encode(record.repeat(10)))[0];
  session.add(p); const bad = p.slice(); bad[bad.length - 1] ^= 1;
  assert.throws(() => session.add(bad), /Conflicting/);
  assert.equal(session.failed, true); assert.equal(session.verified, null);
});
test('whole-file corruption blocks saving', () => {
  const session = new ExportSession(), all = pages(encode(record.repeat(10)));
  all[0][all[0].length - 1] ^= 1;
  assert.throws(() => { for (const p of all) session.add(p); }, /checksum failed/);
  assert.equal(session.verified, null); assert.equal(session.failed, true);
});
test('legacy, truncated, impossible, and oversized pages are rejected', () => {
  assert.throws(() => parsePage(encode('1/3\nhello')), { code: 'unreadable' });
  const p = pages(encode(record))[0]; assert.throws(() => parsePage(p.slice(0,-1)), { code: 'unreadable' });
  assert.throws(() => parsePage(encode('E1|19a-a|2|1|5|12345678|D\nhello')), { code: 'unreadable' });
  assert.throws(() => parsePage(encode('E1|19a-a|1|1|9999999|12345678|D\nhello')), { code: 'unreadable' });
  assert.throws(() => parsePage(new Uint8Array(645)), { code: 'unreadable' });
});
test('one-byte, exact-page, last-page, maximum file size, and sample flag', () => {
  for (const size of [1,548,549,MAX_BYTES]) {
    const bytes = new Uint8Array(size).fill(65), session = new ExportSession();
    for (const p of pages(bytes, '19a-1', true)) session.add(p);
    assert.deepEqual(session.verified, bytes); assert.equal(session.meta.kind, 'S');
  }
});
test('record warnings do not change or discard bytes', () => {
  const bytes = encode(record + '*Q2:broken'); const session = new ExportSession();
  pages(bytes).forEach(p => session.add(p));
  const report = summarize(session.verified);
  assert.equal(report.records, 1); assert.equal(report.warnings.length, 2); assert.equal(report.needsReview, true);
  assert.equal(summarize(encode(record + 'POSTED\n')).needsReview, false);
  assert.deepEqual(session.verified, bytes);
});
