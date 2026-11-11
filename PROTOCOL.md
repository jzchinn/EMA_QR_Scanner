# E1 raw-byte export protocol

This implemented E1 framing supersedes the earlier compact/Base32 proposal for this
version. No compact-format implementation was released. Future incompatible framing
must use a new version prefix.

Reader UI release v1.1 does not change this E1 wire format. The visible watch
status label is separate from the encoded header. A rejected header alone does
not establish an old watch build; an invalid camera decode can also cause it.

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
- `kind`: S for sample.txt fallback; D for counter.txt. Included on every page.
- Header including LF: at most 96 bytes. Current maximum legal header is smaller.
- Body: exactly 548 bytes except the final page, which holds the remainder.

The phone uses jsQR `binaryData`, not its decoded text. It concatenates only body
bytes and does not insert line breaks, strip CR, or decode/re-encode UTF-8. File bytes
may contain newlines or arbitrary binary values. Text decoding is only for the
post-verification record summary; save uses the original Uint8Array.

One phone session accepts one matching metadata tuple. A different tuple is rejected
without discarding existing pages. Identical duplicates are ignored. Conflicting
copies invalidate the session. All page indexes, lengths, and the full checksum must
pass before saving. A checksum failure requires a fresh scan; it cannot identify the
bad page. CRC detects accidental corruption, not malicious tampering or authenticity.

Watch preparation reads 512 bytes per event-loop turn and computes the checksum with
bounded storage. It detects file size changes before each read/page; the whole-file
checksum also detects inconsistent page contents unless a CRC collision occurs.
`readSync` return-count checks apply when the runtime provides a numeric count:
Fitbit's API reference documents the arguments but does not specify the return value.
Device I/O remains subject to physical-watch validation.

Record summaries are structural checks, not statistical or clinical validation.
Unrecognized lines are preserved, and successful export does not establish that the
watch collected every expected survey. The known TIME timezone labeling remains
unchanged. Raw MS precision and sentinels are preserved.
