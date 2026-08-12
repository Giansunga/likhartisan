import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GALLERY_PAGE_SIZE,
  localSearchPlan,
  mergeFilters,
  normalizeGalleryQuery,
  searchGallery,
  validateSearchPlan,
} from './gallerySearchService.js';

const shopId = '6b7be271-c73c-49db-b228-4bb899c8020c';
const otherShopId = 'ecbc299e-4508-40b6-991b-58512ce68881';
const taxonomy = {
  categories: ['Planters', 'Vases'],
  shops: [{ id: shopId, name: 'Tomas Pottery' }, { id: otherShopId, name: 'Likha Studio' }],
  materials: ['Stoneware', 'Terracotta'],
  techniques: ['Hand-built', 'Wheel-thrown'],
};

test('normalizes bilingual gallery queries without losing peso amounts', () => {
  assert.equal(normalizeGalleryQuery('  Plórera   below ₱2,000! '), 'plorera below ₱2,000');
});

test('validates catalog values and normalizes reversed price bounds', () => {
  const plan = validateSearchPlan({
    semanticQuery: 'modern vase',
    filters: {
      category: 'vases', shopId: 'invented', minPrice: 5000, maxPrice: 1000,
      material: 'Moon dust', technique: 'wheel-THROWN',
    },
  }, taxonomy, 'modern vase');

  assert.deepEqual(plan.filters, {
    category: 'Vases', shopId: null, minPrice: 1000, maxPrice: 5000,
    material: null, technique: 'Wheel-thrown',
  });
});

test('fallback parsing translates Filipino terms and extracts price and taxonomy filters', () => {
  const plan = localSearchPlan('terracotta plorera na hindi lalampas sa ₱2,000', taxonomy);
  assert.match(plan.semanticQuery, /vase/);
  assert.equal(plan.filters.material, 'Terracotta');
  assert.equal(plan.filters.maxPrice, 2000);
});

test('visible category and shop filters override parser filters without dropping other constraints', () => {
  const merged = mergeFilters({
    category: 'Vases', shopId, minPrice: null, maxPrice: 2000,
    material: 'Terracotta', technique: null,
  }, { category: 'Planters', shopId: otherShopId }, taxonomy);

  assert.deepEqual(merged, {
    category: 'Planters', shopId: otherShopId, minPrice: null, maxPrice: 2000,
    material: 'Terracotta', technique: null,
  });
});

function chain(result) {
  const value = {
    select: () => value,
    eq: () => value,
    gt: () => value,
    order: () => value,
    limit: () => value,
    maybeSingle: async () => result,
    upsert: async () => ({ error: null }),
    insert: async () => ({ error: null }),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return value;
}

test('reuses a cached parsed plan and embedding for retrieval and fixed pagination', async () => {
  const embedding = Array.from({ length: 384 }, () => 0.01);
  const cachedPlan = {
    semanticQuery: 'terracotta vase',
    filters: { category: 'Vases', shopId: null, minPrice: null, maxPrice: 2000, material: 'Terracotta', technique: null },
  };
  const rpcCalls = [];
  const supabase = {
    from(table) {
      if (table === 'products') return chain({ data: [
        { category: 'Vases', materials: 'Terracotta', technique: 'Wheel-thrown', shop_id: shopId, shop_name: 'Tomas Pottery' },
      ], error: null });
      if (table === 'gallery_search_cache') return chain({ data: { semantic_query: cachedPlan.semanticQuery, search_plan: cachedPlan, embedding }, error: null });
      return chain({ data: null, error: null });
    },
    functions: { invoke: async () => { throw new Error('embedding should come from cache'); } },
    rpc: async (name, input) => {
      rpcCalls.push({ name, input });
      return { data: [], error: null };
    },
  };

  const response = await searchGallery(supabase, {
    query: 'terracotta vase below 2000', page: 3, sort: 'price-asc',
    visibleFilters: { category: null, shopId: null, favoritesOnly: false, favoriteProductIds: [] },
  });

  assert.equal(response.searchPlan.semanticQuery, 'terracotta vase');
  assert.equal(response.pageSize, GALLERY_PAGE_SIZE);
  assert.equal(response.mode, 'hybrid');
  assert.equal(rpcCalls[0].input.p_page, 3);
  assert.equal(rpcCalls[0].input.p_page_size, 24);
  assert.equal(rpcCalls[0].input.p_query_text, 'terracotta vase below 2000');
  assert.equal(rpcCalls[0].input.p_query_embedding.length, 384);
});

test('rejects raw queries longer than 200 characters instead of silently truncating', async () => {
  await assert.rejects(
    searchGallery({}, { query: 'a'.repeat(201) }),
    error => error instanceof Error && error.message === 'INVALID_QUERY',
  );
});
