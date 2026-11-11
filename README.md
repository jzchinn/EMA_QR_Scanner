# Watch data reader — GitHub Pages

A static, phone-first QR reader for the E1 watch export. No server, Google account
integration, build step, analytics, or remote scanner scripts. Raw QR bytes are
assembled and saved without text normalization, rounding, or record filtering.

## Published site and updates

- Repository: https://github.com/jzchinn/EMA_QR_Scanner
- Researcher URL: https://jzchinn.github.io/EMA_QR_Scanner/
- Pages configuration: **Deploy from a branch → main → /(root)**.
- Local reader version: **v1.2**. Wire protocol: **E1**.

On 2026-11-11, the live index.html, style.css, reader.mjs, and protocol.mjs matched
local v1.1 source byte-for-byte. This is deployment verification, not device testing.
Researchers open the HTTPS URL in Safari and need no GitHub account.

Canonical local source is `tools/phone-reader/` inside the watch workspace. Upload
its contents to the repository root, preserving `vendor/`:

- `index.html`, `style.css`, `reader.mjs`, `protocol.mjs`
- `vendor/` (decoder and license)
- `README.md`, `PROTOCOL.md`, `THIRD_PARTY.md`, `.nojekyll`

Do not upload the whole watch project, companion credentials, participant data,
the enclosing folder, or a ZIP. The optional `tools/phone-reader-github.zip`
contains only the ten hosting files above, excluding tests. Extract it if using
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
version 17, 3 pixels/module. Reader v1.1 also accompanies watch navigation changes;
updating the website alone cannot change watch behavior.

Each page holds up to 548 original file bytes. A 23,000-byte file needs 42 pages;
there is no compression yet. The existing 1,603-byte sample needs three pages.

## Researcher workflow

1. Open Data transfer on the watch and this reader in Safari. Tap Start scanning
   and allow camera access. Scan with the webpage, not the iPhone Camera search link.
2. Fit the whole QR and its white border inside the framing box and hold steady.
   The reader scans a larger area around the box at camera resolution, then
   falls back to the full frame. Advance the watch when the count increases.
   Order does not matter.
3. A green message below the camera confirms each captured page. Identical duplicates
   do not increase the count or flash the border again. If needed, choose **Scan a photo instead**; the page immediately reports whether
   the selected photo decoded. An unreadable photo is not a captured page.
4. After every page arrives, the reader checks the file's byte length and CRC-32.
   Sample exports are clearly labeled. Unexpected record formats produce warnings
   but all original bytes remain in the saved file.
5. Optionally enter a study ID as the file label. Tap **Save file** and choose
   **Save to Files**. Where file sharing is unavailable, the same button downloads.
   A non-cancellation sharing error makes the next tap use the download fallback.
   Downloads may go to iCloud Drive or On My iPhone according to device settings.
6. Open the resulting `.txt` in Files and confirm it is accessible, then manually
   upload it to the study Drive folder. The reader does not claim a save succeeded
   merely because the save options opened. There is no confirmation checkbox.
7. Press and release the watch's side button to return from Data transfer to the
   main menu. It cancels pending transfer work; it does not delete survey data.
   Exiting during synchronous encoding may wait until that encoding call returns.
   Setup → PID is built; Wake/Sleep and data clearing remain unfinished features.
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
node --test tools/phone-reader/tests/protocol.test.mjs
```

Tests use the actual pure watch encoder/framing helpers and bundled jsQR decoder.
They cover 150 records, raw-byte/UTF-8 boundaries, reverse order, duplicates,
missing/conflicting/mixed pages, CRC failures, invalid headers, limits, and warnings.
They do not simulate Fitbit filesystem APIs, device scheduling, or a real camera.
The tests reference the parent watch source and are not included in the hosting zip.

Before study use, test on the physical Versa 2 and each supported iPhone:

- Full sample scan and saved-file comparison, then a 150-record export.
- Missing/duplicate/out-of-order pages and a page from another export.
- Permission denied, camera pause/resume, backgrounding, and restarting an export.
- Save to Files, cancel sharing, download fallback, reopen the file, and manual Drive upload.
- Record full-file scan time. If dozens of pages are impractical, evaluate compression
  as a separate watch change without sacrificing exact byte reconstruction.

Desktop preview (not a phone-accessible HTTPS deployment):

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory tools/phone-reader
```

Open http://127.0.0.1:8765 on that computer. A local file double-click is not sufficient
for browser modules/camera access. Use the published HTTPS page on the phone.

## Reader v1.1 / watch navigation update

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
