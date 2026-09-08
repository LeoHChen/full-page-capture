function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('full-page-capture', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('captures', {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveCapture(record) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('captures', 'readwrite');
      const store = tx.objectStore('captures');
      store.put(record);
      const cursor = store.openCursor();
      cursor.onsuccess = () => { const item = cursor.result; if (item) { if (item.value.created < Date.now() - 86400000) item.delete(); item.continue(); } };
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Saving was interrupted.'));
    });
  } finally { db.close(); }
}
export async function getCapture(id) {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('captures').objectStore('captures').get(id);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
