# Watch data reader — GitHub Pages

A static, phone-first QR reader for the E1 watch export. No server, Google account
integration, build step, analytics, or remote scanner scripts. Raw QR bytes are
assembled and saved without text normalization, rounding, or record filtering.

## Publish a new repository

1. Create a new **public** GitHub repository, for example `ema-watch-reader`, in the
   lab's or maintainer's GitHub account. Public repositories support GitHub Pages
   on GitHub Free. Do not upload the entire Fitbit project: it includes companion
   credentials and other files that do not belong on a public website.
2. Upload these files from this folder into the repository root:
   - `index.html`, `style.css`, `reader.mjs`, `protocol.mjs`, `.nojekyll`
   - `vendor/` (both the decoder and its license)
   - `README.md`, `PROTOCOL.md`, `THIRD_PARTY.md`
   The prepared `tools/phone-reader-github.zip` contains exactly these files.
   Extract it first; upload its contents, not the zip itself. Preserve `vendor/`.
3. Commit the files to `main`. Under **Settings → Pages**, choose **Deploy from a
   branch**, select **main** and **/(root)**, and save. Enable **Enforce HTTPS** if
   the option is offered. Wait for GitHub to display the published URL.
4. Open `https://YOUR-ACCOUNT.github.io/ema-watch-reader/` in Safari on the iPhone.
   Use the actual URL shown by GitHub. Test before distributing it to researchers.
5. Put that link in the study instructions. Researchers need no GitHub account.
   Later updates use the same URL; refresh before starting a new scanning session.

Official instructions: https://docs.github.com/en/pages/quickstart
No repository has been created or published by preparing these files.

## Watch prerequisite

The old `1/3` test QR codes cannot provide whole-file integrity verification. This
reader deliberately rejects them rather than calling an unverified file verified.
Build and sideload the updated watch project, which adds `app/export-format.js`
and changes only export preparation/page framing in `app/transfer.js`.
QR rendering remains version 17, 3 pixels/module. Survey collection is unchanged.

Each page holds up to 548 original file bytes. A 23,000-byte file needs 42 pages;
there is no compression yet. The existing 1,603-byte sample needs three pages.

## Researcher workflow

1. Open Data transfer on the watch and this reader in Safari. Tap Start scanning
   and allow camera access. Scan with the webpage, not the iPhone Camera search link.
2. Keep the whole QR in view, hold steady, and advance the watch when the count
   increases. Order does not matter. Identical duplicate scans are ignored.
3. If needed, choose **Scan a photo instead**; the page immediately reports whether
   the selected photo decoded. An unreadable photo is not a captured page.
4. After every page arrives, the reader checks the file's byte length and CRC-32.
   Sample exports are clearly labeled. Unexpected record formats produce warnings
   but all original bytes remain in the saved file.
5. Optionally enter a study ID as the file label. Choose **Save / share file** and
   **Save to Files**, or use **Download file**. Exact iOS destinations depend on the
   device. Downloads may go to iCloud Drive or On My iPhone according to settings.
6. Open the resulting `.txt` in Files and confirm it is accessible. Return to the
   reader and check the confirmation box. A share/download request alone is not
   evidence that the researcher completed saving. Upload to the study Drive folder.
7. Only then follow the study's data-clearing procedure. This reader never clears
   the watch. Use Start new export for the next watch.

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
