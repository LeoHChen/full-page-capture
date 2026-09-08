const button = document.querySelector('#capture');
button.addEventListener('click', async () => {
  button.disabled = true;
  const status = document.querySelector('#status');
  status.textContent = 'Starting capture…';
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const result = await chrome.runtime.sendMessage({type: 'capture', tabId: tab.id, preload: document.querySelector('#preload').checked});
    if (!result?.ok) throw new Error(result?.error || 'Could not start capture.');
    window.close();
  } catch (error) { status.textContent = error.message; button.disabled = false; }
});
