const button = document.querySelector('#capture');
button.addEventListener('click', async () => {
  button.disabled = true;
  const status = document.querySelector('#status');
  status.textContent = 'Starting capture…';
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) {
      throw new Error('Open a regular http or https webpage first. Chrome pages, PDFs, and the Web Store cannot be captured.');
    }
    const result = await chrome.runtime.sendMessage({
      type: 'capture',
      tabId: tab.id,
      preload: document.querySelector('#preload').checked,
      hideFixedBottom: document.querySelector('#hide-fixed').checked,
      smartCleanup: document.querySelector('#smart-cleanup').checked,
    });
    if (!result?.ok) throw new Error(result?.error || 'Could not start capture.');
    window.close();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});
