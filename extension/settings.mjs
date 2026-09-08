import {captureFilename} from './pdf.mjs';

export const DEFAULT_SETTINGS = Object.freeze({folder: 'screenshots', askWhere: false});

export function validateFolder(value) {
  if (typeof value !== 'string') throw new Error('Enter a folder name inside Downloads.');
  const folder = value.trim();
  if (!folder) return '';
  if (folder.startsWith('/') || folder.startsWith('~') || /[\\<>:"|?*\x00-\x1f\x7f]/.test(folder)) {
    throw new Error('Use a subfolder such as screenshots or work/articles, not an absolute path.');
  }
  const parts = folder.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$|^ /.test(part) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('Folder names cannot contain empty segments, . or .., reserved names, or end in a space or dot.');
  }
  const byteLength = text => new TextEncoder().encode(text).length;
  if (byteLength(folder) > 500 || parts.some(part => byteLength(part) > 180)) {
    throw new Error('That folder path is too long. Use shorter folder names.');
  }
  return folder;
}

export async function loadSettings(api) {
  const {downloadSettings} = await api.storage.local.get('downloadSettings');
  return {
    folder: downloadSettings?.folder ?? DEFAULT_SETTINGS.folder,
    askWhere: downloadSettings?.askWhere === true,
  };
}

export async function saveSettings(api, settings) {
  const valid = {folder: validateFolder(settings.folder), askWhere: settings.askWhere === true};
  await api.storage.local.set({downloadSettings: valid});
  return valid;
}

export async function downloadCapture(api, objectUrl, shot, format) {
  if (!['png', 'pdf'].includes(format)) throw new Error('Choose PNG or PDF.');
  const settings = await loadSettings(api);
  let folder;
  try { folder = validateFolder(settings.folder); }
  catch { throw new Error('The saved download folder is invalid. Open Download settings to correct it.'); }
  const name = `${captureFilename(shot.title, shot.url, shot.created)}.${format}`;
  return api.downloads.download({
    url: objectUrl,
    filename: folder ? `${folder}/${name}` : name,
    saveAs: settings.askWhere,
    conflictAction: 'uniquify',
  });
}
