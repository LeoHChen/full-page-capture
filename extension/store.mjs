function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('full-page-capture', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('captures', {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction(mode, operation) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('captures', mode);
      operation(tx.objectStore('captures'));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('The capture store operation was interrupted.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteExpiredCaptures() {
  const cutoff = Date.now() - 86400000;
  await runTransaction('readwrite', store => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      if (item.value.created < cutoff) item.delete();
      item.continue();
    };
  });
}

export async function saveCapture(record) {
  await runTransaction('readwrite', store => store.put(record));
  await deleteExpiredCaptures();
}

export async function getCapture(id) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('captures').objectStore('captures').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteCapture(id) {
  await runTransaction('readwrite', store => store.delete(id));
}
