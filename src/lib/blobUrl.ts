import { useEffect } from 'react';

const pendingBlobRevocations = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Safely revokes a `blob:` URL when it is replaced or when the owning component unmounts.
 * Uses a short deferred timer cancelled on immediate remount so React StrictMode double-mounts
 * never break active previews while still freeing memory cleanly on URL change or unmount.
 */
export function useAutoRevokeUrl(url: string | null | undefined, delayMs = 60): void {
  useEffect(() => {
    if (!url || !url.startsWith('blob:')) return;

    const existingTimer = pendingBlobRevocations.get(url);
    if (existingTimer) {
      clearTimeout(existingTimer);
      pendingBlobRevocations.delete(url);
    }

    return () => {
      const timer = setTimeout(() => {
        pendingBlobRevocations.delete(url);
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revocation failures on already-freed URLs
        }
      }, delayMs);
      pendingBlobRevocations.set(url, timer);
    };
  }, [url, delayMs]);
}

/**
 * Safely revokes an array of `blob:` URLs whenever individual URLs are removed or the
 * owning component unmounts. Uses the same deferred cancellation mechanism as `useAutoRevokeUrl`.
 */
export function useAutoRevokeUrls(
  urls: readonly (string | null | undefined)[],
  delayMs = 60
): void {
  const validUrls = urls.filter((u): u is string => Boolean(u && u.startsWith('blob:')));
  const urlsKey = validUrls.join('\0');

  useEffect(() => {
    if (!urlsKey) return;
    const currentList = urlsKey.split('\0');

    for (const url of currentList) {
      const existingTimer = pendingBlobRevocations.get(url);
      if (existingTimer) {
        clearTimeout(existingTimer);
        pendingBlobRevocations.delete(url);
      }
    }

    return () => {
      for (const url of currentList) {
        if (pendingBlobRevocations.has(url)) continue;
        const timer = setTimeout(() => {
          pendingBlobRevocations.delete(url);
          try {
            URL.revokeObjectURL(url);
          } catch {
            // Ignore
          }
        }, delayMs);
        pendingBlobRevocations.set(url, timer);
      }
    };
  }, [urlsKey, delayMs]);
}

/**
 * Triggers a browser file download for a Blob and revokes the temporary object URL after
 * the browser has started reading the download stream.
 */
export function triggerBlobDownload(blob: Blob, filename: string, revokeDelayMs = 15000): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    }, revokeDelayMs);
  }
}

/**
 * Safely revokes any object URL if non-null and a `blob:` URL.
 */
export function safeRevokeUrl(url: string | null | undefined): void {
  if (!url || !url.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Ignore
  }
}

/**
 * Narrows a Uint8Array to ArrayBuffer-backed bytes expected by TypeScript 5.9 DOM
 * APIs (`Blob`, `File`, `crypto.subtle`), copying only if backed by a SharedArrayBuffer.
 */
export function toArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (typeof ArrayBuffer !== 'undefined' && bytes.buffer instanceof ArrayBuffer) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  return new Uint8Array(bytes);
}
