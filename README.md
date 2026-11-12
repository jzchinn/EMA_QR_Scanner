# Watch data reader — GitHub Pages

A static, phone-first QR reader for the E1 and E2 watch exports. No server, Google
account integration, build step, analytics, or remote scanner scripts. The exact watch
file is reassembled and verified (E2's three documented character swaps are reversed;
see `PROTOCOL.md`), then saved together with a readable CSV decoded from it.

## Published site and updates

- Repository: https://github.com/jzchinn/EMA_QR_Scanner
- Researcher URL: https://jzchinn.github.io/EMA_QR_Scanner/
- Pages configuration: **Deploy from a branch → main → /(root)**.
- Local reader version: **v1.3.1** (v1.3 is live until v1.3.1 is uploaded). Wire
  protocols: **E1** and **E2**.
- After deployment, reload Safari and look for **E1/E2 · v1.3.1** beside Scan the watch.
- Publish v1.3 **before** exporting from a watch build that offers Compressed:
  older readers reject E2 pages as unreadable. v1.3 still reads every E1 export.

v1.3 was published on 2026-11-11; afterward the live index.html, style.css,
reader.mjs, and protocol.mjs matched local source byte-for-byte. That is deployment
verification; a first one-page E2 export from the watch was then scanned and saved
with it. Researchers open the HTTPS URL in Safari and need no GitHub account.

**Every release must change the URLs of changed modules.** Pages caches files for
about 10 minutes, and a phone can combine a new `reader.mjs` with a cached old
`protocol.mjs`; the import then fails and Start scanning silently does nothing
(happened once with v1.3; status stays "Ready for the first page."). `index.html`
loads `reader.mjs?v=…`; v1.3 imported `./protocol.mjs` with no version, and v1.3.1
imports `./protocol.mjs?v=1.3.1`. When releasing, bump `?v=` in `index.html` and on
the `protocol.mjs` import (or rename the file), and update the badge and
`READER_VERSION` together. If a phone still shows dead buttons, clear Safari's
website data for the site and reopen.

Canonical local source is `tools/phone-reader/` inside the watch workspace. Upload
its contents to the repository root, preserving `vendor/`:

- `index.html`, `style.css`, `reader.mjs`, `protocol.mjs`
- `vendor/` (decoder and license)
- `README.md`, `PROTOCOL.md`, `THIRD_PARTY.md`, `.nojekyll`

Do not upload `tests/`, `.DS_Store`, the whole watch project, companion credentials,
participant data, the enclosing folder, or a ZIP. (A `tests/` folder of synthetic
data was uploaded with v1.3 by mistake; it is harmless and may be deleted.) The
optional `tools/phone-reader-github.zip` predates v1.3 and is stale; upload from
canonical source instead. It contained only the hosting files above, excluding tests. Extract it if using
the ZIP workflow; uploading directly from canonical source needs no extraction.
Existing extracted `phone-reader-github` folders can be stale. ZIP extraction may
preserve source timestamps, so modification time alone does not identify a version.

For updates, upload replacements at the same paths and **Commit changes** to
`main`. Replacing all hosting files is fine; Git compares file contents. Commits
trigger deployment automatically: there is no separate republish step. Check the
repository's **Actions** tab for the Pages deployment, then reload Safari before
starting a new export. If the old UI persists, close/reopen the tab after deployment.

The browser uploader may reject hidden files even after Finder shows them. Leave
an existing `.nojekyll` alone. If absent, use **Add file → Create new file**, name it
`.nojekyll`, add a harmless line if needed, and commit. Do not repeatedly drag hidden
files into an empty upload form.

For a replacement repository, upload the same root contents, then select the Pages
configuration above under **Settings → Pages**. Use the URL GitHub supplies and
HTTPS. [Official GitHub Pages instructions](https://docs.github.com/en/pages/quickstart).

## Watch prerequisite

The old `1/3` test QR codes cannot provide whole-file integrity verification. This
reader deliberately rejects them rather than calling an unverified file verified.
Build and install the current watch project, including `app/export-format.js`
and the current `app/transfer.js`. The visible watch label such as `SAMPLE 1/3`
is not the encoded header and cannot identify an old build. QR rendering remains
version 17, 3 pixels/module. Updating the website alone cannot change watch
behavior; a watch build that offers Compressed needs reader v1.3 or later.

The watch's Data transfer first asks **Compressed** (default) or **Uncompressed**,
then **Go**. E1 pages hold up to 548 file bytes; E2 pages (Compressed, when the file
allows it) hold 870. About 100 surveys in the compact record format (~6.6 KB) take
8 E2 or 13 E1 pages. The watch label shows `E1` or `E2` on each page; Compressed
falls back to E1 for files with old-format records. When `counter.txt` is
absent or empty, the current watch app exports a built-in synthetic sample.
Its 100 records take **8 E2 pages** or **12 E1 pages**. Both modes should
recover 6,317 original bytes with CRC-32 `616d3105`. The saved filename
starts with `SAMPLE_`.

## Researcher workflow

1. Open Data transfer on the watch and this reader in Safari. Tap Start scanning
   and allow camera access. Scan with the webpage, not the iPhone Camera search link.
2. Line the framing box up with the edges of the QR, then move the phone slowly
   toward the watch until the page is captured (user-observed on iPhone: capture is
   reliable once the box is about 20% inside the code; starting that close can leave
   the phone on a camera that scans poorly). The reader scans a larger area around
   the box at camera resolution, then falls back to the full frame. Advance the watch when the count increases.
   Order does not matter.
3. A green message below the camera confirms each captured page. Identical duplicates
   do not increase the count or flash the border again. If needed, choose **Scan a photo instead**; the page immediately reports whether
   the selected photo decoded. An unreadable photo is not a captured page.
4. After every page arrives, the reader checks the file's byte length and CRC-32,
   says whether the export was compressed (E2) or uncompressed (E1), and shows a
   summary: PID, number of surveys (abandoned), first and last survey time. Check
   it before clearing the watch. Sample exports are clearly labeled. Unexpected
   record formats produce warnings but all original bytes remain in the saved file.
5. The file is named `<PID>_esm_data_<YYYYMMDD>.txt` from the last `PID:` line and
   today's date (`NOPID_…` if the watch has no PID). It holds a short header, the
   exact watch file, and a readable CSV (format in `PROTOCOL.md`). Tap **Save file**, choose
   **Drive** in the share options, and pick the study folder (Google Drive app
   installed and signed in). **Save to Files** remains available. Where file
   sharing is unavailable, the same button downloads.
   A non-cancellation sharing error makes the next tap use the download fallback.
   Downloads may go to iCloud Drive or On My iPhone according to device settings.
6. Confirm the file appears in the study Drive folder before clearing the watch.
   v1.3 also passed a share title, which Drive saved as an extra
   `Watch export.txt` containing only that text; v1.3.1 removes the title. The reader does not claim a save succeeded
   merely because the save options opened. There is no confirmation checkbox.
7. Press and release the watch's side button to return from Data transfer to the
   main menu. It cancels pending transfer work; it does not delete survey data.
   Exiting during synchronous encoding may wait until that encoding call returns.
   Data is deleted only by the watch's Setup → Clear (two confirmations).
   Use **Start new export** on the phone before scanning another export.

Keep the tab open until saving. Scans are held in memory only. Reload, tab eviction,
closing the page, or restarting Safari can lose them; rescan with the watch present.
Backgrounding pauses the camera but preserves scans while the tab remains alive.
The page does not guarantee offline loading. Do not rely on a browser cache as a backup.

The application has no upload requests, analytics, or external scripts. The hosting
provider receives ordinary website requests (including IP information), but the
reader does not transmit scanned photos, survey records, or file labels. Files saved
to iCloud or shared to another app follow the phone's settings and the user's choice.
A public reader does not provide access to other researchers' local scanning sessions.

## Checks and remaining validation

In the original watch workspace, run:

```sh
node --test tools/phone-reader/tests/*.test.mjs
```

Tests use the actual pure watch encoder/framing/record helpers and bundled jsQR decoder.
`protocol.test.mjs` (E1) covers 150 records, raw-byte/UTF-8 boundaries, reverse order,
duplicates, missing/conflicting/mixed pages, CRC failures, invalid headers, limits, and
warnings. `compact.test.mjs` covers every legal and illegal record value, 100,000
random records, the E2 character table, alphanumeric QR capacity, 100/150-record E2
and E1 exports through jsQR, E1/E2 mixing, PID file names, the CSV, and recovering
the exact watch file from a saved file.
They do not simulate Fitbit filesystem APIs, device scheduling, or a real camera.
The tests reference the parent watch source and are not included in the hosting zip.

On 2026-11-11, the user scanned one real survey in E2 and the 100-record
sample in both E2 and E1 on a physical Versa 2 with the live v1.3 reader.
The two sample exports had byte-identical originals and CSVs. The CSV
contained 90 completed surveys and 10 synthetic abandonments.

Remaining device checks before study use:

- A 150-record export and timed full-file scans in both modes.
- Automatic E1 fallback when Compressed is selected on a legacy file.
- Saving and exporting real surveys with an untouched slider or abandonment.
- Missing/duplicate/out-of-order pages and a page from another export.
- Permission denied, camera pause/resume, backgrounding, and restarting an export.
- Save to Files, cancel sharing, download fallback, reopen the file, and manual Drive upload.

Desktop preview (not a phone-accessible HTTPS deployment):

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory tools/phone-reader
```

Open http://127.0.0.1:8765 on that computer. A local file double-click is not sufficient
for browser modules/camera access. Use the published HTTPS page on the phone.

## Reader v1.1 / watch navigation update (history; still current behavior)

The watch hides the previous QR immediately on accepted page navigation and displays
Generating / Please wait until the new image is ready. The side-button release is
handled before the survey keyup handler; default button behavior remains prevented.
Transfer exit cancels the pending timeout, closes an open image descriptor, releases
encoder references, hides the transfer screen, and restores prior display settings.
Re-entry resets image bookkeeping and creates fresh export metadata. Survey handlers
are unchanged apart from the transfer-only early return.

Unreadable-header errors now offer distance/framing guidance near the camera rather
than asserting the watch has an old build. Live guidance requires three consecutive
invalid decoded frames and waits 1.8 seconds after a successful capture. A single
unreadable photo gives guidance immediately. A failed decode is not evidence of an
old build; blur, cropping, or a false decode are possible but unconfirmed causes.
Mixed-export and whole-file verification failures remain distinct actionable errors.

Step 2 retains completeness/integrity checks but hides technical metadata. Sample
files remain identified, and meaningful record-format warnings remain visible.
The long footer and save checkbox were removed. Protocol E1 and the saved bytes
are unchanged; use the revised watch build for hiding and side-button navigation.

Validation: all ten desktop protocol checks pass. In a 390×844 browser viewport,
synthetic photo scans confirmed the visible capture banner, duplicate handling,
final completion state, single Save button, and cancellation message. Native iPhone
saving and watch cancellation still require physical-device checks. Watch exit was
hand-traced during the initial delay, checksum reads, between image batches, after
image display, and across re-entry; no Fitbit build or device simulation was run.
