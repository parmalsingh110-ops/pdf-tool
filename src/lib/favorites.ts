const STORAGE_KEY = 'pms_favorites';

export interface FavoriteItem {
  path: string;
  title: string;
}

function load(): FavoriteItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function save(items: FavoriteItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
