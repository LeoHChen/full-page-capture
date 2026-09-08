import {capturePage} from './capture.mjs';
import {decodeBase64} from './bytes.mjs';
import {deleteExpiredCaptures, saveCapture} from './store.mjs';

let busy = false;

chrome.runtime.onStartup.addListener(() => {
  deleteExpiredCaptures().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html') || message.type !== 'capture') return;
  if (busy) {
    respond({ok: false, error: 'A capture is already running. Please wait.'});
    return;
  }
  if (!Number.isInteger(message.tabId)) {
    respond({ok: false, error: 'Select a webpage first.'});
    return;
  }
  busy = true;
  run(message).finally(() => {
    busy = false;
  });
  respond({ok: true});
});

async function run(message) {
  const id = crypto.randomUUID();
  try {
    await chrome.action.setBadgeBackgroundColor({color: '#195747'});
    await chrome.action.setBadgeText({text: '…'});
    const shot = await capturePage(chrome, message.tabId, {
      preload: message.preload !== false,
      hideFixedBottom: message.hideFixedBottom !== false,
    });
    const bytes = decodeBase64(shot.data);
    delete shot.data;
    await saveCapture({id, ...shot, blob: new Blob([bytes], {type: 'image/png'})});
    await chrome.tabs.create({url: chrome.runtime.getURL(`preview.html?id=${id}`)});
  } catch (error) {
    const message = String(error.message || error).slice(0, 1200);
    await chrome.tabs.create({url: chrome.runtime.getURL(`preview.html?error=${encodeURIComponent(message)}`)}).catch(() => {});
  } finally {
    await chrome.action.setBadgeText({text: ''}).catch(() => {});
  }
}
