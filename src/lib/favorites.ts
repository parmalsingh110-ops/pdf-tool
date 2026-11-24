const STORAGE_KEY = 'pms_favorites';

export interface FavoriteItem {
  path: string;
  title: string;
}

function load(): FavoriteItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: FavoriteItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage access errors in strict WebViews / private mode
  }
}

export function getFavorites(): FavoriteItem[] {
  return load();
}

export function isFavorite(path: string): boolean {
  return load().some((f) => f.path === path);
}

export function addFavorite(item: FavoriteItem): void {
  const all = load();
  if (!all.some((f) => f.path === item.path)) {
    save([...all, item]);
  }
}

export function removeFavorite(path: string): void {
  save(load().filter((f) => f.path !== path));
}

export function toggleFavorite(item: FavoriteItem): boolean {
  if (isFavorite(item.path)) {
    removeFavorite(item.path);
    return false; // removed
  } else {
    addFavorite(item);
    return true; // added
  }
}
