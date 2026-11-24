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
 * Narrows a Uint8Array to ArrayBuffer-backed bytes expected by TypeScript 5.8+ DOM
 * APIs (`Blob`, `File`, `crypto.subtle`), copying only if backed by a SharedArrayBuffer.
 */
export function toArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (typeof ArrayBuffer !== 'undefined' && bytes.buffer instanceof ArrayBuffer) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  return new Uint8Array(bytes);
}

/**
 * Convert a data: URL or base64 string to Uint8Array without fetch()
 * (avoids CSP connect-src block on data: scheme and giant data: anchor failures).
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex !== -1 && dataUrl.startsWith('data:')) {
    const header = dataUrl.slice(0, commaIndex).toLowerCase();
    const payload = dataUrl.slice(commaIndex + 1);
    if (!header.includes(';base64')) {
      return toArrayBufferBytes(new TextEncoder().encode(decodeURIComponent(payload)));
    }
    const binary = atob(payload);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const base64 = commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function triggerAnchorBlobDownload(blob: Blob, filename: string, revokeDelayMs: number): void {
  if (typeof document === 'undefined' || !document.body) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    setTimeout(() => {
      try {
        if (a.parentNode) a.parentNode.removeChild(a);
      } catch {
        // Ignore
      }
    }, 250);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    }, Math.max(15_000, revokeDelayMs));
  }
}

/**
 * Triggers a mobile-safe browser file download for a Blob.
 * - On Android in-app WebViews (WhatsApp, Instagram, Telegram, Facebook, Line, wv),
 *   uses Web Share API file sharing when supported (falling back to anchor click on Abort/error).
 * - On standard browsers, appends an invisible anchor with `rel="noopener"`, defers DOM removal
 *   by 250ms, and defers `URL.revokeObjectURL` by at least 15s (default 60s) so slow mobile
 *   download managers never lose the blob stream mid-save.
 */
export function triggerBlobDownload(blob: Blob, filename: string, revokeDelayMs = 60_000): void {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isInAppWebView = /(wv|FBAN|FBAV|Instagram|WhatsApp|Telegram|Line)/i.test(ua);

  if (
    isInAppWebView &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    typeof File !== 'undefined'
  ) {
    try {
      const file = new File([blob], filename, {
        type: blob.type || 'application/octet-stream',
      });
      if (navigator.canShare({ files: [file] })) {
        navigator
          .share({ files: [file], title: filename })
          .catch(() => {
            triggerAnchorBlobDownload(blob, filename, revokeDelayMs);
          });
        return;
      }
    } catch {
      // Fall through to standard anchor download
    }
  }

  triggerAnchorBlobDownload(blob, filename, revokeDelayMs);
}

/**
 * Converts a `data:` URL to a Blob and downloads it via `triggerBlobDownload`,
 * preventing Chrome/Safari mobile download crashes on multi-megabyte `data:` hrefs.
 */
export function triggerDataUrlDownload(dataUrl: string, filename: string): void {
  const mimeMatch = /^data:([^;,]+)/i.exec(dataUrl);
  const mime = mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream';
  const bytes = dataUrlToBytes(dataUrl);
  const blob = new Blob([toArrayBufferBytes(bytes)], { type: mime });
  triggerBlobDownload(blob, filename);
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
