/**
 * PDF Media Suite — Enterprise Web Share Target, OS File Handler & PWA Manager
 * Dual-Storage Engine: Reads and writes shared files across BOTH CacheStorage (`pms-share-cache-v2`)
 * and IndexedDB (`pms_share_cache_v1`).
 * Non-destructive reads prevent pre-redirect and React StrictMode race conditions on mobile.
 */

const DB_NAME = 'pms_share_cache_v1';
const STORE_NAME = 'shared_records';
const SHARE_CACHE_NAME = 'pms-share-cache-v2';
const MAX_SHARE_AGE_MS = 10 * 60 * 1000; // 10 minutes

function inferMimeType(fileName: string, fallbackType?: string): string {
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

function openShareDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event: any) => {
      const db: IDBDatabase = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface SharedBundle {
  files: File[];
  title?: string;
  text?: string;
  timestamp: number;
}

/**
 * Explicitly clears shared files from both CacheStorage and IndexedDB.
 * Call this ONLY after the user successfully beams the files or manually removes them.
 */
export async function clearSharedFilesCache(): Promise<void> {
  // 1. Clear CacheStorage
  try {
    if (typeof caches !== 'undefined') {
      await caches.delete(SHARE_CACHE_NAME);
    }
  } catch {}

  // 2. Clear IndexedDB
  let db: IDBDatabase | null = null;
  try {
    db = await openShareDB();
    await new Promise<void>((resolve) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      try {
        store.delete('latest_share');
      } catch {}
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {} finally {
    try {
      db?.close();
    } catch {}
  }
}

/**
 * Reads shared files from CacheStorage (`pms-share-cache-v2`) written by Service Worker v3.0.
 */
async function readFromCacheStorage(): Promise<SharedBundle | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const hasCache = await caches.has(SHARE_CACHE_NAME);
    if (!hasCache) return null;

    const cache = await caches.open(SHARE_CACHE_NAME);
    const metaResp = await cache.match('/__pms_shared_meta__');
    if (!metaResp) return null;

    const meta = await metaResp.json();
    if (!meta || !Array.isArray(meta.items) || meta.items.length === 0) return null;

    const timestamp = Number(meta.timestamp || 0);
    if (Date.now() - timestamp > MAX_SHARE_AGE_MS) {
      await clearSharedFilesCache();
      return null;
    }

    const restoredFiles: File[] = [];
    for (const item of meta.items) {
      const fileResp = await cache.match(`/__pms_shared_file__/${item.index}`);
      if (!fileResp) continue;
      const buf = await fileResp.arrayBuffer();
      if (buf && buf.byteLength > 0) {
        const name = item.name || `Shared_Document_${item.index + 1}.pdf`;
        const type = inferMimeType(name, item.type);
        restoredFiles.push(
          new File([buf], name, {
            type,
            lastModified: item.lastModified || timestamp || Date.now(),
          })
        );
      }
    }

    if (restoredFiles.length === 0) return null;

    return {
      files: restoredFiles,
      title: meta.title || '',
      text: meta.text || '',
      timestamp: timestamp || Date.now(),
    };
  } catch (err) {
    console.warn('[ShareTarget] CacheStorage read warning:', err);
    return null;
  }
}

/**
 * Reads shared files from IndexedDB (`pms_share_cache_v1`).
 */
async function readFromIndexedDB(): Promise<SharedBundle | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openShareDB();
    const record = await new Promise<any>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get('latest_share');
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    });

    if (!record || !record.files || !Array.isArray(record.files) || record.files.length === 0) {
      return null;
    }

    const timestamp = Number(record.timestamp || 0);
    if (Date.now() - timestamp > MAX_SHARE_AGE_MS) {
      await clearSharedFilesCache();
      return null;
    }

    const restoredFiles: File[] = [];
    for (const item of record.files) {
      if (item instanceof File) {
        restoredFiles.push(item);
      } else if (item instanceof Blob) {
        const name = (item as any).name || 'shared-document.pdf';
        restoredFiles.push(
          new File([item], name, {
            type: inferMimeType(name, item.type),
            lastModified: Date.now(),
          })
        );
      } else if (item && typeof item === 'object') {
        const name = item.name || 'shared-document.pdf';
        const type = inferMimeType(name, item.type);
        const lastModified = item.lastModified || Date.now();
        const rawData = item.buffer || item.data;
        if (rawData) {
          restoredFiles.push(new File([rawData], name, { type, lastModified }));
        }
      }
    }

    if (restoredFiles.length === 0) return null;

    return {
      files: restoredFiles,
      title: record.title || '',
      text: record.text || '',
      timestamp: timestamp || Date.now(),
    };
  } catch (err) {
    console.warn('[ShareTarget] IndexedDB read warning:', err);
    return null;
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

/**
 * Retrieves pending files sent via Web Share Target (WhatsApp / Android File Manager) or OS Open With.
 * Non-destructive read: keeps files cached until `clearSharedFilesCache()` is called after beaming,
 * preventing pre-redirect and StrictMode race conditions on mobile.
 */
export async function getSharedFilesFromCache(): Promise<SharedBundle | null> {
  // Try CacheStorage first (fastest & most reliable on Android Chrome Service Worker)
  const fromCacheStorage = await readFromCacheStorage();
  if (fromCacheStorage && fromCacheStorage.files.length > 0) {
    return fromCacheStorage;
  }

  // Fallback to IndexedDB
  const fromIDB = await readFromIndexedDB();
  if (fromIDB && fromIDB.files.length > 0) {
    return fromIDB;
  }

  return null;
}

/**
 * Saves files launched via Windows Explorer / macOS Finder "Open With -> PDF Media Suite"
 * or server-hydrated share fallback into BOTH CacheStorage and IndexedDB.
 */
export async function saveLaunchedFilesToCache(files: File[], title = 'Opened from Device Storage'): Promise<void> {
  if (!files.length) return;
  const now = Date.now();
  const serializedFiles: {
    name: string;
    type: string;
    size: number;
    lastModified: number;
    buffer: ArrayBuffer;
  }[] = [];

  for (const f of files) {
    const buffer = await f.arrayBuffer();
    const name = f.name || 'document.pdf';
    serializedFiles.push({
      name,
      type: inferMimeType(name, f.type),
      size: f.size || buffer.byteLength,
      lastModified: f.lastModified || now,
      buffer,
    });
  }

  // 1. Save to CacheStorage
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(SHARE_CACHE_NAME);
      const metaItems = [];
      for (let i = 0; i < serializedFiles.length; i++) {
        const item = serializedFiles[i];
        await cache.put(
          `/__pms_shared_file__/${i}`,
          new Response(item.buffer, {
            status: 200,
            headers: {
              'Content-Type': item.type,
              'Content-Length': String(item.size),
            },
          })
        );
        metaItems.push({
          index: i,
          name: item.name,
          type: item.type,
          size: item.size,
          lastModified: item.lastModified,
        });
      }
      await cache.put(
        '/__pms_shared_meta__',
        new Response(
          JSON.stringify({
            id: 'latest_share',
            title,
            text: '',
            timestamp: now,
            items: metaItems,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
  } catch {}

  // 2. Save to IndexedDB
  let db: IDBDatabase | null = null;
  try {
    db = await openShareDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id: 'latest_share',
        files: serializedFiles,
        title,
        text: '',
        timestamp: now,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[FileHandler] Failed to cache OS-launched files:', err);
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

// ─── PWA Installation, OS File Handler & Service Worker Event Bus ──────────
let deferredInstallPrompt: any = null;
const installListeners = new Set<(canInstall: boolean) => void>();
const sharedReadyListeners = new Set<() => void>();

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;

  // W3C File Handling API: handles "Open With -> PDF Media Suite" from Windows Explorer & Mac Finder
  if ('launchQueue' in window && (window as any).launchQueue) {
    try {
      (window as any).launchQueue.setConsumer(async (launchParams: any) => {
        if (!launchParams || !launchParams.files || !launchParams.files.length) return;
        const extractedFiles: File[] = [];
        for (const handle of launchParams.files) {
          try {
            if (handle && typeof handle.getFile === 'function') {
              const file = await handle.getFile();
              if (file) extractedFiles.push(file);
            }
          } catch (e) {
            console.warn('[FileHandler] Could not read file handle:', e);
          }
        }
        if (extractedFiles.length > 0) {
          await saveLaunchedFilesToCache(extractedFiles);
          sharedReadyListeners.forEach((fn) => fn());
          if (!window.location.pathname.includes('/scan-to-print')) {
            window.location.href = '/scan-to-print?from_share=true';
          }
        }
      });
    } catch (err) {
      console.warn('[FileHandler] launchQueue registration skipped:', err);
    }
  }

  if ('serviceWorker' in navigator) {
    const doRegister = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          // Force immediate check for updated sw.js on mobile
          reg.update().catch(() => {});
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  console.info('[PMS] Service worker v3.0 updated.');
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('[PMS] Service worker registration failed:', err);
        });
    };

    // Register immediately if document is already interactive/complete (fixes missed window.onload in Vite modules!)
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      doRegister();
    } else {
      window.addEventListener('load', doRegister, { once: true });
    }

    // Listen for live notifications from sw.js
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'PMS_SHARED_FILES_READY') {
        sharedReadyListeners.forEach((fn) => fn());
      }
    });

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installListeners.forEach((fn) => fn(true));
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      installListeners.forEach((fn) => fn(false));
    });
  }
}

export function subscribeSharedFilesReady(callback: () => void): () => void {
  sharedReadyListeners.add(callback);
  return () => {
    sharedReadyListeners.delete(callback);
  };
}

export function subscribePWAInstall(callback: (canInstall: boolean) => void): () => void {
  installListeners.add(callback);
  callback(deferredInstallPrompt !== null);
  return () => {
    installListeners.delete(callback);
  };
}

export async function promptPWAInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) return false;
  try {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installListeners.forEach((fn) => fn(false));
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

export function isPWARunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}
