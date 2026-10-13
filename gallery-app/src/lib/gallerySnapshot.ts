import type { Product } from '../types';
import type { UserProductSignal } from './recommendations';

export interface GallerySnapshot {
  owner: string;
  urlSearch: string;
  allProducts: Product[];
  variantPrices: Record<string, number>;
  variationAvailability: Record<string, boolean>;
  productRatings: Record<string, { avg: number; count: number }>;
  signals: UserProductSignal[];
  visitSeed: number;
  activeCategory: string | null;
  search: string;
  sort: string;
  showFavorites: boolean;
  page: number;
  scrollY: number;
  openedProduct?: string;
  orderedIds: string[];
  recordedSearches: string[];
}

let snapshot: GallerySnapshot | null = null;
function context(search: string) {
  const params = new URLSearchParams(search);
  return JSON.stringify([params.get('category') || '', params.get('shop') || '']);
}
export function readGallerySnapshot(owner: string, search: string): GallerySnapshot | null {
  if (!snapshot || snapshot.owner !== owner) return null;
  const params = new URLSearchParams(search);
  return (!params.get('category') && !params.get('shop')) || context(search) === context(snapshot.urlSearch) ? snapshot : null;
}
export function saveGallerySnapshot(next: GallerySnapshot) { snapshot = next; }
export function clearGallerySnapshot() { snapshot = null; }
export function clearGalleryForOtherAccount(owner: string) {
  if (snapshot && snapshot.owner !== owner) clearGallerySnapshot();
}
