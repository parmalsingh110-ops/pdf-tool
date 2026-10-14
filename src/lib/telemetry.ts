/**
 * Telemetry & User Feedback Service
 * Sends feedback and automatic error telemetry to the backend.
 * Falls back to local memory if offline, never interrupts user experience.
 */

// In development or production, determine backend API URL
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:8000' : '');

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

// In-memory deduplication set to avoid reporting the same error multiple times
const recentErrors = new Set<string>();

/**
 * Submit manual user rating and feedback
 */
export async function submitToolFeedback(payload: ToolFeedbackPayload): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_path: payload.toolPath,
        tool_name: payload.toolName,
        rating: payload.rating,
        feedback_type: payload.feedbackType || 'general',
        comment: payload.comment || '',
      }),
    });
    const data = await res.json();
    return Boolean(data?.success);
  } catch (err) {
    // Fail silently so user workflow is never disrupted
    console.debug('[Telemetry] Feedback submit failed (offline or backend unavailable)', err);
    return false;
  }
}

/**
 * Report an automatic error or crash incident
 */
export async function reportToolError(payload: ToolErrorPayload): Promise<void> {
  try {
    const signature = `${payload.toolPath}:${payload.errorMessage.slice(0, 80)}`;
    if (recentErrors.has(signature)) {
      return; // Already reported in this session recently
    }
    recentErrors.add(signature);
    setTimeout(() => recentErrors.delete(signature), 30000); // 30s debounce

    await fetch(`${BACKEND_URL}/api/telemetry/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_path: payload.toolPath,
        tool_name: payload.toolName || inferToolName(payload.toolPath),
        error_message: payload.errorMessage,
        error_stack: payload.errorStack || '',
        file_info: payload.fileInfo || {},
      }),
    });
  } catch (err) {
    console.debug('[Telemetry] Error report failed (offline or backend unreachable)', err);
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
 * Initialize global unhandled error and rejection listeners
 */
export function initGlobalErrorLogging() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    // Ignore non-application errors (e.g., third-party browser extension noise)
    if (!event.filename || event.filename.includes('chrome-extension')) return;

    reportToolError({
      toolPath: window.location.pathname,
      errorMessage: event.message || 'Script error',
      errorStack: event.error?.stack || `${event.filename}:${event.lineno}`,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason || 'Unhandled Promise Rejection');
    reportToolError({
      toolPath: window.location.pathname,
      errorMessage: msg,
      errorStack: reason?.stack || '',
    });
  });
}
