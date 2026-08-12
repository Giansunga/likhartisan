import { useEffect, useMemo, useRef, useState } from 'react';
import {
  requestGallerySearch,
  type GallerySearchOptions,
  type GallerySearchPlan,
  type GallerySearchProduct,
  type GallerySearchResponse,
} from '../lib/gallerySearch';

interface GalleryAiSearchArgs {
  enabled: boolean;
  query: string;
  page: number;
  sort: string;
  category: string | null;
  shopId: string | null;
  favoritesOnly: boolean;
  favoriteProductIds: string[];
}

interface SearchResultState {
  query: string;
  requestKey: string;
  products: GallerySearchProduct[];
  searchPlan: GallerySearchPlan | null;
  options: GallerySearchOptions;
  total: number;
  totalPages: number;
  mode: GallerySearchResponse['mode'];
  parserFallback: boolean;
  error: string | null;
  searchId?: string;
}

const EMPTY_OPTIONS: GallerySearchOptions = { categories: [], shops: [], materials: [], techniques: [] };
const EMPTY_RESULT: SearchResultState = {
  query: '',
  requestKey: '',
  products: [],
  searchPlan: null,
  options: EMPTY_OPTIONS,
  total: 0,
  totalPages: 0,
  mode: 'hybrid',
  parserFallback: false,
  error: null,
};

export function useGalleryAiSearch({
  enabled,
  query,
  page,
  sort,
  category,
  shopId,
  favoritesOnly,
  favoriteProductIds,
}: GalleryAiSearchArgs) {
  const [result, setResult] = useState<SearchResultState>(EMPTY_RESULT);
  const [planRevision, setPlanRevision] = useState(0);
  const planRef = useRef<GallerySearchPlan | null>(null);
  const searchIdRef = useRef<string | undefined>(undefined);
  const previousRef = useRef({ query: '', page: 1, sort: '', category: null as string | null, shopId: null as string | null, favoritesOnly: false });
  const favoriteKey = favoriteProductIds.join(',');
  const requestKey = useMemo(
    () => JSON.stringify({ query, page, sort, category, shopId, favoritesOnly, favoriteKey, planRevision }),
    [query, page, sort, category, shopId, favoritesOnly, favoriteKey, planRevision],
  );

  useEffect(() => {
    if (!enabled || query.trim().length < 2) return;

    const previous = previousRef.current;
    const queryChanged = previous.query !== query;
    let interaction: 'search' | 'filter_change' | 'sort' | 'page' = 'search';
    if (!queryChanged) {
      if (previous.page !== page) interaction = 'page';
      else if (previous.sort !== sort) interaction = 'sort';
      else interaction = 'filter_change';
    }
    if (queryChanged) {
      planRef.current = null;
      searchIdRef.current = undefined;
    }
    previousRef.current = { query, page, sort, category, shopId, favoritesOnly };

    const controller = new AbortController();
    void requestGallerySearch({
      query,
      page,
      sort: sort === 'recommended' ? 'relevance' : sort,
      searchId: searchIdRef.current,
      searchPlan: planRef.current ?? undefined,
      interaction,
      visibleFilters: { category, shopId, favoritesOnly, favoriteProductIds },
    }, controller.signal).then(response => {
      planRef.current = response.searchPlan;
      searchIdRef.current = response.searchId;
      setResult({
        query,
        requestKey,
        products: response.products,
        searchPlan: response.searchPlan,
        options: response.options,
        total: response.total,
        totalPages: response.totalPages,
        mode: response.mode,
        parserFallback: response.parserFallback,
        error: null,
        searchId: response.searchId,
      });
    }).catch(searchError => {
      if (searchError instanceof DOMException && searchError.name === 'AbortError') return;
      setResult(previousResult => ({
        ...previousResult,
        query,
        requestKey,
        error: searchError instanceof Error ? searchError.message : 'Gallery search is unavailable',
      }));
    });

    return () => controller.abort();
  }, [enabled, query, page, sort, category, shopId, favoritesOnly, favoriteProductIds, requestKey]);

  function updateSearchPlan(nextPlan: GallerySearchPlan) {
    planRef.current = nextPlan;
    setResult(previousResult => ({ ...previousResult, searchPlan: nextPlan }));
    setPlanRevision(revision => revision + 1);
  }

  const currentQueryResult = enabled && result.query === query;
  return {
    products: currentQueryResult ? result.products : [],
    searchPlan: currentQueryResult ? result.searchPlan : null,
    options: currentQueryResult ? result.options : EMPTY_OPTIONS,
    total: currentQueryResult ? result.total : 0,
    totalPages: currentQueryResult ? result.totalPages : 0,
    mode: currentQueryResult ? result.mode : 'hybrid' as const,
    parserFallback: currentQueryResult && result.parserFallback,
    loading: enabled && result.requestKey !== requestKey,
    error: currentQueryResult ? result.error : null,
    searchId: currentQueryResult ? result.searchId : undefined,
    updateSearchPlan,
  };
}
