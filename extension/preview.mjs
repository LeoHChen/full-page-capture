import {captureFilename, jpegToPdf} from './pdf.mjs';
import {deleteCapture, deleteExpiredCaptures, getCapture} from './store.mjs';

const $ = selector => document.querySelector(selector);
let shot;
let pngUrl;
let pdfBlob;
const urls = [];

async function download(blob, extension) {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  const name = captureFilename(shot.title, shot.url, shot.created);
  await chrome.downloads.download({url, filename: `${name}.${extension}`, saveAs: true});
}

async function initialize() {
  await deleteExpiredCaptures();
  const params = new URLSearchParams(location.search);
  if (params.has('error')) throw new Error(params.get('error'));
  shot = await getCapture(params.get('id'));
  if (!shot?.blob) throw new Error('This capture is no longer available. Open the source page and capture it again.');
  pngUrl = URL.createObjectURL(shot.blob);
  urls.push(pngUrl);
  const image = $('#image');
  image.src = pngUrl;
  await image.decode();
  image.hidden = false;
  $('#title').textContent = shot.title;
  const dpr = Number(shot.dpr) || 1;
  const scale = Number(shot.scale) || 1;
  const dimensions = `${shot.width.toLocaleString()} × ${shot.height.toLocaleString()} CSS px @${dpr.toLocaleString()}×`;
  const output = `${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} image px`;
  const reduced = scale < 0.9999 ? ` · resolution reduced to ${(scale * 100).toFixed(1)}% to keep the full page accurate` : '';
  $('#meta').textContent = `${dimensions} · ${output}${reduced} · ${new Date(shot.created).toLocaleString()}`;
  $('#status').textContent = 'Your capture is ready.';
  for (const id of ['#png', '#pdf', '#zoom', '#delete']) $(id).disabled = false;
}

$('#png').onclick = async () => {
  try {
    await download(shot.blob, 'png');
    $('#status').textContent = 'PNG download requested.';
  } catch (error) {
    $('#status').textContent = error.message;
  }
};

$('#pdf').onclick = async () => {
  $('#pdf').disabled = true;
  $('#status').textContent = 'Preparing your PDF…';
  try {
    if (!pdfBlob) {
      const image = $('#image');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 30000 / image.naturalHeight, 16000 / image.naturalWidth, Math.sqrt(40000000 / (image.naturalWidth * image.naturalHeight)));
      canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Chrome could not allocate the PDF image. Download the PNG instead.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.96));
      canvas.width = canvas.height = 1;
      if (!jpeg) throw new Error('This image is too large to convert in Chrome. Download the PNG instead.');
      const pixelRatio = (Number(shot.dpr) || 1) * (Number(shot.scale) || 1) * scale;
      pdfBlob = new Blob([jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), {
        unitScale: 0.75 / pixelRatio,
        title: shot.title,
      })], {type: 'application/pdf'});
      if (scale < 1) $('#meta').textContent += ' · PDF resolution reduced for Chrome’s image limits; PNG remains original.';
    }
    await download(pdfBlob, 'pdf');
    $('#status').textContent = 'PDF download requested.';
  } catch (error) {
    $('#status').textContent = error.message;
  } finally {
    $('#pdf').disabled = false;
  }
};

$('#delete').onclick = async () => {
  $('#delete').disabled = true;
  try {
    await deleteCapture(shot.id);
    $('#image').removeAttribute('src');
    $('#image').hidden = true;
    for (const id of ['#png', '#pdf', '#zoom']) $(id).disabled = true;
    $('#status').textContent = 'Capture deleted from this device.';
  } catch (error) {
    $('#status').textContent = error.message;
    $('#delete').disabled = false;
  }
};

$('#zoom').onclick = () => {
  const actual = $('#frame').classList.toggle('actual');
  $('#zoom').textContent = actual ? 'Fit to width' : 'View actual size';
};

window.addEventListener('pagehide', () => urls.forEach(url => URL.revokeObjectURL(url)));
initialize().catch(error => {
  $('#title').textContent = 'Capture needs another try';
  $('#status').textContent = error.message;
  $('#meta').textContent = 'Close DevTools or other browser automation on the source tab, then try again. Some protected pages do not allow capture.';
});
