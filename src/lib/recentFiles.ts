const KEY = 'mediasuite-recent-tools';
const MAX = 12;

export type RecentEntry = {
  path: string;
  title: string;
  at: number;
};

/** Safe localStorage access — returns null if storage is unavailable (Safari
 *  private mode, disabled cookies, quota errors, etc.). */
function safeGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    /* quota exceeded or storage disabled — silently ignore */
  }
}

function isValidEntry(e: unknown): e is RecentEntry {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.path === 'string' && r.path.length > 0 && r.path.length < 500 &&
    typeof r.title === 'string' && r.title.length < 200 &&
    typeof r.at === 'number' && Number.isFinite(r.at) && r.at > 0
  );
}

export function recordToolVisit(path: string, title: string) {
  if (!path || typeof path !== 'string') return;
  try {
    const raw = safeGetItem(KEY);
    let list: RecentEntry[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed.filter(isValidEntry);
    }
    list = list.filter((e) => e.path !== path);
    list.unshift({
      path,
      title: typeof title === 'string' && title ? title.slice(0, 100) : path,
      at: Date.now(),
    });
    list = list.slice(0, MAX);
    safeSetItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore — never let recent-tracking break navigation */
  }
}

const LOWER_WORDS = new Set(['to', 'in', 'on', 'by', 'for', 'of', 'the', 'and', 'with', 'from', 'as', 'into']);
const UPPER_WORDS = new Set([
  'pdf', 'ai', 'ocr', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'gif', 'svg',
  'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'html', 'css', 'md', 'qr',
  'kyc', 'pvc', 'drm', 'exif', 'url', 'api', 'cmyk', 'rgb', 'kb', 'mb',
  '4k', 'a4', 'id', 'upi', 'gps', 'sha', 'pan', 'bsa', 'n', 'toc',
]);

/** Convert raw route slug like `/pdf-to-word` into readable title `PDF to Word`. */
export function formatRouteSlugTitle(path: string): string {
  const cleaned = (path || '').replace(/^\/+|\/+$/g, '');
  if (!cleaned) return 'Home';
  const words = cleaned.split(/[-_/]+/).filter(Boolean);
  return words
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (UPPER_WORDS.has(lower)) return lower.toUpperCase();
      if (idx > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Human-friendly relative timestamp (`Just now`, `5m ago`, `2h ago`, `Yesterday`). */
export function formatRelativeVisit(at: number, now = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return 'Recently';
  const diffSec = Math.max(0, Math.floor((now - at) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  try {
    return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Earlier';
  }
}

export function readRecentTools(): RecentEntry[] {
  try {
    const raw = safeGetItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter out malformed entries (could exist from older versions of the app)
    return parsed.filter(isValidEntry).slice(0, MAX);
  } catch {
    return [];
  }
}

export function removeRecentTool(path: string): RecentEntry[] {
  const next = readRecentTools().filter((e) => e.path !== path);
  safeSetItem(KEY, JSON.stringify(next));
  return next;
}

export function clearRecentTools(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}
