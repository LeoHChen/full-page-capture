// Real Chrome/CDP integration, using an isolated temporary profile.
// Run with Node 22+ and CHROME_PATH when Chrome is installed elsewhere.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {capturePage} from '../extension/capture.mjs';

const profile = await mkdtemp(join(tmpdir(), 'full-page-capture-test-'));
const fixture = await readFile(new URL('./fixtures/cleanup.html', import.meta.url));
const assets = new Map(await Promise.all([
  'options.html', 'options.mjs', 'settings.mjs', 'pdf.mjs', 'style.css',
  'preview.html', 'preview.mjs', 'store.mjs',
].map(async name => [`/${name}`, await readFile(new URL(`../extension/${name}`, import.meta.url))])));
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (assets.has(path)) {
    response.setHeader('Content-Type', path.endsWith('.mjs') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(assets.get(path));
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(fixture);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--force-device-scale-factor=1', '--window-size=800,600', 'about:blank',
], {stdio: ['ignore', 'ignore', 'pipe']});
let socket;
let session;
let counter = 0;
const pending = new Map();
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000);
    let output = '';
    chrome.on('error', error => { clearTimeout(timer); reject(error); });
    chrome.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  };
  const send = (method, params = {}, sessionId = session) => new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, {resolve, reject, timer});
    socket.send(JSON.stringify({id, method, params, sessionId}));
  });
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  session = (await send('Target.attachToTarget', {targetId, flatten: true})).sessionId;
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.navigate', {url});
  for (let count = 0; count < 100; count++) {
    if (await evaluate('document.readyState === "complete" && !!document.querySelector("#site-footer")')) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  let detached = 0;
  const api = {
    tabs: {get: async () => ({id: 7, url, title: 'Fixture', active: true})},
    debugger: {
      attach: async () => {},
      detach: async () => { detached++; },
      sendCommand: async (_target, method, params) => send(method, params),
    },
  };
  const sourceState = () => evaluate(`({
    styles: [...document.body.querySelectorAll('*')].map(element => [element.id, element.getAttribute('style')]),
    scroll: scrollY, height: document.documentElement.scrollHeight
  })`);
  await evaluate('scrollTo(0,280)');
  const before = await sourceState();
  const baseline = await capturePage(api, 7, {preload: false, hideFixedBottom: false});
  assert.deepEqual(await sourceState(), before, 'opt-out preserves page state');
  const cleaned = await capturePage(api, 7, {preload: false, hideFixedBottom: false, smartCleanup: true});
  assert.equal(cleaned.cleanup.ads, 2);
  assert.equal(cleaned.cleanup.footers, 1);
  assert.equal(cleaned.cleanup.floating, 3);
  assert.ok(cleaned.height < baseline.height - 400, 'collapsed ad/footer reduce screenshot bounds');
  assert.deepEqual(await sourceState(), before, 'success restores exact inline styles and scroll');

  const pixels = shot => evaluate(`(async () => {
    const image = new Image(); image.src = 'data:image/png;base64,${shot.data}'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image,0,0);
    const bytes = context.getImageData(0,0,canvas.width,canvas.height).data;
    const counts = {red:0, blue:0, yellow:0, magenta:0, green:0, purple:0};
    for (let i=0;i<bytes.length;i+=4) {
      const rgb = bytes[i]+','+bytes[i+1]+','+bytes[i+2];
      const name = {'255,0,0':'red','0,0,255':'blue','255,255,0':'yellow','255,0,255':'magenta','0,128,0':'green','128,0,128':'purple'}[rgb];
      if(name) counts[name]++;
    }
    return counts;
  })()`);
  const originalPixels = await pixels(baseline);
  const cleanPixels = await pixels(cleaned);
  for (const color of ['red', 'blue', 'yellow', 'magenta']) {
    assert.ok(originalPixels[color] > 100, `${color} fixture visible before cleanup`);
    assert.equal(cleanPixels[color], 0, `${color} clutter absent from screenshot`);
  }
  assert.ok(cleanPixels.green > 100, 'article footer preserved');
  assert.ok(cleanPixels.purple > 100, 'inline image preserved');
  const realCommand = api.debugger.sendCommand;
  api.debugger.sendCommand = async (target, method, params) => {
    if (method === 'Page.captureScreenshot') {
      assert.equal(await evaluate('getComputedStyle(document.querySelector("#site-footer")).display'), 'none');
      assert.equal(await evaluate('getComputedStyle(document.querySelector("#cookie-consent")).visibility'), 'visible');
      assert.equal(await evaluate('getComputedStyle(document.querySelector("#large-panel")).visibility'), 'visible');
      throw new Error('Injected screenshot failure');
    }
    return realCommand(target, method, params);
  };
  await assert.rejects(capturePage(api, 7, {preload: false, smartCleanup: true}), /Injected screenshot failure/);
  assert.deepEqual(await sourceState(), before, 'failure restores exact inline styles and scroll');
  assert.equal(detached, 3);

  // Exercise the real settings page and preview with storage/downloads stubs.
  // Preferences survive reloads; downloads are recorded, not written to disk.
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `
    window.chrome ||= {};
    window.chrome.storage = {local: {
      get: async () => JSON.parse(localStorage.getItem('test-settings') || '{}'),
      set: async value => {
        if (window.failStorageWrite) throw new Error('Simulated storage failure');
        localStorage.setItem('test-settings', JSON.stringify(value));
      }
    }};
    window.requestedDownloads = [];
    window.chrome.downloads = {download: async options => {
      window.requestedDownloads.push(options); return window.requestedDownloads.length;
    }};
  `});
  const waitFor = async expression => {
    for (let count = 0; count < 100; count++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`UI condition timed out: ${expression}\n${await evaluate('document.body?.innerText')}`);
  };
  await send('Page.navigate', {url: `${url}options.html`});
  await waitFor('!!document.querySelector("#save") && !document.querySelector("#save").disabled');
  assert.equal(await evaluate('document.querySelector("#folder").value'), 'screenshots');
  assert.equal(await evaluate('document.querySelector("#ask-where").checked'), false);
  const submit = async (folder, askWhere) => {
    await evaluate(`(() => {
      document.querySelector('#folder').value = ${JSON.stringify(folder)};
      document.querySelector('#folder').dispatchEvent(new Event('input'));
      document.querySelector('#ask-where').checked = ${askWhere};
      document.querySelector('#save').click();
    })()`);
    await waitFor('!document.querySelector("#save").disabled');
  };
  await submit('Work/台湾 screenshots', true);
  assert.match(await evaluate('document.querySelector("#settings-status").textContent'), /^Saved/);
  await send('Page.reload');
  await waitFor('!!document.querySelector("#save") && !document.querySelector("#save").disabled');
  assert.equal(await evaluate('document.querySelector("#folder").value'), 'Work/台湾 screenshots');
  assert.equal(await evaluate('document.querySelector("#ask-where").checked'), true);
  await submit('../escape', false);
  assert.match(await evaluate('document.querySelector("#settings-status").textContent'), /^Could not save/);
  assert.equal(await evaluate('(async () => (await chrome.storage.local.get()).downloadSettings.folder)()'), 'Work/台湾 screenshots');
  await evaluate('window.failStorageWrite = true');
  await submit('new-folder', false);
  assert.match(await evaluate('document.querySelector("#settings-status").textContent'), /Simulated storage failure/);
  assert.equal(await evaluate('(async () => (await chrome.storage.local.get()).downloadSettings.folder)()'), 'Work/台湾 screenshots');
  await evaluate('window.failStorageWrite = false; document.querySelector("#reset").click()');
  await waitFor('document.querySelector("#folder").value === "screenshots" && !document.querySelector("#save").disabled');

  await evaluate(`(async () => {
    const {saveCapture} = await import('/store.mjs');
    await saveCapture({...${JSON.stringify({...cleaned, data: undefined})}, id: 'download-test',
      blob: new Blob([Uint8Array.fromBase64(${JSON.stringify(cleaned.data)})], {type: 'image/png'})});
  })()`);
  await send('Page.navigate', {url: `${url}preview.html?id=download-test`});
  await waitFor('!!document.querySelector("#png") && !document.querySelector("#png").disabled');
  await evaluate('document.querySelector("#png").click()');
  await waitFor('window.requestedDownloads.length === 1');
  const png = await evaluate('window.requestedDownloads[0]');
  assert.ok(png.filename.startsWith('screenshots/') && png.filename.endsWith('.png'));
  assert.equal(png.saveAs, false);
  assert.equal(png.conflictAction, 'uniquify');
  await evaluate(`(async () => {
    const {saveSettings} = await import('/settings.mjs');
    await saveSettings(chrome, {folder: 'Work/台湾 screenshots', askWhere: true});
    document.querySelector('#pdf').click();
  })()`);
  await waitFor('window.requestedDownloads.length === 2');
  const pdf = await evaluate('window.requestedDownloads[1]');
  assert.ok(pdf.filename.startsWith('Work/台湾 screenshots/') && pdf.filename.endsWith('.pdf'));
  assert.equal(pdf.saveAs, true);
  assert.equal(pdf.conflictAction, 'uniquify');
  console.log(JSON.stringify({passed: true, baselineHeight: baseline.height, cleanedHeight: cleaned.height,
    cleanup: cleaned.cleanup, originalPixels, cleanPixels, restoredOnSuccessAndFailure: true,
    settingsUI: 'defaults, persistence, validation, write failure, reset passed',
    downloadsUI: 'PNG default folder and PDF updated folder/save dialog passed'}, null, 2));
} finally {
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Test finished')); }
  socket?.close();
  chrome.kill();
  await new Promise(resolve => chrome.exitCode !== null ? resolve() : chrome.once('exit', resolve));
  server.close();
  await rm(profile, {recursive: true, force: true});
}
