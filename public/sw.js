// PDF Media Suite - High Performance PWA Service Worker v1.0
// Features: W3C Web Share Target API Level 2 (Direct WhatsApp & System Share Handler)

const DB_NAME = 'pms_share_cache_v1';
const STORE_NAME = 'shared_records';

function openShareDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSharedRecord(record) {
  const db = await openShareDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const putReq = store.put(record);
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
  });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept Web Share Target POST requests
  if (event.request.method === 'POST' && (url.pathname === '/share-target' || url.pathname.endsWith('/share-target'))) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll('shared_files');
          const title = formData.get('title') || '';
          const text = formData.get('text') || '';

          const validFiles = [];
          for (const f of files) {
            if (f && typeof f === 'object' && f.name) {
              validFiles.push(f);
            }
          }

          if (validFiles.length > 0) {
            await saveSharedRecord({
              id: 'latest_share',
              files: validFiles,
              title: String(title),
              text: String(text),
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          console.error('[PMS ServiceWorker] Error processing share target:', err);
        }

        // Redirect to /scan-to-print with from_share=true flag (HTTP 303 See Other)
        return Response.redirect('/scan-to-print?from_share=true', 303);
      })()
    );
    return;
  }

  // Pass-through for all other requests (zero interference with network, Vite, API or PeerJS)
});
