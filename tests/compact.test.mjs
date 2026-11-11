// Compact record (app/record-format.js), E2 alphanumeric export, and the saved file.
// Imports the actual watch files, as protocol.test.mjs does. Run: node --test tools/phone-reader/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  ExportSession, parsePage, summarize, decodeFile, readableCsv, fileName, savedFile, extractOriginal,
  checksum, PAGE_BYTES, E2_PAGE_BYTES, EMO_ITEMS
} from '../protocol.mjs';
const load = path => import('data:text/javascript;base64,' + readFileSync(new URL(path, import.meta.url)).toString('base64'));
const watch = await load('../../../app/export-format.js');
const qrEncoder = await load('../../../app/qr.js');
const records = await load('../../../app/record-format.js');
const jsQR = createRequire(import.meta.url)('../vendor/jsQR.js');
const encode = text => new TextEncoder().encode(text);
const decodeText = bytes => new TextDecoder().decode(bytes);

const Q_VALUES = { '-3': '0', '-2': '1', '-1': '2', '0': '3', '1': '4', '2': '5', '3': '6', '9': '9' };
const EMO_VALUES = { '0': '0', '25': '1', '50': '2', '75': '3', '100': '4', '888': '8', '999': '9' };
const T0 = Date.UTC(2026, 10, 12, 9, 5);   // local wall time 2026-11-12 09:05, as the watch computes it
const MS = [1840, 4102, 5230, 7710, 9900, 16400, 18200, 24050, 25900, 31200];
const EMO = [50, 75, 25, 100, 50, 0, 75, 50, 25];
const line = (q2 = 2, q3 = 1, emo = EMO, ms = MS, t = T0) => records.recordLine(t, q2, q3, emo, ms);
const only = text => decodeFile(encode(text)).rows;

// Same page construction as app/transfer.js pagePayload().
function crcOf(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 512) { const c = bytes.subarray(i, i + 512); crc = watch.crcUpdate(crc, c, c.length); }
  return watch.crcHex(crc);
}
function watchPages(bytes, compressed, id = '19a6f3c2d10-abcdef01', sample = false) {
  let eligible = compressed;
  for (let i = 0; i < bytes.length && eligible; i += 512) { const c = bytes.subarray(i, i + 512); eligible = watch.e2Eligible(c, c.length); }
  const size = eligible ? watch.E2_PAGE_BYTES : watch.EXPORT_PAGE_BYTES;
  const total = Math.ceil(bytes.length / size), crc = crcOf(bytes);
  return Array.from({ length: total }, (_, p) => {
    const header = eligible ? watch.exportHeaderE2(id, p + 1, total, bytes.length, crc, sample)
                            : watch.exportHeader(id, p + 1, total, bytes.length, crc, sample);
    const body = bytes.subarray(p * size, (p + 1) * size);
    const out = new Uint8Array(header.length + body.length);
    for (let i = 0; i < header.length; i++) out[i] = header.charCodeAt(i);
    for (let i = 0; i < body.length; i++) out[header.length + i] = eligible ? watch.E2_CHAR[body[i]] : body[i];
    return { payload: out, alnum: eligible };
  });
}
function throughQR({ payload, alnum }) {
  const qr = qrEncoder.encodeBytes(payload, payload.length, 17, 2, alnum);
  const scale = 3, side = (qr.size + 8) * scale, rgba = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const mx = Math.floor(x / scale) - 4, my = Math.floor(y / scale) - 4;
    const dark = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && (qr.modules[my * qr.size + mx] & 1);
    const o = (y * side + x) * 4; rgba[o] = rgba[o + 1] = rgba[o + 2] = dark ? 0 : 255; rgba[o + 3] = 255;
  }
  const decoded = jsQR(rgba, side, side, { inversionAttempts: 'dontInvert' });
  assert.ok(decoded, 'bundled decoder reads the watch matrix');
  return Uint8Array.from(decoded.binaryData);
}
// Deterministic realistic study data: ~8% abandoned, ~5% untouched sliders.
function studyFile(n, seed = 7) {
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  let text = 'PID:1234A\nWS:MON=0800-2300,TUE=0800-2300,WED=0800-2300,THU=0800-2300,FRI=0800-2300,SAT=0900-2330,SUN=0900-2330\n';
  const inputs = [];
  for (let i = 0; i < n; i++) {
    const ms = []; let t = 0;
    for (let s = 0; s < 5; s++) { const touch = t + ri(800, 20000), done = touch + ri(300, 15000); ms.push(touch, done); t = done; }
    const abandoned = rnd() < 0.08;
    if (abandoned) { const k = ri(0, 4); for (let j = 2 * k + 1; j < 10; j++) ms[j] = -1; if (rnd() < 0.5) ms[2 * k] = -1; }
    const input = abandoned
      ? [T0 + i * 55 * 60000, 9, 9, Array(9).fill(999), ms]
      : [T0 + i * 55 * 60000, ri(-3, 3), ri(-3, 3), Array.from({ length: 9 }, () => rnd() < 0.05 ? 888 : 25 * ri(0, 4)), ms];
    inputs.push(input); text += records.recordLine(...input);
  }
  return { bytes: encode(text), inputs };
}

test('record line shape matches the codebook example', () => {
  assert.equal(line(2, 1, EMO, MS, Date.UTC(2026, 6, 30, 14, 22, 9, 331)),
    'R HPSNY 54231420321 1F4 35Y 41A 5Y6 7N0 CNK E1K IK2 JZG O2O\n');
  assert.equal(line(9, 9, Array(9).fill(999), [2210, 5003, -1, -1, -1, -1, -1, -1, -1, -1], Date.UTC(2026, 6, 30, 16, 20)),
    'R HPSR8 99999999999 1PE 3UZ -1 -1 -1 -1 -1 -1 -1 -1\n');
});
test('every legal Q2/Q3 and EMO value encodes to its codebook digit and decodes back', () => {
  for (const [q, digit] of Object.entries(Q_VALUES)) {
    const text = line(Number(q), Number(q));
    assert.equal(text.split(' ')[2].slice(0, 2), digit + digit);
    const [row] = only(text);
    assert.equal(row.q2, Number(q)); assert.equal(row.q3, Number(q));
  }
  for (const [v, digit] of Object.entries(EMO_VALUES)) {
    const text = line(2, 1, Array(9).fill(Number(v)));
    assert.equal(text.split(' ')[2].slice(2), digit.repeat(9));
    assert.deepEqual(only(text)[0].emo, Array(9).fill(Number(v)));
  }
  for (let i = 0; i < 9; i++) {   // position: each slot lands in its own digit
    const emo = Array(9).fill(0); emo[i] = 100;
    assert.equal(only(line(0, 0, emo))[0].emo.indexOf(100), i);
  }
});
test('illegal answer values are written as E and rejected by the reader', () => {
  for (const bad of [5, 4, -4, 1.5, undefined, NaN, null]) {
    const text = records.recordLine(T0, bad, 1, EMO, MS);   // not line(): its default would replace undefined
    assert.equal(text.split(' ')[2][0], 'E', String(bad));
    const report = summarize(encode(text));
    assert.equal(report.records, 0); assert.equal(report.needsReview, true);
  }
  for (const bad of [30, 101, -25, 12.5, undefined, 887]) {
    const emo = EMO.slice(); emo[4] = bad;
    assert.equal(records.recordLine(T0, 2, 1, emo, MS).split(' ')[2][6], 'E', String(bad));
    assert.equal(summarize(encode(records.recordLine(T0, 2, 1, emo, MS))).records, 0);
  }
});
test('MS values round-trip exactly, including -1, negatives and large values', () => {
  const cases = [0, 1, -1, -2, -99, -100, -101, -150, -99999, 35, 36, 1295, 1296, 46655, 46656, 595000, 1e9, -1e9];
  for (let i = 0; i < cases.length; i += 10) {
    const ms = cases.slice(i, i + 10); while (ms.length < 10) ms.push(-1);
    assert.deepEqual(only(line(0, 0, EMO, ms))[0].ms, ms);
  }
  assert.ok(line().split(' ').slice(3).every(s => s.trim() === s.trim().toUpperCase()));
});
test('record time keeps the local minute and has five characters', () => {
  for (const [y, mo, d, h, mi] of [[2026, 0, 1, 0, 0], [2026, 11, 31, 23, 59], [2027, 1, 28, 12, 30], [2028, 1, 29, 7, 1], [2030, 5, 15, 18, 45]]) {
    const text = line(0, 0, EMO, MS, Date.UTC(y, mo, d, h, mi, 59, 999));
    assert.equal(text.split(' ')[1].length, 5);
    assert.equal(only(text)[0].time, `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);
  }
  const report = summarize(encode(line(0, 0, EMO, MS, Date.UTC(1970, 0, 2))));
  assert.equal(report.needsReview, true); assert.match(report.warnings.join(' '), /watch clock/);
});
test('100,000 random records round-trip through the decoder', () => {
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = a => a[Math.floor(rnd() * a.length)];
  let text = ''; const inputs = [];
  for (let i = 0; i < 100000; i++) {
    const input = [Date.UTC(2026, 10, 1) + Math.floor(rnd() * 4e9), Number(pick(Object.keys(Q_VALUES))), Number(pick(Object.keys(Q_VALUES))),
      Array.from({ length: 9 }, () => Number(pick(Object.keys(EMO_VALUES)))),
      Array.from({ length: 10 }, () => rnd() < 0.1 ? -1 : Math.floor((rnd() - 0.02) * 700000))];
    inputs.push(input); text += records.recordLine(...input);
  }
  const rows = decodeFile(encode(text)).rows;
  assert.equal(rows.length, 100000);
  rows.forEach((r, i) => {
    const [, q2, q3, emo, ms] = inputs[i];
    assert.ok(r.q2 === q2 && r.q3 === q3 && r.emo.join() === emo.join() && r.ms.join() === ms.join(), `record ${i}`);
  });
});
test('E2 character table: allowed bytes, swaps, and exact restoration', () => {
  const allowed = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ %*-/:\n,=';
  for (let b = 0; b < 256; b++) {
    const ok = allowed.includes(String.fromCharCode(b));
    assert.equal(watch.E2_CHAR[b] !== 0, ok, `byte ${b}`);
    if (ok) assert.ok('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'.includes(String.fromCharCode(watch.E2_CHAR[b])));
  }
  assert.equal(watch.E2_CHAR[10], 36); assert.equal(watch.E2_CHAR[44], 46); assert.equal(watch.E2_CHAR[61], 43);
  const ineligible = ['*Q2:2,Q3:1,EMO:50,75,25,100,50,0,75,50,25,MS:1,2,3,4,5,6,7,8,9,10,TIME:2026-07-30T14:22:09.331Z&\n',
    'pid:1234a\n', 'A$B\n', 'A.B\n', 'A+B\n', 'A\r\n', 'A&B\n', 'Ä\n'];
  for (const text of ineligible) { const b = encode(text); assert.equal(watch.e2Eligible(b, b.length), false, text); }
  const { bytes } = studyFile(30);
  assert.equal(watch.e2Eligible(bytes, bytes.length), true);
  const sample = encode('SAMPLE DATA, NOT A PARTICIPANT\n');
  assert.equal(watch.e2Eligible(sample, sample.length), true);
});
test('alphanumeric QR capacity and the byte-mode path are unchanged', () => {
  assert.equal(qrEncoder.alnumCapacity(17), 938); assert.equal(qrEncoder.byteCapacity(17), 644);
  const header = watch.exportHeaderE2('ffffffffffffffff-ffffffff', 9999, 9999, 1048576, 'ffffffff', false);
  assert.equal(header.length, 58); assert.ok(header.length + watch.E2_PAGE_BYTES <= 938);
  const full = encode('A'.repeat(938));
  assert.deepEqual(throughQR({ payload: full, alnum: true }), full);
  assert.throws(() => qrEncoder.encodeBytes(encode('A'.repeat(939)), 939, 17, 2, true), /too long/);
  assert.throws(() => qrEncoder.encodeBytes(encode('a'), 1, 17, 2, true), /Not alphanumeric/);
  const bytes = encode('E1|19a-a|1|1|5|12345678|D\nhello');
  assert.deepEqual(qrEncoder.encodeBytes(bytes, bytes.length, 17, 2).modules, qrEncoder.encodeBytes(bytes, bytes.length, 17, 2, false).modules);
  for (const n of [1, 2, 3, 937]) {   // odd and even lengths
    const p = encode('E2 1-1 1 1 0 00000000 D$'.slice(0, 0) + '0Z $%*+-./:'.repeat(100).slice(0, n));
    assert.deepEqual(throughQR({ payload: p, alnum: true }), p);
  }
});
test('100 and 150 study records: E2 pages through jsQR rebuild the exact file', () => {
  for (const [n, e2Pages, e1Pages] of [[100, 8, 13], [150, 12, 18]]) {   // 6,588 and 9,830 bytes
    const { bytes } = studyFile(n);
    const e2 = watchPages(bytes, true), e1 = watchPages(bytes, false);
    assert.equal(e2.length, e2Pages); assert.equal(e1.length, e1Pages);
    assert.ok(e2.every(p => p.alnum)); assert.ok(e1.every(p => !p.alnum));
    for (const pages of [e2, e1]) {
      const session = new ExportSession();
      for (const page of pages.slice().reverse()) {
        const scanned = throughQR(page);
        assert.deepEqual(scanned, page.payload);
        session.add(scanned); assert.equal(session.add(scanned).duplicate, true);
      }
      assert.deepEqual(session.verified, bytes);
      assert.equal(session.meta.protocol, pages[0].alnum ? 'E2' : 'E1');
      assert.equal(summarize(session.verified).records, n);
    }
  }
});
test('E2 page checks: corrupted, mixed with E1, wrong lengths', () => {
  const { bytes } = studyFile(40);
  const e2 = watchPages(bytes, true).map(p => p.payload), e1 = watchPages(bytes, false).map(p => p.payload);
  const session = new ExportSession(); session.add(e2[0]);
  assert.throws(() => session.add(e1[1]), /Different export/);
  assert.throws(() => parsePage(e2[0].slice(0, -1)), { code: 'unreadable' });
  const lower = e2[0].slice(); lower[lower.length - 1] = 97; assert.throws(() => parsePage(lower), { code: 'unreadable' });
  const bad = new ExportSession(), pages = e2.map(p => p.slice());
  pages[1][pages[1].length - 1] = pages[1][pages[1].length - 1] === 65 ? 66 : 65;
  assert.throws(() => pages.forEach(p => bad.add(p)), /checksum failed/);
  assert.equal(parsePage(e2[0]).payload.length, E2_PAGE_BYTES);
  assert.equal(PAGE_BYTES, watch.EXPORT_PAGE_BYTES); assert.equal(E2_PAGE_BYTES, watch.E2_PAGE_BYTES);
});
test('file with legacy and new records falls back to E1 and summarizes both', () => {
  const legacy = '*Q2:2,Q3:1,EMO:50,75,25,100,50,0,75,50,25,MS:1840,4102,5230,7710,9900,16400,18200,24050,25900,31200,TIME:2026-07-30T14:22:09.331Z&\n';
  const bytes = encode('PID:1234A\n' + legacy + 'POSTED\n' + line());
  const pages = watchPages(bytes, true);
  assert.equal(pages[0].alnum, false);
  const rows = decodeFile(bytes).rows;
  assert.deepEqual(rows.map(r => r.format), ['legacy', 'R']);
  assert.deepEqual(rows[0].emo, rows[1].emo); assert.deepEqual(rows[0].ms, rows[1].ms);
  assert.equal(rows[0].time, '2026-07-30 14:22:09.331');
  assert.equal(summarize(bytes).records, 2);
});
test('abandonment that is only partly marked is flagged', () => {
  assert.equal(summarize(encode(line(9, 9, Array(9).fill(999)))).needsReview, false);
  assert.equal(summarize(encode(line(9, 1, Array(9).fill(999)))).needsReview, true);
  assert.equal(summarize(encode(line(9, 9, [999, 999, 999, 999, 0, 999, 999, 999, 999]))).needsReview, true);
  assert.equal(summarize(encode(line(2, 1, [999, 50, 50, 50, 50, 50, 50, 50, 50]))).needsReview, true);
});
test('file name uses the last valid PID and the save date', () => {
  const now = new Date(2026, 10, 19, 14, 3);
  const meta = { id: '19a-1', kind: 'D' };
  const name = text => fileName(meta, decodeFile(encode(text)), now);
  assert.equal(name('PID:1234A\n' + line()), '1234A_esm_data_20261119.txt');
  assert.equal(name('PID:1234A\nPID:5678G\n' + line()), '5678G_esm_data_20261119.txt');
  assert.equal(name('PID:1234A\nPID:12X\n' + line()), '1234A_esm_data_20261119.txt');
  assert.equal(name(line()), 'NOPID_esm_data_20261119_19a-1.txt');
  assert.equal(fileName({ id: '1', kind: 'S' }, null, now), 'SAMPLE_esm_data_20261119.txt');
  assert.deepEqual(decodeFile(encode('PID:1234A\nPID:5678G\nPID:1234A\n')).pids, ['1234A', '5678G']);
});
test('readable CSV uses original scales, PID and Wake/Sleep in effect', () => {
  const text = line(-1, 0, [25, 888, 50, 75, 0, 0, 888, 100, 50]) + 'PID:1234A\nWS:MON=0800-2300,TUE=0800-2300\n' + line(9, 9, Array(9).fill(999), [2210, 5003, -1, -1, -1, -1, -1, -1, -1, -1]);
  const csv = readableCsv(decodeFile(encode(text)).rows).trim().split('\n');
  assert.equal(csv[0].split(',').length, 5 + 9 + 10 + 3);
  assert.deepEqual(csv[0].split(',').slice(5, 14), EMO_ITEMS);
  assert.equal(csv[1], ',2026-11-12 09:05,0,-1,0,25,888,50,75,0,0,888,100,50,1840,4102,5230,7710,9900,16400,18200,24050,25900,31200,,R,1');
  assert.equal(csv[2], '1234A,2026-11-12 09:05,1,9,9,999,999,999,999,999,999,999,999,999,2210,5003,-1,-1,-1,-1,-1,-1,-1,-1,"MON=0800-2300,TUE=0800-2300",R,4');
});
test('saved file holds the exact watch file and the readable copy', () => {
  const now = new Date(2026, 10, 19, 14, 3);
  for (const bytes of [studyFile(20).bytes, encode('PID:1234A\n' + line().trim()), Uint8Array.from({ length: 700 }, (_, i) => i % 256)]) {
    const meta = { protocol: 'E2', id: '19a-1', total: 1, crc: checksum(bytes), kind: 'D' };
    const saved = savedFile(bytes, meta, now, 'reader test');
    const original = extractOriginal(saved);
    assert.deepEqual(original, bytes); assert.equal(checksum(original), meta.crc);
    const text = new TextDecoder('latin1').decode(saved);
    assert.match(text, /^ESM WATCH EXPORT\n/);
    assert.match(text, new RegExp(`original: ${bytes.length} bytes, CRC-32 ${meta.crc}`));
    assert.ok(text.indexOf('---- END ORIGINAL WATCH FILE ----') < text.indexOf('---- BEGIN READABLE CSV ----'));
    assert.match(text, /---- END READABLE CSV ----\n$/);
  }
  const text = decodeText(savedFile(encode('PID:1234A\n' + line()), { protocol: 'E1', id: 'x', total: 1, crc: '0', kind: 'D' }, now, 'r'));
  assert.match(text, /pid: 1234A/);
  assert.match(text, /\n1234A,2026-11-12 09:05,0,2,1,50,75,25,100,50,0,75,50,25,/);
});
