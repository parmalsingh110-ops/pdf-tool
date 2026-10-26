/**
 * Centralized API configuration and resilient fetch helper.
 * Prevents Mixed Content errors in production, avoids hardcoded localhost leaks,
 * and adds automatic timeout protection so spinners never get stuck infinitely.
 */

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    let cleaned = envUrl.trim().replace(/\/+$/, '');
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

  return 'http://localhost:8000';
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
    controller.abort();
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
    if (err?.name === 'AbortError') {
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
      controller.abort();
      return sig;
    }
    sig.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}
