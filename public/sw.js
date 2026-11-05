// PDF Media Suite - Enterprise PWA Service Worker v2.0
// Features: W3C Web Share Target API Level 2 (Direct WhatsApp & System Share Handler)
// Materializes shared file streams into ArrayBuffers immediately to prevent Android content:// URI expiration.

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

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Intercept Web Share Target POST requests
  if (
    event.request.method === 'POST' &&
    (url.pathname === '/share-target' || url.pathname.endsWith('/share-target'))
  ) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          let rawFiles = formData.getAll('shared_files');

          // Fallback: if OS/app used a different field key, collect all File/Blob entries
          if (!rawFiles || rawFiles.length === 0) {
            rawFiles = [];
            for (const [, value] of formData.entries()) {
              if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function') {
                rawFiles.push(value);
              }
            }
          }

          const title = formData.get('title') || '';
          const text = formData.get('text') || '';

          // Materialize file streams into ArrayBuffers while Android content:// intent is still open
          const materializedFiles = [];
          for (const f of rawFiles) {
            if (f && typeof f === 'object' && typeof f.arrayBuffer === 'function') {
              try {
                const buffer = await f.arrayBuffer();
                if (buffer && buffer.byteLength > 0) {
                  materializedFiles.push({
                    name: f.name || `Shared_Document_${Date.now()}.pdf`,
                    type: f.type || 'application/pdf',
                    size: buffer.byteLength,
                    lastModified: f.lastModified || Date.now(),
                    buffer,
                  });
                }
              } catch (readErr) {
                // Fallback to storing raw Blob/File if arrayBuffer fails
                materializedFiles.push(f);
              }
            }
          }

          if (materializedFiles.length > 0) {
            await saveSharedRecord({
              id: 'latest_share',
              files: materializedFiles,
              title: String(title),
              text: String(text),
              timestamp: Date.now(),
            });

            // Notify any already-open window clients so background tabs can react immediately
            try {
              const clientList = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
              });
              for (const client of clientList) {
                client.postMessage({
                  type: 'PMS_SHARED_FILES_READY',
                  timestamp: Date.now(),
                });
              }
            } catch {}
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
