import test from 'node:test';
import assert from 'node:assert/strict';
import {jpegToPdf, jpegSize, safeFilename} from '../extension/pdf.mjs';
import {captureBounds, capturePage} from '../extension/capture.mjs';

function fixtureJpeg(width, height) {
  return new Uint8Array([255,216,255,192,0,17,8,height>>8,height&255,width>>8,width&255,3,1,17,0,2,17,1,3,17,1,255,217]);
}
test('PDF byte offsets and stream lengths remain correct with binary JPEG data', () => {
  const jpeg = fixtureJpeg(1081, 7732), pdf = jpegToPdf(jpeg), text = Buffer.from(pdf).toString('latin1');
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
  const rows = text.slice(xref).split('\n').slice(3,8);
  rows.forEach((row, i) => assert.ok(text.slice(Number(row.slice(0,10))).startsWith(`${i+1} 0 obj`)));
  assert.match(text, /\/Count 1/);
  assert.match(text, /\/MediaBox \[0 0 810\.75 5799\]/);
  const imageStart = text.indexOf('stream\n', text.indexOf('4 0 obj')) + 7;
  assert.deepEqual(pdf.slice(imageStart, imageStart + jpeg.length), jpeg);
});
test('large PDF pages stay below the 14400 point compatibility limit', () => {
  const text = Buffer.from(jpegToPdf(fixtureJpeg(1081, 60000))).toString('latin1');
  assert.match(text, /\/MediaBox \[0 0 [\d.]+ 14000\]/);
});
test('rejects malformed images and invalid or oversized bounds', () => {
  assert.throws(() => jpegSize(new Uint8Array([1,2,3])), /JPEG/);
  assert.throws(() => jpegSize(fixtureJpeg(10,20).slice(0, 14)), /Truncated/);
  assert.throws(() => captureBounds({cssContentSize: {width: 1000, height: 60001}}), /too large/);
  assert.throws(() => captureBounds({cssContentSize: {width: 0, height: 20}}), /Invalid/);
  assert.throws(() => captureBounds({}), /dimensions/);
});
test('safe filenames preserve Chinese and strip path separators', () => {
  assert.equal(safeFilename('../台湾/庙宇:截图?'), '-台湾-庙宇-截图-');
  assert.equal(safeFilename('...'), 'full-page');
  assert.ok(Buffer.byteLength(safeFilename('台湾庙宇'.repeat(80))) <= 180);
  assert.equal(safeFilename('CON'), 'capture-CON');
});
function mockApi(failAt) {
  const calls = [];
  const api = {
    tabs: {get: async () => ({id: 7, url: 'https://example.org/article', title: 'Article'})},
    debugger: {
      attach: async () => {calls.push('attach'); if (failAt === 'attach') throw new Error('busy');},
      detach: async () => {calls.push('detach');},
      sendCommand: async (target, method, args) => {
        calls.push({target, method, args});
        if (method === failAt) throw new Error('capture failure');
        if (method === 'Runtime.evaluate' && args.expression.includes('({x:scrollX')) return {result: {value: {x: 12, y: 450}}};
        if (method === 'Page.getLayoutMetrics') return {cssContentSize: {width: 1081, height: 7732}};
        if (method === 'Page.captureScreenshot') return {data: 'aGVsbG8='};
        return {};
      }
    }
  };
  return {api, calls};
}
test('full capture uses selected tab, full bounds, restores scroll, and detaches', async () => {
  const {api, calls} = mockApi();
  const result = await capturePage(api, 7);
  assert.equal(result.height, 7732);
  const shot = calls.find(c => c.method === 'Page.captureScreenshot');
  assert.equal(shot.target.tabId, 7); assert.equal(shot.args.captureBeyondViewport, true);
  assert.equal(shot.args.clip.height, 7732);
  assert.match(calls.at(-2).args.expression, /left:12,top:450/);
  assert.equal(calls.at(-1), 'detach');
});
test('failed screenshot still restores scroll and detaches', async () => {
  const {api, calls} = mockApi('Page.captureScreenshot');
  await assert.rejects(capturePage(api, 7), /capture failure/);
  assert.match(calls.at(-2).args.expression, /left:12,top:450/);
  assert.equal(calls.at(-1), 'detach');
});
test('failed attachment never detaches another debugger session', async () => {
  const {api, calls} = mockApi('attach');
  await assert.rejects(capturePage(api, 7), /busy/);
  assert.deepEqual(calls, ['attach']);
});
test('restricted URL fails before attaching', async () => {
  const {api, calls} = mockApi(); api.tabs.get = async () => ({url:'chrome://extensions'});
  await assert.rejects(capturePage(api,7), /regular/); assert.deepEqual(calls, []);
});
test('navigation during capture fails with cleanup', async () => {
  const {api, calls} = mockApi(); let reads = 0;
  api.tabs.get = async () => ({url: ++reads === 1 ? 'https://example.org/a' : 'https://example.org/b'});
  await assert.rejects(capturePage(api,7), /navigated/); assert.equal(calls.at(-1),'detach');
  assert.ok(!calls.some(c => c.method === 'Page.captureScreenshot'));
});
test('preload failures are surfaced and the debugger is detached', async () => {
  const {api, calls} = mockApi(); const original = api.debugger.sendCommand;
  api.debugger.sendCommand = async (target, method, args) => {
    if (method === 'Runtime.evaluate' && args.expression.includes('initialHeight')) return {exceptionDetails: {text: 'timeout'}};
    return original(target, method, args);
  };
  await assert.rejects(capturePage(api,7,{preload:true}), /preparation was interrupted/);
  assert.equal(calls.at(-1), 'detach');
});
