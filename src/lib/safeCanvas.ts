import { dataUrlToBytes, toArrayBufferBytes } from './blobUrl';

const MOBILE_DEVICE_RE = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i;

/**
 * Returns true on phones and tablets (including iPadOS 13+ reporting MacIntel with touch).
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (MOBILE_DEVICE_RE.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) {
    return true;
  }
  return false;
}

/**
 * Maximum safe canvas backing-store area (width * height) to stay safely under
 * iOS Safari's ~16.7 MP hard canvas limit and low-RAM Android WebView OOM ceilings.
 */
export function getSafeCanvasMaxPixels(): number {
  return isMobileDevice() ? 12_000_000 : 24_000_000;
}

/**
 * Proportionally clamps canvas dimensions to stay within both total pixel area (`maxPixels`)
 * and single-axis GPU texture limits (`4096` px on mobile/iOS, `16384` px on desktop).
 */
export function clampCanvasDimensions(
  width: number,
  height: number,
  maxPixels?: number
): { width: number; height: number; scale: number; clamped: boolean } {
  const safeW = Number.isFinite(width) && width > 0 ? width : 1;
  const safeH = Number.isFinite(height) && height > 0 ? height : 1;

  const limitPixels =
    typeof maxPixels === 'number' && Number.isFinite(maxPixels) && maxPixels > 0
      ? maxPixels
      : getSafeCanvasMaxPixels();

  const maxSide = isMobileDevice() ? 4096 : 16384;

  let scale = 1;
  const longestSide = Math.max(safeW, safeH);
  if (longestSide > maxSide) {
    scale = Math.min(scale, maxSide / longestSide);
  }

  const area = safeW * safeH;
  if (area * scale * scale > limitPixels) {
    scale = Math.min(scale, Math.sqrt(limitPixels / area));
  }

  if (scale < 1) {
    return {
      width: Math.max(1, Math.floor(safeW * scale)),
      height: Math.max(1, Math.floor(safeH * scale)),
      scale,
      clamped: true,
    };
  }

  return {
    width: Math.max(1, Math.round(safeW)),
    height: Math.max(1, Math.round(safeH)),
    scale: 1,
    clamped: false,
  };
}

/**
 * Computes a safe PDF.js render scale given a page's unscaled (scale = 1) dimensions
 * and the caller's desired scale, never exceeding `desiredScale`.
 */
export function clampPdfScale(
  baseWidth: number,
  baseHeight: number,
  desiredScale: number,
  maxPixels?: number
): number {
  if (
    !Number.isFinite(baseWidth) ||
    !Number.isFinite(baseHeight) ||
    !Number.isFinite(desiredScale) ||
    baseWidth <= 0 ||
    baseHeight <= 0 ||
    desiredScale <= 0
  ) {
    return Math.max(0.1, Number.isFinite(desiredScale) && desiredScale > 0 ? desiredScale : 1);
  }

  const targetW = baseWidth * desiredScale;
  const targetH = baseHeight * desiredScale;
  const { scale } = clampCanvasDimensions(targetW, targetH, maxPixels);
  return Math.max(0.1, desiredScale * scale);
}

/**
 * Immediately frees the backing-store bitmap memory of a temporary canvas
 * (critical on iOS Safari which enforces a ~224–384 MB cumulative canvas budget).
 */
export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

let cachedWebpSupport: boolean | null = null;

/**
 * Memoized check for whether `HTMLCanvasElement.toDataURL('image/webp')` actually
 * encodes WebP (older iOS Safari silently falls back to PNG).
 */
export function supportsCanvasWebp(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  if (typeof document === 'undefined') {
    cachedWebpSupport = false;
    return false;
  }
  try {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    const dataUrl = c.toDataURL('image/webp');
    releaseCanvas(c);
    cachedWebpSupport = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/webp');
    return cachedWebpSupport;
  } catch {
    cachedWebpSupport = false;
    return false;
  }
}

/**
 * Exports a canvas to a non-empty `data:` URL, automatically falling back from WebP
 * to PNG if WebP encoding is unsupported, and throwing a descriptive Error if the
 * browser returns an empty `'data:,'` due to memory exhaustion.
 */
export function safeCanvasToDataUrl(
  canvas: HTMLCanvasElement,
  mime = 'image/png',
  quality?: number
): string {
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('Cannot export an empty canvas (0×0 dimensions).');
  }
  const effectiveMime =
    mime.toLowerCase() === 'image/webp' && !supportsCanvasWebp() ? 'image/png' : mime;

  const url =
    typeof quality === 'number'
      ? canvas.toDataURL(effectiveMime, quality)
      : canvas.toDataURL(effectiveMime);

  if (!url || url === 'data:,' || url.length < 32) {
    throw new Error(
      'Canvas export failed (browser memory or dimension limit exceeded). Try a lower resolution.'
    );
  }
  return url;
}

/**
 * Exports a canvas to a guaranteed non-null `Blob`, handling WebP fallback and
 * browsers/WebViews where `canvas.toBlob()` resolves `null` or is unavailable.
 */
export function safeCanvasToBlob(
  canvas: HTMLCanvasElement,
  mime = 'image/png',
  quality?: number
): Promise<Blob> {
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
    return Promise.reject(new Error('Cannot export an empty canvas (0×0 dimensions).'));
  }

  const effectiveMime =
    mime.toLowerCase() === 'image/webp' && !supportsCanvasWebp() ? 'image/png' : mime;

  const fallbackFromDataUrl = (): Blob => {
    const dataUrl = safeCanvasToDataUrl(canvas, effectiveMime, quality);
    const match = /^data:([^;,]+)/i.exec(dataUrl);
    const resolvedMime = match ? match[1].trim() : effectiveMime;
    const bytes = dataUrlToBytes(dataUrl);
    return new Blob([toArrayBufferBytes(bytes)], { type: resolvedMime });
  };

  if (typeof canvas.toBlob !== 'function') {
    try {
      return Promise.resolve(fallbackFromDataUrl());
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
            return;
          }
          try {
            const recovered = fallbackFromDataUrl();
            if (recovered.size > 0) {
              resolve(recovered);
              return;
            }
          } catch {
            // Fall through to rejection below
          }
          reject(
            new Error(
              'Canvas export failed (returned empty image). Try reducing resolution or quality.'
            )
          );
        },
        effectiveMime,
        quality
      );
    } catch (err) {
      try {
        resolve(fallbackFromDataUrl());
      } catch {
        reject(
          err instanceof Error
            ? err
            : new Error('Canvas export failed while encoding image blob.')
        );
      }
    }
  });
}
