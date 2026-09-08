import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, loadSettings, saveSettings, validateFolder, downloadCapture} from '../extension/settings.mjs';

function apiMock() {
  let stored = {};
  const requests = [];
  return {
    requests,
    storage: {local: {
      get: async () => structuredClone(stored),
      set: async value => { stored = structuredClone(value); },
    }},
    downloads: {download: async options => { requests.push(options); return requests.length; }},
  };
}
const shot = {title: 'Article', url: 'https://example.org/story', created: new Date(2026, 8, 8, 10, 48).getTime()};

test('fresh installs send both formats to screenshots without a prompt and never overwrite', async () => {
  const api = apiMock();
  assert.deepEqual(await loadSettings(api), DEFAULT_SETTINGS);
  for (const format of ['png', 'pdf']) {
    await downloadCapture(api, 'blob:test', shot, format);
    assert.deepEqual(api.requests.at(-1), {
      url: 'blob:test', filename: `screenshots/example.org — Article — 2026-09-08 10-48.${format}`,
      saveAs: false, conflictAction: 'uniquify',
    });
  }
});

test('latest saved preferences apply to existing previews, including root and restore defaults', async () => {
  const api = apiMock();
  await saveSettings(api, {folder: 'Work/台湾 screenshots', askWhere: true});
  assert.deepEqual(await loadSettings(api), {folder: 'Work/台湾 screenshots', askWhere: true});
  await downloadCapture(api, 'blob:test', shot, 'png');
  assert.ok(api.requests.at(-1).filename.startsWith('Work/台湾 screenshots/'));
  assert.equal(api.requests.at(-1).saveAs, true);
  await saveSettings(api, {folder: '', askWhere: false});
  await downloadCapture(api, 'blob:test', shot, 'pdf');
  assert.ok(!api.requests.at(-1).filename.includes('/'));
  await saveSettings(api, DEFAULT_SETTINGS);
  assert.deepEqual(await loadSettings(api), DEFAULT_SETTINGS);
});

test('rejects traversal, absolute paths, platform-invalid folders and oversized names without changing preferences', async () => {
  const api = apiMock();
  await saveSettings(api, {folder: 'good', askWhere: false});
  for (const folder of ['../escape', 'work/../escape', '.', 'a/./b', '/tmp/shots', '~/Downloads/screenshots',
    'C:\\shots', 'a\\b', 'a//b', 'a/', 'a?/b', 'a\u0000b', 'work/CON', 'NUL.txt', 'bad./x', 'a/ b', 'a'.repeat(181), null]) {
    assert.throws(() => validateFolder(folder));
    await assert.rejects(saveSettings(api, {folder, askWhere: true}));
    assert.deepEqual(await loadSettings(api), {folder: 'good', askWhere: false});
  }
});

test('storage errors, malformed saved paths, and failed downloads surface errors', async () => {
  const api = apiMock();
  await api.storage.local.set({downloadSettings: {folder: '../escape'}});
  await assert.rejects(downloadCapture(api, 'blob:test', shot, 'png'), /saved download folder is invalid/);
  assert.equal(api.requests.length, 0);
  api.storage.local.get = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(downloadCapture(api, 'blob:test', shot, 'pdf'), /storage unavailable/);
  assert.equal(api.requests.length, 0);
  api.storage.local.set = async () => { throw new Error('write failed'); };
  await assert.rejects(saveSettings(api, DEFAULT_SETTINGS), /write failed/);
  const failing = apiMock();
  failing.downloads.download = async () => { throw new Error('download denied'); };
  await assert.rejects(downloadCapture(failing, 'blob:test', shot, 'pdf'), /download denied/);
});
