# Watch export protocols (E1, E2), record codebook, and saved file

The watch's Data transfer screen offers **Compressed** (default) or **Uncompressed**.
Uncompressed always sends E1. Compressed sends E2 when every byte of the file can be
carried by it, and otherwise falls back to E1 automatically. The reader accepts both
and tells them apart by the first characters of each QR (`E1|` or `E2 `). Both carry
the exact watch file; the reader verifies length and CRC-32 of the original bytes.
Future incompatible framing must use a new version prefix.

Reader UI release v1.3 adds E2, the record decoder, PID file naming, and the combined
saved file. The visible watch status label is separate from the encoded header. A
rejected header alone does not establish an old watch build; an invalid camera
decode can also cause it.

## E1: raw bytes, QR byte mode

QR mode: byte. Version 17, correction L, mask 2. Maximum QR payload: 644 bytes.
Every QR holds an ASCII header terminated by LF, followed immediately by file bytes:

```
E1|export-id|page|total|file-size|crc32|kind\n<raw bytes>
```

- `export-id`: watch `Date.now().toString(16)`, hyphen, random unsigned 32-bit integer
  in lowercase hex. Timestamp portion 1–16 hex digits, random portion 1–8. Fixed for
  the current Data transfer entry; not a participant ID, secure nonce, or guaranteed
  unique identity. Size/checksum/kind also have to agree across pages.
- `page`: one-based decimal integer, no leading zeros, at most four digits.
- `total`: ceil(file-size / 548), same decimal representation.
- `file-size`: exact original byte length, 1 through 1,048,576.
- `crc32`: eight lowercase hex digits. CRC-32/ISO-HDLC, reflected polynomial
  0xEDB88320, initial state 0xFFFFFFFF, final XOR 0xFFFFFFFF. Computed over the
  entire original file, excluding all headers. Check vector `123456789` → cbf43926.
- `kind`: S for the built-in sample (`sample100.txt` in the current watch app);
  D for `counter.txt`. Included on every page.
- Header including LF: at most 96 bytes. Current maximum legal header is smaller.
- Body: exactly 548 bytes except the final page, which holds the remainder.

## E2: same bytes, QR alphanumeric mode

QR mode: alphanumeric (45 characters: `0-9 A-Z space $ % * + - . / :`, 11 bits per
pair). Version 17, correction L, mask 2 — the same image as E1. Maximum: 938 characters.

```
E2 EXPORT-ID PAGE TOTAL FILE-SIZE CRC32 KIND$<body>
```

- Fields as E1, but space-separated, with the export ID and CRC in uppercase hex.
  The header ends at the first `$`; at most 58 characters.
- `TOTAL` = ceil(file-size / 870). Body: exactly 870 characters except the last page.
- Body = the file bytes with three one-for-one swaps: newline → `$`, `,` → `.`,
  `=` → `+`. Every other byte is sent as itself.
- The watch uses E2 only if every file byte is one of `0-9 A-Z space % * - / :`,
  newline, `,` or `=`. An eligible source contains none of `$ . +`, so the swaps
  are reversible. The current sample is E2-eligible. Old `*Q2:` records
  and the legacy sample contain ineligible bytes and force E1.
- The reader reverses the swaps, reassembles by 870-character pages, then checks
  file-size and CRC-32 exactly as for E1 (compared in lowercase).

## Reader behaviour (both protocols)

The phone uses jsQR `binaryData`, not its decoded text (for alphanumeric segments
jsQR also returns the character codes as bytes). It concatenates only body bytes and
does not insert line breaks, strip CR, or decode/re-encode UTF-8 (E2 differs only by
the three documented swaps). File bytes may contain newlines or arbitrary binary
values (E1). Text decoding is only for the record summary and the readable section.

One phone session accepts one matching metadata tuple, including the protocol. A
different tuple is rejected without discarding existing pages. Identical duplicates
are ignored. Conflicting copies invalidate the session. All page indexes, lengths,
and the full checksum must pass before saving. A checksum failure requires a fresh
scan; it cannot identify the bad page. CRC detects accidental corruption, not
malicious tampering or authenticity.

Watch preparation reads 512 bytes per event-loop turn, computes the checksum and
E2 eligibility with bounded storage, and detects file size changes before each
read/page. `readSync` return-count checks apply when the runtime provides a numeric
count. Device I/O remains subject to physical-watch validation.

## Survey record codebook (`app/record-format.js`)

Since this release the watch writes each survey as one line of space-separated fields:

```
R <TIME> <ANSWERS> <MS1> <MS2> ... <MS10>
R HPSNY 54231420321 1F4 35Y 41A 5Y6 7N0 CNK E1K IK2 JZG O2O
```

| Field | Encoding | Decode |
|---|---|---|
| `R` | Survey record | — |
| `TIME` | Local wall-clock minutes since 1970-01-01 00:00, base 36, uppercase (5 characters until 2084). Stamped at save, after the 2-second checkmark. | `int(TIME, 36)` minutes after 1970-01-01 00:00, read as local time. `HPSNY` → 2026-07-30 14:22 |
| `ANSWERS` | 11 digits: Q2, Q3, then EMO1–EMO9 | below |
| Q2, Q3 | Original −3…+3 **plus 3** (0–6, 3 = neutral); abandoned = 9 (not shifted) | `9` → 9, else digit − 3 |
| EMO1–9 | Original 0/25/50/75/100 **÷ 25** (0–4); untouched (888) = 8; abandoned (999) = 9 | `8` → 888, `9` → 999, else digit × 25 |
| `MS1`–`MS10` | The same integers as the former `MS:` field (ms from survey start), base 36, uppercase; `-1` = never happened; other negatives keep their sign | `int(MS, 36)` |

EMO order: Energetic, Happy, At Ease (Q1A); Angry, On Edge, Sad (Q1B); Thankful,
Lonely, Guilty (Q1C). MS order: (first touch, completed) for Q2, Q3, Q1A, Q1B, Q1C.
A value outside these tables is written as `E`; such a line is malformed by design.

Decoding without the reader — spreadsheet: `=DECIMAL("1F4",36)` → 1840; negative-safe:
`=IF(LEFT(A1)="-",-DECIMAL(MID(A1,2,9),36),DECIMAL(A1,36))`; time:
`=DATE(1970,1,1)+DECIMAL("HPSNY",36)/1440` (formulas not yet tried). Python:

```python
from datetime import datetime, timedelta
def decode(line):
    r, t, a, *ms = line.split(" ")
    assert r == "R" and len(a) == 11 and len(ms) == 10
    q = lambda c: 9 if c == "9" else int(c) - 3
    e = lambda c: {"8": 888, "9": 999}.get(c, int(c) * 25 if c in "01234" else None)
    return dict(time=datetime(1970, 1, 1) + timedelta(minutes=int(t, 36)),
                q2=q(a[0]), q3=q(a[1]), emo=[e(c) for c in a[2:]],
                ms=[int(x, 36) for x in ms])
```

Earlier builds wrote `*Q2:2,Q3:1,EMO:50,…,MS:1840,…,TIME:2026-07-30T14:22:09.331Z&`
(local time mislabeled `Z`); the reader still recognizes and decodes those lines.
Other lines (`PID:`, `WS:`, `POSTED`, the sample banner) are retained and counted.

Review warnings never block saving: malformed survey lines (including any `E`),
records only partly marked abandoned, record times outside 2026–2030 (watch clock),
and a missing final newline.

## Saved file (one file per export)

Named `<PID>_esm_data_<YYYYMMDD>.txt` (phone date at save; PID = last valid `PID:`
line, pattern `^\d{4}[A-Z]$`, the watch's own rule). No PID:
`NOPID_esm_data_<date>_<export-id>.txt`. Sample: `SAMPLE_esm_data_<date>.txt`.

```
ESM WATCH EXPORT
pid: 1234A
saved: 2026-11-19 14:03 (phone time)
export: E2 19a6f3c2d10-abcdef01, 8 page(s)
original: 6588 bytes, CRC-32 0a1b2c3d
reader: reader v1.3
(two explanatory lines)
---- BEGIN ORIGINAL WATCH FILE ----
<exactly 6588 bytes: the watch's counter.txt>
---- END ORIGINAL WATCH FILE ----
---- BEGIN READABLE CSV ----
pid,local_time,abandoned,q2,q3,energetic,…,guilty,q2_touch_ms,q2_done_ms,…,q1c_done_ms,wake_sleep,format,line
1234A,2026-11-12 09:05,0,2,1,50,75,25,100,50,0,75,50,25,1840,4102,…,31200,"MON=0800-2300,…",R,3
---- END READABLE CSV ----
```

- **Original section** = the `original:` byte count of bytes immediately after the
  `BEGIN ORIGINAL` line. The reader always writes one newline after them, before the
  `END ORIGINAL` line. Its CRC-32 must equal the header value. `extractOriginal()` in
  `protocol.mjs` does this; in Python: `start = data.index(b"---- BEGIN ORIGINAL WATCH FILE ----\n") + 36; original = data[start:start + size]`.
- **Readable section** = CSV derived by the reader: one row per survey record (new and
  old formats), original scales and sentinels (Q −3…3/9; EMO 0–100/888/999; MS
  integers/−1), the PID and Wake/Sleep in effect at that line, the record format
  (`R`/`legacy`), and the line number in the original. The original section is the
  data of record; the readable section can always be regenerated from it.

Record summaries are structural checks, not statistical or clinical validation, and
a successful export does not establish that the watch collected every expected survey.
