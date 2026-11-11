import { ExportSession, parsePage, summarize } from './protocol.mjs';
const el = id => document.getElementById(id);
let session = new ExportSession();
let stream = null, timer = null, cameraGeneration = 0, sessionGeneration = 0;
let downloadingUrl = null;
let captureTimer = null, lastCaptureAt = 0, unreadableFrames = 0;
let downloadOnly = false, saving = false, hasSaveRequest = false;
const canvas = el('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
const scanGuide = el('scanGuide');
const LIVE_MAX_SIDE = 1280;

function error(message) { el('error').textContent = message; el('error').hidden = !message; }
function stopCamera() {
  cameraGeneration++;
  clearTimeout(timer);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  el('video').srcObject = null;
  if (scanGuide) scanGuide.hidden = true;
  el('cameraHint').hidden = false;
  el('pause').disabled = true;
  el('start').disabled = Boolean(session.verified || session.failed);
  el('start').textContent = session.pages.size ? 'Resume scanning' : 'Start scanning';
}
function feedback(message, kind = '') {
  const banner = el('scanFeedback');
  if (banner.textContent !== message) banner.textContent = message;
  banner.className = 'scan-feedback' + (kind ? ' ' + kind : '');
}
function captured(page, duplicate) {
  if (!duplicate) {
    lastCaptureAt = Date.now();
    clearTimeout(captureTimer);
    el('camera').classList.add('captured');
    captureTimer = setTimeout(() => el('camera').classList.remove('captured'), 1400);
  }
  feedback(session.verified ? '✓ All pages captured' : `✓ Page ${page} captured — advance the watch`, 'success');
}
function update() {
  const m = session.meta;
  el('progress').max = m ? m.total : 1;
  el('progress').value = session.pages.size;
  const missing = session.missing();
  el('missing').textContent = m && missing.length ? `Missing pages: ${missing.slice(0, 80).join(', ')}${missing.length > 80 ? ' …' : ''}` : '';
  const verified = Boolean(session.verified && !session.failed);
  el('save').disabled = !verified || saving;
  el('photo').disabled = verified || session.failed;
  el('reviewWarning').hidden = !verified || !summarize(session.verified).needsReview;
  if (session.failed) {
    el('status').textContent = 'Verification failed — start a new export and rescan.';
    el('saveStatus').textContent = 'Keep the watch data. Saving is blocked until verification succeeds.';
    feedback('Verification failed — rescan this export', 'guidance');
    stopCamera();
  } else if (verified) {
    stopCamera();
    el('status').textContent = m.kind === 'S' ? 'Sample file received and verified — not participant data.' : 'Complete file received and verified.';
    el('saveStatus').textContent = 'Ready to save.';
  } else el('status').textContent = m ? `${session.pages.size} of ${m.total} pages received` : 'Waiting for pages.';
}
function accept(code, fromPhoto = false) {
  try {
    const outcome = session.add(code.binaryData);
    unreadableFrames = 0;
    error('');
    if (!outcome.duplicate) update();
    captured(outcome.page, outcome.duplicate);
  } catch (e) {
    if (e.code === 'unreadable') {
      unreadableFrames++;
      // A bad frame must not immediately replace a successful capture cue.
      if (fromPhoto || (unreadableFrames >= 3 && Date.now() - lastCaptureAt >= 1800)) {
        feedback('Couldn’t read this page. Move slightly farther away, keep the whole code visible, and hold steady.', 'guidance');
      }
    } else { error(e.message); update(); }
  }
}
function decode(source, width, height, maxSide, x = 0, y = 0) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  context.drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
}
function decodeVideo(video) {
  const { videoWidth: width, videoHeight: height } = video;
  if (!scanGuide) return decode(video, width, height, LIVE_MAX_SIDE);
  const side = Math.max(1, Math.min(LIVE_MAX_SIDE, Math.floor(Math.min(width, height) * 0.8)));
  const x = Math.floor((width - side) / 2);
  const y = Math.floor((height - side) / 2);
  // The square preview contains the video, so its width represents the frame's long side.
  scanGuide.style.width = `${100 * side / Math.max(width, height)}%`;
  scanGuide.hidden = false;
  const centered = decode(video, side, side, side, x, y);
  if (centered) {
    try {
      parsePage(centered.binaryData);
      return centered;
    } catch (e) {
      if (e.code !== 'unreadable') throw e;
    }
  }
  return decode(video, width, height, LIVE_MAX_SIDE) || centered;
}
function scan(generation) {
  if (generation !== cameraGeneration || !stream) return;
  try {
    const video = el('video');
    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      const code = decodeVideo(video);
      if (code) accept(code);
      else unreadableFrames = 0;
    }
  } catch (e) { error(`Camera decoding stopped: ${e.message}. Try a photo or resume scanning.`); stopCamera(); }
  if (generation === cameraGeneration && stream) timer = setTimeout(() => scan(generation), 250);
}
el('start').addEventListener('click', async () => {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    error('Camera access requires HTTPS. Open the published GitHub Pages link in Safari, or scan a photo below.'); return;
  }
  if (typeof window.jsQR !== 'function') { error('Scanner library did not load. Reload the page before scanning.'); return; }
  stopCamera();
  const generation = cameraGeneration;
  el('start').disabled = true;
  el('pause').disabled = false;
  error('');
  let acquired = null;
  try {
    acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    if (generation !== cameraGeneration) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired;
    el('video').srcObject = stream;
    await el('video').play();
    if (generation !== cameraGeneration) return;
    el('cameraHint').hidden = true;
    scan(generation);
  } catch (e) {
    if (acquired) acquired.getTracks().forEach(t => t.stop());
    if (generation !== cameraGeneration) return;
    stopCamera();
    error(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in Safari, then retry; or scan a photo.' : `Could not start camera: ${e.message}`);
  }
});
el('pause').addEventListener('click', stopCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
window.addEventListener('pagehide', stopCamera);
el('photo').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  stopCamera();
  const generation = sessionGeneration;
  const url = URL.createObjectURL(file);
  try {
    if (typeof window.jsQR !== 'function') throw new Error('Scanner library did not load. Reload before scanning.');
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Could not open this photo. Try a JPEG or PNG.')); img.src = url; });
    if (generation !== sessionGeneration) return;
    const code = decode(img, img.naturalWidth, img.naturalHeight, 2000);
    if (!code) throw new Error('No readable QR found. Retake the photo with the code larger, sharp, and free of glare.');
    accept(code, true);
  } catch (e) { if (generation === sessionGeneration) error(e.message); }
  finally { URL.revokeObjectURL(url); event.target.value = ''; }
});
function makeFile() {
  if (!session.verified || session.failed) throw new Error('Complete verification before saving.');
  const label = el('label').value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const prefix = session.meta.kind === 'S' ? 'SAMPLE' : 'counter';
  return new File([session.verified], `${prefix}${label ? '-' + label : ''}-${session.meta.id}.txt`, { type: 'text/plain' });
}
function saveRequested() {
  hasSaveRequest = true;
  el('saveStatus').textContent = 'Open the saved file in Files before clearing the watch.';
}
function download() {
  const file = makeFile();
  if (downloadingUrl) URL.revokeObjectURL(downloadingUrl);
  downloadingUrl = URL.createObjectURL(file);
  const link = document.createElement('a'); link.href = downloadingUrl; link.download = file.name;
  document.body.append(link); link.click(); link.remove();
  saveRequested();
}
el('save').addEventListener('click', async () => {
  const generation = sessionGeneration;
  if (saving) return;
  saving = true;
  el('save').disabled = true;
  error('');
  try {
    const file = makeFile();
    if (!downloadOnly && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Watch export' });
      if (generation === sessionGeneration) saveRequested();
    } else download();
  } catch (e) {
    if (generation !== sessionGeneration) return;
    if (e.name === 'AbortError') el('saveStatus').textContent = 'Save cancelled. Tap Save file to try again.';
    else {
      downloadOnly = true;
      el('saveStatus').textContent = 'Could not open save options. Tap Save file again to download.';
    }
  } finally {
    if (generation === sessionGeneration) {
      saving = false;
      el('save').disabled = !session.verified || session.failed;
    }
  }
});
el('reset').addEventListener('click', () => {
  if (session.pages.size && !confirm('Discard this scanning session and start a new export? Save the current file first if needed. This does not clear the watch.')) return;
  stopCamera(); sessionGeneration++; session = new ExportSession();
  if (downloadingUrl) URL.revokeObjectURL(downloadingUrl);
  downloadingUrl = null;
  el('label').value = '';
  saving = false; downloadOnly = false; hasSaveRequest = false;
  unreadableFrames = 0; lastCaptureAt = 0; clearTimeout(captureTimer);
  el('camera').classList.remove('captured'); feedback('Ready to scan');
  el('saveStatus').textContent = 'Saving becomes available after verification.';
  el('start').disabled = false; el('start').textContent = 'Start scanning'; error(''); update();
});
window.addEventListener('beforeunload', event => {
  if (session.pages.size && !hasSaveRequest) { event.preventDefault(); event.returnValue = ''; }
});
update();
