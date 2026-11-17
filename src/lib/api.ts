import { isAllowedBackendOverride } from './privacy';

/**
 * Centralized API Gateway, Client-Side Load Balancer & Resilient Fetch Engine
 * ===========================================================================
 * - Supports single backend URL or comma-separated multi-node load balancing pool
 *   (VITE_API_URL / VITE_API_POOL_URLS) with latency-aware routing & circuit breaking.
 * - Automatically handles IRCTC-style Virtual Waiting Room backpressure (HTTP 503 / 429
 *   with Retry-After) and Render cold-start 502/504 errors using jittered backoff.
 * - Coalesces concurrent identical GET requests in-flight to eliminate duplicate network calls.
 * - Prevents Mixed Content errors in production and enforces hard request timeouts.
 */

interface NodeHealth {
  url: string;
  ewmaLatencyMs: number;
  failures: number;
  cooldownUntil: number;
}

const NODE_HEALTH = new Map<string, NodeHealth>();
const IN_FLIGHT_GET = new Map<string, Promise<{ status: number; statusText: string; headers: [string, string][]; body: ArrayBuffer }>>();

function sanitizeNodeUrl(raw: string, isLiveHost: boolean): string | null {
  let cleaned = raw.trim().replace(/\/+$/, '');
  if (!cleaned) return null;

  // In live production (e.g. pdfmediasuite.in), ignore localhost entries to prevent Mixed Content
  if (isLiveHost && (cleaned.includes('localhost') || cleaned.includes('127.0.0.1'))) {
    return null;
  }

  // Upgrade HTTP to HTTPS when served from an HTTPS origin
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    cleaned.startsWith('http://') &&
    !cleaned.includes('localhost')
  ) {
    cleaned = cleaned.replace(/^http:\/\//, 'https://');
  }
  return cleaned;
}

export function getApiPoolUrls(): string[] {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('pdf_admin_backend_url');
    if (custom && custom.trim() && isAllowedBackendOverride(custom)) {
      return [custom.trim().replace(/\/+$/, '')];
    }
  }

  const isLiveHost =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  const rawPool = [
    import.meta.env.VITE_API_POOL_URLS,
    import.meta.env.VITE_API_URL,
  ]
    .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
    .join(',');

  if (rawPool) {
    const urls = Array.from(
      new Set(
        rawPool
          .split(',')
          .map((part) => sanitizeNodeUrl(part, isLiveHost))
          .filter((u): u is string => u !== null)
      )
    );
    if (urls.length > 0) return urls;
  }

  if (import.meta.env.DEV) {
    return ['http://localhost:8000'];
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return [''];
  }

  return [isLiveHost ? '' : 'http://localhost:8000'];
}

export function getApiBaseUrl(): string {
  return selectBestBackendNode();
}

function selectBestBackendNode(): string {
  const pool = getApiPoolUrls();
  if (pool.length <= 1) return pool[0] ?? '';

  const now = Date.now();
  let bestUrl = pool[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const url of pool) {
    let state = NODE_HEALTH.get(url);
    if (!state) {
      state = { url, ewmaLatencyMs: 250, failures: 0, cooldownUntil: 0 };
      NODE_HEALTH.set(url, state);
    }
    const inCooldown = now < state.cooldownUntil;
    const score = state.ewmaLatencyMs + state.failures * 600 + (inCooldown ? 50000 : 0);
    if (score < bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return bestUrl;
}

function recordNodeOutcome(baseUrl: string, ok: boolean, elapsedMs: number): void {
  const state = NODE_HEALTH.get(baseUrl) || {
    url: baseUrl,
    ewmaLatencyMs: elapsedMs,
    failures: 0,
    cooldownUntil: 0,
  };
  if (ok) {
    state.ewmaLatencyMs = Math.round(state.ewmaLatencyMs * 0.7 + elapsedMs * 0.3);
    state.failures = 0;
    state.cooldownUntil = 0;
  } else {
    state.failures += 1;
    if (state.failures >= 2) {
      state.cooldownUntil = Date.now() + Math.min(30000, state.failures * 5000);
    }
  }
  NODE_HEALTH.set(baseUrl, state);
}

export const API_BASE = getApiBaseUrl();
export const API_BASE_URL = API_BASE;

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
  suppressTelemetry?: boolean;
  maxRetries?: number;
}

function sleepWithSignal(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('Request aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason || new DOMException('Request aborted', 'AbortError'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Resilient load-balanced fetch wrapper with automatic Virtual Waiting Room retry,
 * in-flight GET deduplication, and timeout protection.
 */
export async function apiFetch(endpoint: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 60000, maxRetries = 2, suppressTelemetry, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const isAbsolute = endpoint.startsWith('http://') || endpoint.startsWith('https://');

  // Coalesce identical concurrent GET requests (e.g. /vision/status, /health)
  if (method === 'GET' && !fetchOptions.signal) {
    const existing = IN_FLIGHT_GET.get(endpoint);
    if (existing) {
      const snap = await existing;
      return new Response(snap.body.slice(0), {
        status: snap.status,
        statusText: snap.statusText,
        headers: snap.headers,
      });
    }
  }

  const execRequest = async (): Promise<Response> => {
    const pool = isAbsolute ? [''] : getApiPoolUrls();
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const chosenBase = isAbsolute
        ? ''
        : attempt === 0
          ? selectBestBackendNode()
          : pool[attempt % pool.length];

      const url = isAbsolute
        ? endpoint
        : `${chosenBase}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('Request timeout', 'AbortError'));
      }, timeoutMs);

      const combined = fetchOptions.signal
        ? anySignal([fetchOptions.signal, controller.signal])
        : { signal: controller.signal, cleanup: () => {} };

      const startMs = performance.now();
      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: combined.signal,
        });
        const elapsedMs = Math.round(performance.now() - startMs);

        // Handle Virtual Waiting Room backpressure (503) or quick cold-start warmup (502/504).
        // Never retry long-running timed-out/crashed heavy POST uploads that already ran >15s on server.
        const canRetryGateway =
          (response.status === 503 || response.status === 502 || response.status === 504) &&
          attempt < maxRetries &&
          (method === 'GET' || elapsedMs < 15000);
        if (canRetryGateway) {
          recordNodeOutcome(chosenBase, false, elapsedMs);
          const retryAfterHdr = Number(response.headers.get('Retry-After'));
          const baseDelayMs = Number.isFinite(retryAfterHdr) && retryAfterHdr > 0
            ? Math.min(8000, retryAfterHdr * 1000)
            : 1200 * (attempt + 1);
          const jitterMs = Math.floor(Math.random() * 450);
          await sleepWithSignal(baseDelayMs + jitterMs, fetchOptions.signal);
          continue;
        }

        recordNodeOutcome(chosenBase, response.status < 500, elapsedMs);
        return response;
      } catch (err: any) {
        lastError = err;
        const elapsedMs = Math.round(performance.now() - startMs);
        recordNodeOutcome(chosenBase, false, elapsedMs);

        const callerAborted = Boolean(fetchOptions.signal?.aborted);
        // Never re-send an already timed-out heavy request onto an active backend (prevents duplicate OOM spikes)
        if (callerAborted || timedOut || err?.name === 'AbortError') {
          throw err;
        }

        // Retry only fast transient network drops (e.g. cold connection wakeup <12s)
        if (attempt < maxRetries && (method === 'GET' || elapsedMs < 12000)) {
          const backoffMs = 900 * (attempt + 1) + Math.floor(Math.random() * 350);
          try {
            await sleepWithSignal(backoffMs, fetchOptions.signal);
            continue;
          } catch {
            break;
          }
        }
      } finally {
        clearTimeout(timeoutId);
        combined.cleanup();
      }
    }

    const err = lastError;
    const isAborted =
      err?.name === 'AbortError' ||
      err?.message?.toLowerCase().includes('abort') ||
      err?.message?.toLowerCase().includes('aborted');

    const isNetworkDown =
      err?.message?.includes('Failed to fetch') ||
      err?.message?.includes('NetworkError') ||
      err?.message?.includes('ERR_CONNECTION_REFUSED') ||
      err?.message?.includes('Load failed');

    if (!isAborted && !isNetworkDown && !suppressTelemetry && !endpoint.includes('/api/telemetry')) {
      try {
        const { reportToolError } = await import('./telemetry');
        void reportToolError({
          toolPath: typeof window !== 'undefined' ? window.location.pathname : endpoint,
          errorMessage: err?.message || 'API Fetch Failed',
        });
      } catch {}
    }
    if (err?.name === 'AbortError' || isAborted) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. The backend may be waking up or processing a heavy task. Please try again.`);
    }
    if (err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError')) {
      throw new Error('Could not connect to the backend server. If using free hosting, please wait 30 seconds for the server to wake up and try again.');
    }
    throw err;
  };

  if (method === 'GET' && !fetchOptions.signal) {
    const sharedPromise = execRequest().then(async (res) => {
      const body = await res.arrayBuffer();
      const headers: [string, string][] = [];
      res.headers.forEach((v, k) => headers.push([k, v]));
      return {
        status: res.status,
        statusText: res.statusText,
        headers,
        body,
      };
    });
    IN_FLIGHT_GET.set(endpoint, sharedPromise);
    try {
      const snap = await sharedPromise;
      return new Response(snap.body.slice(0), {
        status: snap.status,
        statusText: snap.statusText,
        headers: snap.headers,
      });
    } finally {
      IN_FLIGHT_GET.delete(endpoint);
    }
  }

  return execRequest();
}

/**
 * Helper to combine multiple abort signals cleanly without listener leaks
 */
function anySignal(signals: AbortSignal[]): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const listeners: Array<{ sig: AbortSignal; fn: () => void }> = [];

  const cleanup = () => {
    for (const { sig, fn } of listeners) {
      try {
        sig.removeEventListener('abort', fn);
      } catch {}
    }
    listeners.length = 0;
  };

  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason || new DOMException('Request aborted', 'AbortError'));
      return { signal: controller.signal, cleanup };
    }
    const onAbort = () => {
      controller.abort(sig.reason || new DOMException('Request aborted', 'AbortError'));
      cleanup();
    };
    sig.addEventListener('abort', onAbort, { once: true });
    listeners.push({ sig, fn: onAbort });
  }
  return { signal: controller.signal, cleanup };
}
