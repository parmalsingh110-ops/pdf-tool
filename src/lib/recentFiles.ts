const KEY = 'mediasuite-recent-tools';
const MAX = 12;

export type RecentEntry = {
  path: string;
  title: string;
  at: number;
};

export function recordToolVisit(path: string, title: string) {
  try {
    const raw = localStorage.getItem(KEY);
    let list: RecentEntry[] = raw ? JSON.parse(raw) : [];
    list = list.filter((e) => e.path !== path);
    list.unshift({ path, title, at: Date.now() });
    list = list.slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function readRecentTools(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
