/**
 * PDF Media Suite — Enterprise Web Share Target & PWA Installation Manager
 * Handles incoming files shared from WhatsApp / File Manager via Android Share Sheet,
 * reconstructs materialized ArrayBuffers into native File instances, and coordinates
 * PWA installation prompts.
 */

const DB_NAME = 'pms_share_cache_v1';
const STORE_NAME = 'shared_records';

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
 * Retrieves and clears any pending files sent via Web Share Target (e.g. from WhatsApp).
 * Uses a single atomic readwrite transaction to prevent race conditions across tabs.
 */
export async function getSharedFilesFromCache(): Promise<SharedBundle | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openShareDB();
    const record = await new Promise<any>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get('latest_share');
      getReq.onsuccess = () => {
        const res = getReq.result;
        if (res) {
          // Delete atomically inside the same readwrite transaction so no duplicate consumer reads it
          try {
            store.delete('latest_share');
          } catch {}
        }
        resolve(res);
      };
      getReq.onerror = () => reject(getReq.error);
    });

    if (!record || !record.files || !Array.isArray(record.files) || record.files.length === 0) {
      return null;
    }

    // Check expiration: valid for up to 15 minutes after sharing
    const isExpired = Date.now() - (record.timestamp || 0) > 15 * 60 * 1000;
    if (isExpired) {
      return null;
    }

    // Convert stored items (ArrayBuffer descriptors, Blobs, or Files) back to standard File objects
    const restoredFiles: File[] = [];
    for (const item of record.files) {
      if (item instanceof File) {
        restoredFiles.push(item);
      } else if (item instanceof Blob) {
        const name = (item as any).name || 'shared-document.pdf';
        restoredFiles.push(
          new File([item], name, {
            type: item.type || 'application/pdf',
            lastModified: Date.now(),
          })
        );
      } else if (item && typeof item === 'object') {
        const name = item.name || 'shared-document.pdf';
        const type = item.type || 'application/pdf';
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
      timestamp: record.timestamp || Date.now(),
    };
  } catch (err) {
    console.warn('[ShareTarget] Unable to retrieve shared files from IndexedDB:', err);
    return null;
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

/**
 * Saves files launched via Windows Explorer / macOS Finder "Open With -> PDF Media Suite"
 * (W3C File Handling API `window.launchQueue`) into the unified IndexedDB share cache.
 */
async function saveLaunchedFilesToCache(files: File[]): Promise<void> {
  if (!files.length) return;
  let db: IDBDatabase | null = null;
  try {
    const serializedFiles = [];
    for (const f of files) {
      const buffer = await f.arrayBuffer();
      serializedFiles.push({
        name: f.name || 'document.pdf',
        type: f.type || 'application/pdf',
        size: f.size || buffer.byteLength,
        lastModified: f.lastModified || Date.now(),
        buffer,
      });
    }
    db = await openShareDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id: 'latest_share',
        files: serializedFiles,
        title: 'Opened from Device Storage',
        text: '',
        timestamp: Date.now(),
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
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  console.info('[PMS] Service worker updated.');
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('[PMS] Service worker registration failed:', err);
        });
    });

    // Listen for live notifications from sw.js when new files are shared to an already-open PWA
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
