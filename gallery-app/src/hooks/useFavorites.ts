import { useCallback, useSyncExternalStore } from 'react';
import { FAVORITES_KEY, loadFavorites, saveFavorites } from '../lib/utils';

const CHANGE_EVENT = 'likhartisan-favorites-changed';
let snapshot: string[] = [];

function getSnapshot() {
  const stored = loadFavorites();
  if (stored.length !== snapshot.length || stored.some((id, index) => id !== snapshot[index])) snapshot = stored;
  return snapshot;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot);
  const toggleFavorite = useCallback((id: string) => {
    const current = loadFavorites();
    saveFavorites(current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return { favorites, toggleFavorite };
}
