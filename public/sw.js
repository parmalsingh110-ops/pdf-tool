// PDF Media Suite - Enterprise PWA Service Worker v3.0
// Features: W3C Web Share Target API Level 2 (Direct WhatsApp, Gallery & Android File Manager Share Handler)
// Dual-Persistence Engine: Writes shared files to BOTH CacheStorage (pms-share-cache-v2) AND IndexedDB (tx.oncomplete)
// to prevent Android content:// URI expiration and eliminate redirect race conditions.

const DB_NAME = 'pms_share_cache_v1';
const STORE_NAME = 'shared_records';
const SHARE_CACHE_NAME = 'pms-share-cache-v2';

function inferMimeType(fileName, fallbackType) {
  if (fallbackType && fallbackType !== 'application/octet-stream' && fallbackType !== '*/*') {
    return fallbackType;
  }
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  return fallbackType || 'application/pdf';
}

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

async function saveSharedRecordToIDB(record) {
  let db = null;
  try {
    db = await openShareDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      // Wait for tx.oncomplete (NOT putReq.onsuccess) so flash storage commit finishes before HTTP 303 redirect
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IDB transaction aborted'));
    });
  } finally {
    try {
      if (db) db.close();
    } catch {}
  }
}

async function saveSharedFilesToCacheStorage(materializedFiles, title, text, timestamp) {
  try {
    const cache = await caches.open(SHARE_CACHE_NAME);
    const metaItems = [];
    for (let i = 0; i < materializedFiles.length; i++) {
      const item = materializedFiles[i];
      const bodyBuffer = item.buffer;
      if (!bodyBuffer) continue;
      const fileUrl = `/__pms_shared_file__/${i}`;
      await cache.put(
        fileUrl,
        new Response(bodyBuffer, {
          status: 200,
          headers: {
            'Content-Type': item.type || 'application/pdf',
            'Content-Length': String(item.size || bodyBuffer.byteLength || 0),
            'X-PMS-File-Name': encodeURIComponent(item.name || `Shared_Document_${i + 1}.pdf`),
          },
        })
      );
      metaItems.push({
        index: i,
        name: item.name || `Shared_Document_${i + 1}.pdf`,
        type: item.type || 'application/pdf',
        size: item.size || bodyBuffer.byteLength || 0,
        lastModified: item.lastModified || timestamp,
      });
    }

    const metaPayload = {
      id: 'latest_share',
      title: String(title || ''),
      text: String(text || ''),
      timestamp,
      items: metaItems,
    };

    await cache.put(
      '/__pms_shared_meta__',
      new Response(JSON.stringify(metaPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch (err) {
    console.warn('[PMS ServiceWorker] CacheStorage write warning:', err);
  }
}

async function extractBufferFromFileEntry(f) {
  // Strategy 1: Standard Response wrapper around File/Blob stream (most reliable for Android content:// URIs)
  try {
    const resp = new Response(f);
    const buf = await resp.arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  } catch {}

  // Strategy 2: Direct Blob.arrayBuffer()
  try {
    if (typeof f.arrayBuffer === 'function') {
      const buf = await f.arrayBuffer();
      if (buf && buf.byteLength > 0) return buf;
    }
  } catch {}

  // Strategy 3: FileReaderSync (available in Worker/ServiceWorker contexts)
  try {
    if (typeof FileReaderSync !== 'undefined') {
      const reader = new FileReaderSync();
      const buf = reader.readAsArrayBuffer(f);
      if (buf && buf.byteLength > 0) return buf;
    }
  } catch {}

  return null;
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

  // Intercept Web Share Target POST requests from Android / Windows Share Sheet
  if (
    event.request.method === 'POST' &&
    (url.pathname === '/share-target' || url.pathname.endsWith('/share-target'))
  ) {
    event.respondWith(
      (async () => {
        const now = Date.now();
        try {
          const formData = await event.request.formData();
          let rawFiles = formData.getAll('shared_files');

          // Fallback: scan all formData entries for any File/Blob regardless of field key
          const allCandidateFiles = [...(rawFiles || [])];
          for (const [key, value] of formData.entries()) {
            if (key !== 'shared_files' && value && typeof value === 'object') {
              if (
                value instanceof Blob ||
                typeof value.arrayBuffer === 'function' ||
                typeof value.stream === 'function'
              ) {
                allCandidateFiles.push(value);
              }
            }
          }

          const title = formData.get('title') || '';
          const text = formData.get('text') || '';

          const materializedFiles = [];
          for (let i = 0; i < allCandidateFiles.length; i++) {
            const f = allCandidateFiles[i];
            if (!f || typeof f !== 'object') continue;
            const buffer = await extractBufferFromFileEntry(f);
            if (buffer && buffer.byteLength > 0) {
              const rawName = f.name || `Shared_Document_${now}_${i + 1}.pdf`;
              const resolvedType = inferMimeType(rawName, f.type);
              materializedFiles.push({
                name: rawName,
                type: resolvedType,
                size: buffer.byteLength,
                lastModified: f.lastModified || now,
                buffer,
              });
            }
          }

          if (materializedFiles.length > 0) {
            // Write to BOTH CacheStorage and IndexedDB before redirecting
            await Promise.allSettled([
              saveSharedFilesToCacheStorage(materializedFiles, title, text, now),
              saveSharedRecordToIDB({
                id: 'latest_share',
                files: materializedFiles,
                title: String(title),
                text: String(text),
                timestamp: now,
              }),
            ]);
          }
        } catch (err) {
          console.error('[PMS ServiceWorker] Error processing share target:', err);
        }

        // Redirect to /scan-to-print with from_share=true & timestamp (HTTP 303 See Other)
        return Response.redirect(`/scan-to-print?from_share=true&share_ts=${now}`, 303);
      })()
    );
    return;
  }

  // Pass-through for all other requests
});
