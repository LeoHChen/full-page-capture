import {DEFAULT_SETTINGS, loadSettings, saveSettings, validateFolder} from './settings.mjs';

const form = document.querySelector('#settings-form');
const folder = document.querySelector('#folder');
const askWhere = document.querySelector('#ask-where');
const status = document.querySelector('#settings-status');
const destination = document.querySelector('#destination');
const controls = [...form.querySelectorAll('input, button')];
const disable = value => controls.forEach(control => { control.disabled = value; });

function showDestination() {
  try {
    const path = validateFolder(folder.value);
    folder.setAttribute('aria-invalid', 'false');
    destination.textContent = `Save to: Downloads${path ? `/${path}` : ''}${askWhere.checked ? ' (ask each time)' : ''}`;
  } catch (error) {
    folder.setAttribute('aria-invalid', 'true');
    destination.textContent = error.message;
  }
}

function populate(settings) {
  folder.value = settings.folder;
  askWhere.checked = settings.askWhere;
  showDestination();
}

folder.addEventListener('input', () => { status.textContent = 'Unsaved changes'; showDestination(); });
askWhere.addEventListener('change', () => { status.textContent = 'Unsaved changes'; showDestination(); });

async function persist(settings) {
  disable(true);
  status.textContent = 'Saving…';
  try {
    populate(await saveSettings(chrome, settings));
    status.textContent = 'Saved. Applies to your next PNG or PDF download, including previews already open.';
  } catch (error) {
    status.textContent = `Could not save: ${error.message}`;
    showDestination();
  } finally {
    disable(false);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  persist({folder: folder.value, askWhere: askWhere.checked});
});
document.querySelector('#reset').addEventListener('click', () => persist(DEFAULT_SETTINGS));

loadSettings(chrome).then(settings => {
  populate(settings);
  disable(false);
}).catch(error => {
  destination.textContent = 'Settings unavailable.';
  status.textContent = `Could not load settings: ${error.message}. Reload this page to try again.`;
});
