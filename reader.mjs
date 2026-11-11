import { ExportSession, summarize } from './protocol.mjs';
const el = id => document.getElementById(id);
let session = new ExportSession();
let stream = null, timer = null, cameraGeneration = 0, sessionGeneration = 0;
let downloadingUrl = null;
const canvas = el('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });

function error(message) { el('error').textContent = message; el('error').hidden = !message; }
function stopCamera() {
  cameraGeneration++;
  clearTimeout(timer);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  el('video').srcObject = null;
  el('cameraHint').hidden = false;
  el('pause').disabled = true;
  el('start').disabled = Boolean(session.verified || session.failed);
  el('start').textContent = session.pages.size ? 'Resume scanning' : 'Start scanning';
}
function update() {
  const m = session.meta;
  el('progress').max = m ? m.total : 1;
  el('progress').value = session.pages.size;
  const missing = session.missing();
  el('missing').textContent = m ? (missing.length ? `Missing pages: ${missing.slice(0, 80).join(', ')}${missing.length > 80 ? ' …' : ''}` : `All ${m.total} pages received.`) : 'No export started.';
  const verified = Boolean(session.verified && !session.failed);
  el('share').disabled = !verified;
  el('download').disabled = !verified;
  el('result').hidden = !verified;
  el('photo').disabled = verified || session.failed;
  if (session.failed) {
    el('confirmed').checked = false;
    el('confirmed').disabled = true;
    el('status').textContent = 'Verification failed';
    el('saveStatus').textContent = 'Saving is blocked. Keep the watch data and start a new export.';
    stopCamera();
  } else if (verified) {
    stopCamera();
    el('status').textContent = m.kind === 'S' ? 'Sample export verified' : 'Export verified';
    const report = summarize(session.verified);
    el('summary').textContent = `${report.records} structurally valid survey records · ${m.size.toLocaleString()} bytes · checksum ${m.crc}. Export ${m.id}.`;
    el('warnings').replaceChildren();
    const warnings = m.kind === 'S' ? ['SAMPLE DATA — not participant data.', ...report.warnings] : report.warnings;
    for (const warning of warnings) {
      const item = document.createElement('li'); item.textContent = warning; el('warnings').append(item);
    }
    el('saveStatus').textContent = 'Choose Save / share file, then Save to Files. Download file is an alternative.';
  } else el('status').textContent = m ? `${session.pages.size} of ${m.total} pages received` : 'Ready for the first page.';
}
function accept(code) {
  try {
    const outcome = session.add(code.binaryData);
    error('');
    if (!outcome.duplicate) update();
  } catch (e) { error(e.message); update(); }
}
function decode(source, width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
}
function scan(generation) {
  if (generation !== cameraGeneration || !stream) return;
  try {
    const video = el('video');
    if (video.readyState >= 2 && video.videoWidth) {
      const code = decode(video, video.videoWidth, video.videoHeight, 1280);
      if (code) accept(code);
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
    accept(code);
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
  el('confirmed').disabled = false;
  el('saveStatus').textContent = 'Save requested, not yet confirmed. Open the file in Files and check it before clearing the watch.';
}
function download() {
  const file = makeFile();
  if (downloadingUrl) URL.revokeObjectURL(downloadingUrl);
  downloadingUrl = URL.createObjectURL(file);
  const link = document.createElement('a'); link.href = downloadingUrl; link.download = file.name;
  document.body.append(link); link.click(); link.remove();
  saveRequested();
}
el('download').addEventListener('click', () => { try { download(); } catch (e) { error(e.message); } });
el('share').addEventListener('click', async () => {
  const generation = sessionGeneration;
  try {
    const file = makeFile();
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Watch export' });
      if (generation === sessionGeneration) saveRequested();
    } else download();
  } catch (e) {
    if (generation !== sessionGeneration) return;
    if (e.name === 'AbortError') el('saveStatus').textContent = 'Sharing cancelled. The verified export is still available to save.';
    else error(`Could not share: ${e.message}. Try Download file.`);
  }
});
el('confirmed').addEventListener('change', () => {
  el('saveStatus').textContent = el('confirmed').checked ? 'You confirmed the saved file is accessible. Upload it to the study Drive folder.' : 'File saving has not been confirmed.';
});
el('reset').addEventListener('click', () => {
  if (session.pages.size && !confirm('Discard this scanning session and start a new export? Save the current file first if needed. This does not clear the watch.')) return;
  stopCamera(); sessionGeneration++; session = new ExportSession();
  if (downloadingUrl) URL.revokeObjectURL(downloadingUrl);
  downloadingUrl = null;
  el('label').value = ''; el('confirmed').checked = false; el('confirmed').disabled = true;
  el('saveStatus').textContent = 'Saving becomes available after verification.';
  el('start').disabled = false; el('start').textContent = 'Start scanning'; error(''); update();
});
window.addEventListener('beforeunload', event => {
  if (session.pages.size && !el('confirmed').checked) { event.preventDefault(); event.returnValue = ''; }
});
update();
