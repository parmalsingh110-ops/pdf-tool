/**
 * Dynamic Chunk Reloader & Stale Build Recovery Layer
 *
 * When a new production version is deployed to pdfmediasuite.in,
 * chunk asset filenames change with new content hashes.
 * Users with already-open browser tabs who navigate to lazy-loaded routes
 * request the old deleted chunk and trigger:
 * "TypeError: Failed to fetch dynamically imported module: https://www.pdfmediasuite.in/assets/..."
 * Or in React lazy evaluation:
 * "Cannot read properties of undefined (reading 'default')" / "undefined is not an object (evaluating 'H._result.default')"
 *
 * This layer:
 * 1. Catches Vite's `vite:preloadError` event, window errors, and unhandled chunk rejections.
 * 2. Automatically and seamlessly reloads the page to load the latest deployment.
 * 3. Prevents reload loops using a sessionStorage timestamp throttle (at most 1 reload per 15s).
 * 4. Suppresses these non-crash deployment events from false-alarming Discord telemetry.
 */

const CHUNK_RELOAD_KEY = 'pdf_suite_chunk_reload_ts';
const RELOAD_THROTTLE_MS = 15000;

export function isChunkLoadError(err: any): boolean {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.name || String(err)).toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror') ||
    msg.includes('failed to load module script') ||
    msg.includes("reading 'default'") ||
    msg.includes('_result.default') ||
    msg.includes('reading default') ||
    msg.includes('error resolving module')
  );
}

export function handleChunkLoadFailure(source = 'unknown'): boolean {
  if (typeof window === 'undefined') return false;

  const lastReload = sessionStorage.getItem(CHUNK_RELOAD_KEY);
  const now = Date.now();

  // If reloaded recently (within 15s), don't reload again (could be an offline network failure)
  if (lastReload && now - Number(lastReload) < RELOAD_THROTTLE_MS) {
    console.warn(`[ChunkLoader] Stale chunk detected from ${source}, but reload was throttled to prevent loop.`);
    return false;
  }

  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  console.warn(`[ChunkLoader] Stale deployment chunk detected from ${source}. Reloading page to fetch latest version...`);

  // Immediate page refresh to grab fresh index.html and current chunks
  window.location.reload();
  return true;
}

export function initChunkReloader(): void {
  if (typeof window === 'undefined') return;

  // 1. Native Vite Preload Error Event
  window.addEventListener('vite:preloadError', (event: any) => {
    try {
      event?.preventDefault?.();
    } catch {}
    handleChunkLoadFailure('vite:preloadError');
  });

  // 2. Catch unhandled chunk rejection before it cascades
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (isChunkLoadError(reason)) {
      try {
        event.preventDefault();
        event.stopImmediatePropagation();
      } catch {}
      handleChunkLoadFailure('unhandledrejection:chunk');
    }
  });
}
