/**
 * Telemetry & User Feedback Service
 *
 * Features:
 * - Robust LocalStorage Offline Queue: Saves ratings and crash logs locally first.
 * - Zero User Wait Time: User sees instant confirmation without waiting for
 *   Render's cold-start wake-up (50-90s).
 * - Automatic Background Sync & Retry: Flushes queue when backend is awake,
 *   on app startup, when network comes online, and on tab visibility change.
 * - Deduplication & Safety Caps: Limits memory usage and prevents duplicate error spam.
 */

import { isChunkLoadError, handleChunkLoadFailure } from './chunkReloader';
import { isDomMutationError } from './domResilience';

export interface ToolFeedbackPayload {
  toolPath: string;
  toolName: string;
  rating: number; // 1 to 5
  feedbackType?: string;
  comment?: string;
}

export interface ToolErrorPayload {
  toolPath: string;
  toolName?: string;
  errorMessage: string;
  errorStack?: string;
  fileInfo?: {
    name?: string;
    size?: number;
    sizeFormatted?: string;
    type?: string;
  };
}

export interface QueuedTelemetryItem {
  id: string;
  type: 'feedback' | 'error';
  payload: ToolFeedbackPayload | ToolErrorPayload;
  timestamp: number;
  retryCount: number;
}

const QUEUE_STORAGE_KEY = 'pdf_telemetry_queue_v1';
const MAX_QUEUE_SIZE = 50;
const MAX_RETRIES = 8;
const REQUEST_TIMEOUT_MS = 25000; // 25s gives Render waking-up instance a fair chance

// In-memory deduplication set to avoid reporting identical errors in quick succession
const recentErrors = new Set<string>();

let isFlushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let intervalStarted = false;

/**
 * Determine backend API URL (custom override, env var, or localhost fallback)
 */
export function getBackendUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('pdf_admin_backend_url');
    if (custom && custom.trim()) return custom.trim().replace(/\/$/, '');
  }
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/$/, '');
  return typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
}

/**
 * Read pending items from localStorage safely
 */
export function getTelemetryQueue(): QueuedTelemetryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.debug('[Telemetry] Failed to read queue from localStorage', err);
    return [];
  }
}

/**
 * Save pending items to localStorage safely with size capping
 */
function saveTelemetryQueue(items: QueuedTelemetryItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep only newest MAX_QUEUE_SIZE items
    const trimmed = items.slice(-MAX_QUEUE_SIZE);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.debug('[Telemetry] Failed to save queue to localStorage', err);
  }
}

/**
 * Return current count of pending queued items (useful for Admin dashboard/status)
 */
export function getPendingTelemetryCount(): number {
  return getTelemetryQueue().length;
}

/**
 * Enqueue an item into the offline queue
 */
function enqueueItem(type: 'feedback' | 'error', payload: ToolFeedbackPayload | ToolErrorPayload): void {
  const queue = getTelemetryQueue();
  const newItem: QueuedTelemetryItem = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  };

  queue.push(newItem);
  saveTelemetryQueue(queue);

  // Trigger background flush attempt without blocking user
  setTimeout(() => {
    void flushTelemetryQueue();
  }, 100);
}

/**
 * Background worker: Flushes pending telemetry items to the backend.
 * If backend is sleeping (Render cold start) or device is offline, items
 * remain safely queued in localStorage for future retry.
 */
export async function flushTelemetryQueue(): Promise<{ sent: number; remaining: number }> {
  if (typeof window === 'undefined') return { sent: 0, remaining: 0 };
  if (isFlushing) {
    const queue = getTelemetryQueue();
    return { sent: 0, remaining: queue.length };
  }

  // If browser is offline, wait for 'online' event
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, remaining: getTelemetryQueue().length };
  }

  const backend = getBackendUrl();
  if (!backend && window.location.hostname !== 'localhost') {
    // Backend URL not configured yet
    return { sent: 0, remaining: getTelemetryQueue().length };
  }

  const queue = getTelemetryQueue();
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  isFlushing = true;
  let sentCount = 0;
  const remainingItems: QueuedTelemetryItem[] = [];

  try {
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];

      const endpoint = item.type === 'feedback'
        ? `${backend}/api/feedback`
        : `${backend}/api/telemetry/error`;

      const requestBody = item.type === 'feedback'
        ? {
            tool_path: (item.payload as ToolFeedbackPayload).toolPath,
            tool_name: (item.payload as ToolFeedbackPayload).toolName,
            rating: (item.payload as ToolFeedbackPayload).rating,
            feedback_type: (item.payload as ToolFeedbackPayload).feedbackType || 'general',
            comment: (item.payload as ToolFeedbackPayload).comment || '',
          }
        : {
            tool_path: (item.payload as ToolErrorPayload).toolPath,
            tool_name: (item.payload as ToolErrorPayload).toolName || inferToolName((item.payload as ToolErrorPayload).toolPath),
            error_message: (item.payload as ToolErrorPayload).errorMessage,
            error_stack: (item.payload as ToolErrorPayload).errorStack || '',
            file_info: (item.payload as ToolErrorPayload).fileInfo || {},
          };

      let success = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json().catch(() => ({ success: true }));
          success = Boolean(data?.success ?? true);
        }
      } catch (reqErr) {
        // Backend sleeping or offline or timeout
        console.debug(`[Telemetry] Send failed for item ${item.id} (will retry later):`, reqErr);
        success = false;
      }

      if (success) {
        sentCount++;
      } else {
        // Item failed to deliver
        item.retryCount += 1;
        if (item.retryCount < MAX_RETRIES) {
          remainingItems.push(item);
        } else {
          console.debug(`[Telemetry] Dropping item ${item.id} after ${MAX_RETRIES} failed retries.`);
        }

        // If this item failed, the backend is likely still booting up or unreachable.
        // Don't hammer the server with the rest of the queue right now; preserve them.
        for (let j = i + 1; j < queue.length; j++) {
          remainingItems.push(queue[j]);
        }
        break;
      }
    }
  } finally {
    saveTelemetryQueue(remainingItems);
    isFlushing = false;

    // If there are still items pending, schedule next retry
    if (remainingItems.length > 0) {
      scheduleNextRetry();
    }
  }

  return { sent: sentCount, remaining: remainingItems.length };
}

/**
 * Schedule next retry attempt with exponential-like delay
 */
function scheduleNextRetry(delayMs = 35000): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    void flushTelemetryQueue();
  }, delayMs);
}

/**
 * Submit manual user rating and feedback.
 *
 * Saves immediately to local offline queue and triggers background sync,
 * guaranteeing the user never waits for Render to wake up.
 */
export async function submitToolFeedback(payload: ToolFeedbackPayload): Promise<boolean> {
  try {
    enqueueItem('feedback', payload);
    return true;
  } catch (err) {
    console.debug('[Telemetry] submitToolFeedback error', err);
    return false;
  }
}

/**
 * Report an automatic error or crash incident.
 *
 * Deduplicates repeated errors in a 30s window, saves to offline queue,
 * and syncs silently in the background.
 */
export async function reportToolError(payload: ToolErrorPayload): Promise<void> {
  try {
    // Never report stale chunk reload errors or browser translation DOM exceptions as crashes
    if (isChunkLoadError(payload.errorMessage) || isDomMutationError(payload.errorMessage)) {
      return;
    }

    const signature = `${payload.toolPath}:${payload.errorMessage.slice(0, 80)}`;
    if (recentErrors.has(signature)) {
      return; // Deduplicate
    }
    recentErrors.add(signature);
    setTimeout(() => recentErrors.delete(signature), 30000);

    enqueueItem('error', payload);
  } catch (err) {
    console.debug('[Telemetry] reportToolError error', err);
  }
}

/**
 * Infer human-readable tool name from route path
 */
export function inferToolName(path: string): string {
  const clean = path.replace(/^\//, '').split('?')[0];
  if (!clean) return 'Home Page';
  return clean
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Initialize global error listeners and offline auto-sync listeners
 */
export function initGlobalErrorLogging(): void {
  if (typeof window === 'undefined') return;

  // 1. Listen for unhandled runtime errors
  window.addEventListener('error', (event) => {
    if (!event.filename || event.filename.includes('chrome-extension')) return;

    // Check for stale chunk load errors (post-deployment cache mismatch)
    if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
      handleChunkLoadFailure('window.error');
      try { event.preventDefault(); } catch {}
      return;
    }

    // Check for Google Translate / extension DOM mutations
    if (isDomMutationError(event.error) || isDomMutationError(event.message)) {
      console.warn('[Telemetry] Suppressed DOM mutation error from reporting:', event.message);
      try { event.preventDefault(); } catch {}
      return;
    }

    void reportToolError({
      toolPath: window.location.pathname,
      errorMessage: event.message || 'Script error',
      errorStack: event.error?.stack || `${event.filename}:${event.lineno}`,
    });
  });

  // 2. Listen for unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason || 'Unhandled Promise Rejection');

    // Check for stale chunk load errors (dynamic import failure)
    if (isChunkLoadError(reason) || isChunkLoadError(msg)) {
      handleChunkLoadFailure('unhandledrejection');
      try { event.preventDefault(); } catch {}
      return;
    }

    // Check for Google Translate / extension DOM mutations
    if (isDomMutationError(reason) || isDomMutationError(msg)) {
      console.warn('[Telemetry] Suppressed DOM mutation rejection from reporting:', msg);
      try { event.preventDefault(); } catch {}
      return;
    }

    void reportToolError({
      toolPath: window.location.pathname,
      errorMessage: msg,
      errorStack: reason?.stack || '',
    });
  });

  // 3. Auto-sync when internet comes back online
  window.addEventListener('online', () => {
    console.debug('[Telemetry] Network online detected. Flushing queue...');
    void flushTelemetryQueue();
  });

  // 4. Auto-sync when user returns to the tab
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getPendingTelemetryCount() > 0) {
      void flushTelemetryQueue();
    }
  });

  // 5. Initial flush for items queued in previous sessions or while backend was sleeping
  setTimeout(() => {
    if (getPendingTelemetryCount() > 0) {
      void flushTelemetryQueue();
    }
  }, 2000);

  // 6. Periodic soft sync (every 60s, only if queue has pending items)
  if (!intervalStarted) {
    intervalStarted = true;
    setInterval(() => {
      if (getPendingTelemetryCount() > 0) {
        void flushTelemetryQueue();
      }
    }, 60000);
  }
}
