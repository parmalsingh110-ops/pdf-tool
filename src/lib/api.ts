/**
 * Centralized API configuration and resilient fetch helper.
 * Prevents Mixed Content errors in production, avoids hardcoded localhost leaks,
 * and adds automatic timeout protection so spinners never get stuck infinitely.
 */

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('pdf_admin_backend_url');
    if (custom && custom.trim()) return custom.trim().replace(/\/+$/, '');
  }

  const isLiveHost =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    let cleaned = envUrl.trim().replace(/\/+$/, '');

    // In live production (e.g. pdfmediasuite.in), if envUrl points to localhost, ignore it to prevent Mixed Content
    if (isLiveHost && (cleaned.includes('localhost') || cleaned.includes('127.0.0.1'))) {
      return '';
    }

    // If the browser page is HTTPS but VITE_API_URL is HTTP (and not localhost), upgrade or alert
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && cleaned.startsWith('http://') && !cleaned.includes('localhost')) {
      cleaned = cleaned.replace(/^http:\/\//, 'https://');
    }
    return cleaned;
  }

  // Development fallback
  if (import.meta.env.DEV) {
    return 'http://localhost:8000';
  }

  // Production fallback: If running on HTTPS, avoid mixed content block
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return ''; // Relative path, handled by server proxy/rewrite
  }

  return isLiveHost ? '' : 'http://localhost:8000';
}

export const API_BASE = getApiBaseUrl();
export const API_BASE_URL = API_BASE;

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Resilient fetch wrapper with automatic timeout and meaningful error formatting.
 */
export async function apiFetch(endpoint: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 60000, ...fetchOptions } = options;

  const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Request timeout', 'AbortError'));
  }, timeoutMs);

  const signal = fetchOptions.signal
    ? anySignal([fetchOptions.signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal,
    });
    return response;
  } catch (err: any) {
    const isAborted =
      err?.name === 'AbortError' ||
      err?.message?.toLowerCase().includes('abort') ||
      err?.message?.toLowerCase().includes('aborted');

    // Never log normal client timeouts or routine poll aborts to telemetry
    if (!isAborted && !endpoint.includes('/api/telemetry')) {
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Helper to combine multiple abort signals safely
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason || new DOMException('Request aborted', 'AbortError'));
      return sig;
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason || new DOMException('Request aborted', 'AbortError')), { once: true });
  }
  return controller.signal;
}
