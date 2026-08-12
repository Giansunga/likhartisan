import type { Product } from '../types';
import { API_BASE } from './api';
import { supabase } from './supabase';

export const AI_GALLERY_SEARCH_ENABLED = import.meta.env.VITE_AI_GALLERY_SEARCH_ENABLED === 'true';

export interface GallerySearchFilters {
  category: string | null;
  shopId: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  material: string | null;
  technique: string | null;
}

export interface GallerySearchPlan {
  semanticQuery: string;
  filters: GallerySearchFilters;
}

export interface GallerySearchOptions {
  categories: string[];
  shops: Array<{ id: string; name: string }>;
  materials: string[];
  techniques: string[];
}

export interface GallerySearchProduct extends Product {
  effectivePrice: number;
  relevance: number;
}

export interface GallerySearchResponse {
  searchId: string;
  searchPlan: GallerySearchPlan;
  appliedFilters: GallerySearchFilters;
  options: GallerySearchOptions;
  products: GallerySearchProduct[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  mode: 'hybrid' | 'keyword_fallback';
  parserFallback: boolean;
  latencyMs: number;
}

export interface GallerySearchRequest {
  query: string;
  page: number;
  sort: string;
  searchId?: string;
  searchPlan?: GallerySearchPlan;
  interaction?: 'search' | 'filter_change' | 'sort' | 'page';
  visibleFilters: {
    category: string | null;
    shopId: string | null;
    favoritesOnly: boolean;
    favoriteProductIds: string[];
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function requestGallerySearch(request: GallerySearchRequest, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/api/gallery/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(request),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Gallery search is unavailable');
  return body as GallerySearchResponse;
}

export async function recordGallerySearchClick(searchId: string, productId: string) {
  const response = await fetch(`${API_BASE}/api/gallery/search/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ searchId, productId }),
  });
  if (!response.ok) throw new Error('Unable to record search click');
}

export async function resetGallerySearchHistory() {
  const response = await fetch(`${API_BASE}/api/gallery/search/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  });
  if (!response.ok) throw new Error('Unable to reset recommendation history');
}

