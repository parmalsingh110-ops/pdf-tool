/**
 * PDF Media Suite Extension — Shared IndexedDB File Handoff Store
 * Enables zero-latency local PDF / Image transfer from Popup or Content Script
 * directly into the built-in Studio PDF Viewer (`viewer.html`) with no 5MB storage limit.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'pms_extension_studio_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'pending_files';

  function openStudioDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
    });
  }

  async function savePendingStudioFile(fileOrObj) {
    const db = await openStudioDb();
    const id = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    let buffer;
    let name = 'document.pdf';
    let mime = 'application/pdf';

    if (fileOrObj instanceof Blob) {
      buffer = await fileOrObj.arrayBuffer();
      name = fileOrObj.name || name;
      mime = fileOrObj.type || mime;
    } else {
      buffer = fileOrObj.buffer;
      name = fileOrObj.name || name;
      mime = fileOrObj.mime || mime;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      // Opportunistically prune entries older than 2 hours
      const getAllKeysReq = store.getAllKeys();
      getAllKeysReq.onsuccess = () => {
        const keys = getAllKeysReq.result || [];
        if (keys.length > 10) {
          keys.slice(0, keys.length - 10).forEach((k) => store.delete(k));
        }
      };
      store.put({
        id,
        name,
        mime,
        buffer,
        createdAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return id;
  }

  async function loadPendingStudioFile(id) {
    const db = await openStudioDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record;
  }

  global.PMSStudioDB = {
    savePendingStudioFile,
    loadPendingStudioFile,
  };
})(typeof window !== 'undefined' ? window : self);
