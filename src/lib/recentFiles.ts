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
