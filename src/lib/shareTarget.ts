/**
 * PDF Media Suite — Web Share Target & PWA Installation Manager
 * Handles incoming files shared from WhatsApp / File Manager via Android Share Sheet
 * and coordinates PWA installation prompts.
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
 */
export async function getSharedFilesFromCache(): Promise<SharedBundle | null> {
  try {
    const db = await openShareDB();
    const record = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get('latest_share');
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    });

    if (!record || !record.files || !Array.isArray(record.files) || record.files.length === 0) {
      return null;
    }

    // Check expiration: valid for up to 15 minutes after sharing
    const isExpired = Date.now() - (record.timestamp || 0) > 15 * 60 * 1000;
    if (isExpired) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete('latest_share');
      return null;
    }

    // Convert stored items back to standard File objects
    const restoredFiles: File[] = [];
    for (const item of record.files) {
      if (item instanceof File) {
        restoredFiles.push(item);
      } else if (item instanceof Blob) {
        const name = (item as any).name || 'shared-document.pdf';
        restoredFiles.push(new File([item], name, { type: item.type || 'application/pdf', lastModified: Date.now() }));
      } else if (item && typeof item === 'object') {
        const name = item.name || 'shared-document.pdf';
        const type = item.type || 'application/pdf';
        if (item.data) {
          restoredFiles.push(new File([item.data], name, { type, lastModified: Date.now() }));
        }
      }
    }

    // Clean up record so it is not re-consumed on future page reloads
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete('latest_share');
    } catch {}

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
  }
}

// ─── PWA Installation & Service Worker ──────────────────────────────────────
let deferredInstallPrompt: any = null;
const installListeners = new Set<(canInstall: boolean) => void>();

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Check for worker updates periodically
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker version available
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
