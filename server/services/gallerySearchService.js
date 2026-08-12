import crypto from 'crypto';
import { Output, gateway, generateText } from 'ai';
import { z } from 'zod';

export const GALLERY_PAGE_SIZE = 24;
export const DEFAULT_SEARCH_MODEL = 'alibaba/qwen3.5-flash';

const SEARCH_PLAN_SCHEMA = z.object({
  semanticQuery: z.string().min(2).max(200),
  filters: z.object({
    category: z.string().nullable(),
    shopId: z.string().nullable(),
    minPrice: z.number().nonnegative().nullable(),
    maxPrice: z.number().nonnegative().nullable(),
    material: z.string().nullable(),
    technique: z.string().nullable(),
  }),
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SORTS = new Set(['relevance', 'recommended', 'popularity', 'price-asc', 'price-desc', 'name-asc']);
const FILIPINO_ALIASES = new Map([
  ['plorera', 'vase'], ['paso', 'planter'], ['halaman', 'plant'], ['banga', 'jar'],
  ['palayok', 'pot'], ['luwad', 'clay'], ['mura', 'affordable'], ['regalo', 'gift'],
  ['bahay', 'home'], ['kamay', 'handmade'], ['tradisyonal', 'traditional'],
  ['pula', 'red'], ['puti', 'white'], ['itim', 'black'], ['maliit', 'small'], ['malaki', 'large'],
]);

export function normalizeGalleryQuery(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}₱.,-]+/gu, ' ').trim().replace(/\s+/g, ' ').slice(0, 200);
}

function canonicalValue(value, options) {
  if (typeof value !== 'string') return null;
  const normalized = normalizeGalleryQuery(value);
  return options.find(option => normalizeGalleryQuery(option) === normalized) ?? null;
}

function canonicalShopId(value, shops) {
  return typeof value === 'string' && shops.some(shop => shop.id === value) ? value : null;
}

function safePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000_000 ? number : null;
}

export function validateSearchPlan(value, taxonomy, fallbackQuery) {
  const parsed = SEARCH_PLAN_SCHEMA.safeParse(value);
  const raw = parsed.success ? parsed.data : { semanticQuery: fallbackQuery, filters: {} };
  let minPrice = safePrice(raw.filters.minPrice);
  let maxPrice = safePrice(raw.filters.maxPrice);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  const semanticQuery = normalizeGalleryQuery(raw.semanticQuery || fallbackQuery);
  return {
    semanticQuery: semanticQuery.length >= 2 ? semanticQuery : normalizeGalleryQuery(fallbackQuery),
    filters: {
      category: canonicalValue(raw.filters.category, taxonomy.categories),
      shopId: canonicalShopId(raw.filters.shopId, taxonomy.shops),
      minPrice,
      maxPrice,
      material: canonicalValue(raw.filters.material, taxonomy.materials),
      technique: canonicalValue(raw.filters.technique, taxonomy.techniques),
    },
  };
}

function firstCatalogMatch(query, values) {
  const normalized = normalizeGalleryQuery(query);
  return [...values].sort((a, b) => b.length - a.length)
    .find(value => normalized.includes(normalizeGalleryQuery(value))) ?? null;
}

function parsePrices(query) {
  const normalized = normalizeGalleryQuery(query).replace(/,/g, '');
  const number = '(?:₱\\s*)?(\\d+(?:\\.\\d+)?)';
  const range = normalized.match(new RegExp(`(?:between|mula|from)\\s+${number}\\s+(?:and|to|hanggang)\\s+${number}`));
  if (range) {
    const left = safePrice(range[1]);
    const right = safePrice(range[2]);
    return {
      minPrice: left === null || right === null ? null : Math.min(left, right),
      maxPrice: left === null || right === null ? null : Math.max(left, right),
    };
  }
  const max = normalized.match(new RegExp(`(?:under|below|less than|up to|hanggang|mas mababa sa|hindi lalampas sa)\\s*${number}`));
  const min = normalized.match(new RegExp(`(?:over|above|more than|at least|mahigit|higit sa)\\s*${number}`));
  return { minPrice: min ? safePrice(min[1]) : null, maxPrice: max ? safePrice(max[1]) : null };
}

export function localSearchPlan(query, taxonomy) {
  const normalized = normalizeGalleryQuery(query);
  const translated = normalized.split(' ').map(token => FILIPINO_ALIASES.get(token) ?? token).join(' ');
  const prices = parsePrices(normalized);
  const shop = [...taxonomy.shops].sort((a, b) => b.name.length - a.name.length)
    .find(candidate => normalized.includes(normalizeGalleryQuery(candidate.name)));
  return validateSearchPlan({
    semanticQuery: translated,
    filters: {
      category: firstCatalogMatch(normalized, taxonomy.categories), shopId: shop?.id ?? null,
      minPrice: prices.minPrice, maxPrice: prices.maxPrice,
      material: firstCatalogMatch(normalized, taxonomy.materials),
      technique: firstCatalogMatch(normalized, taxonomy.techniques),
    },
  }, taxonomy, query);
}

function uniqueText(values) {
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function loadSearchTaxonomy(supabase) {
  const { data, error } = await supabase.from('products')
    .select('category, materials, technique, shop_id, shop_name').eq('status', 'active').limit(2000);
  if (error) throw error;
  const rows = data ?? [];
  const shopsById = new Map();
  for (const row of rows) if (row.shop_id && row.shop_name) shopsById.set(row.shop_id, row.shop_name);
  const taxonomy = {
    categories: uniqueText(rows.map(row => row.category)),
    materials: uniqueText(rows.map(row => row.materials)),
    techniques: uniqueText(rows.map(row => row.technique)),
    shops: [...shopsById].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
  const taxonomyHash = crypto.createHash('sha256').update(JSON.stringify(taxonomy)).digest('hex');
  return { ...taxonomy, taxonomyHash };
}

async function parseWithGateway(query, taxonomy) {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('AI Gateway is not configured');
  const modelId = process.env.AI_SEARCH_MODEL || DEFAULT_SEARCH_MODEL;
  const gatewayOptions = {
    tags: ['feature:gallery-search', `env:${process.env.NODE_ENV || 'development'}`],
  };
  const { output } = await generateText({
    model: gateway(modelId),
    output: Output.object({ schema: SEARCH_PLAN_SCHEMA, name: 'gallery_search_plan' }),
    abortSignal: AbortSignal.timeout(2500),
    providerOptions: { gateway: gatewayOptions },
    system: 'Convert a pottery marketplace query into an English semantic query and exact catalog filters. Never invent catalog values. Use null when a constraint is absent or is not an exact catalog value. Interpret Philippine peso amounts as numbers.',
    prompt: JSON.stringify({ query, catalog: {
      categories: taxonomy.categories, shops: taxonomy.shops,
      materials: taxonomy.materials.slice(0, 100), techniques: taxonomy.techniques.slice(0, 100),
    } }),
  });
  return validateSearchPlan(output, taxonomy, query);
}

function parseEmbedding(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : null;
    } catch { return null; }
  }
  return null;
}

async function generateQueryEmbedding(supabase, query) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Embedding service timed out')), 3000);
  });
  const invocation = supabase.functions.invoke('gallery-embed', { body: { query } });
  const { data, error } = await Promise.race([invocation, timeout]).finally(() => clearTimeout(timeoutId));
  if (error) throw error;
  const embedding = parseEmbedding(data?.embedding);
  if (!embedding || embedding.length !== 384) throw new Error('Embedding service returned an invalid vector');
  return embedding;
}

function searchCacheKey(query, taxonomyHash, modelId) {
  return crypto.createHash('sha256').update(`${normalizeGalleryQuery(query)}\n${taxonomyHash}\n${modelId}`).digest('hex');
}

async function readCache(supabase, cacheKey) {
  const { data } = await supabase.from('gallery_search_cache').select('semantic_query, search_plan, embedding')
    .eq('cache_key', cacheKey).gt('expires_at', new Date().toISOString()).maybeSingle();
  return data ?? null;
}

async function writeCache(supabase, cacheKey, query, taxonomy, modelId, plan, embedding) {
  await supabase.from('gallery_search_cache').upsert({
    cache_key: cacheKey, query_text: normalizeGalleryQuery(query), semantic_query: plan.semanticQuery,
    taxonomy_hash: taxonomy.taxonomyHash, parser_model: modelId, search_plan: plan, embedding,
    last_used_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }, { onConflict: 'cache_key' });
}

export function mergeFilters(planFilters, visibleFilters, taxonomy) {
  return {
    ...planFilters,
    category: canonicalValue(visibleFilters?.category, taxonomy.categories) ?? planFilters.category,
    shopId: canonicalShopId(visibleFilters?.shopId, taxonomy.shops) ?? planFilters.shopId,
  };
}

function mapProduct(row) {
  return {
    id: row.id, name: row.name, description: row.description ?? '', category: row.category ?? '',
    price: Number(row.price) || 0, effectivePrice: Number(row.effective_price) || Number(row.price) || 0,
    stock: Number(row.stock) || 0, inStock: Number(row.stock) > 0, image: row.image ?? '',
    model3d: row.model3d ?? undefined, materials: row.materials ?? '', dimensions: row.dimensions ?? '',
    height: row.height ?? '', openingDiameter: row.opening_diameter ?? '', technique: row.technique ?? '',
    shopId: row.shop_id ?? '', shopName: row.shop_name ?? '', status: row.status, views: Number(row.views) || 0,
    ratingAvg: Number(row.rating_avg) || 0, ratingCount: Number(row.rating_count) || 0,
    relevance: Number(row.relevance) || 0, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function recordEvent(supabase, event) {
  const { error } = await supabase.from('gallery_search_events').insert(event);
  if (error) console.error('Gallery search analytics error:', error);
}

export async function searchGallery(supabase, input) {
  const startedAt = Date.now();
  const rawQuery = String(input.query ?? '').trim();
  if (rawQuery.length > 200) throw new Error('INVALID_QUERY');
  const query = normalizeGalleryQuery(input.query);
  if (query.length < 2 || query.length > 200) throw new Error('INVALID_QUERY');
  const taxonomy = await loadSearchTaxonomy(supabase);
  const modelId = process.env.AI_SEARCH_MODEL || DEFAULT_SEARCH_MODEL;
  const cacheKey = searchCacheKey(query, taxonomy.taxonomyHash, modelId);
  const cached = await readCache(supabase, cacheKey);
  let parserFallback = false;
  let plan;
  if (input.searchPlan) plan = validateSearchPlan(input.searchPlan, taxonomy, query);
  else if (cached?.search_plan) plan = validateSearchPlan(cached.search_plan, taxonomy, query);
  else {
    try { plan = await parseWithGateway(query, taxonomy); }
    catch (error) {
      parserFallback = true;
      console.warn('Gallery query parser fallback:', error instanceof Error ? error.message : error);
      plan = localSearchPlan(query, taxonomy);
    }
  }
  let embedding = cached?.semantic_query === plan.semanticQuery ? parseEmbedding(cached.embedding) : null;
  if (!embedding) {
    try { embedding = await generateQueryEmbedding(supabase, plan.semanticQuery); }
    catch (error) {
      console.warn('Gallery embedding fallback:', error instanceof Error ? error.message : error);
      embedding = null;
    }
  }
  void writeCache(supabase, cacheKey, query, taxonomy, modelId, plan, embedding)
    .catch(error => console.error('Gallery search cache write error:', error));

  const appliedFilters = mergeFilters(plan.filters, input.visibleFilters, taxonomy);
  const favoriteIds = Array.isArray(input.visibleFilters?.favoriteProductIds)
    ? input.visibleFilters.favoriteProductIds.filter(id => UUID_PATTERN.test(id)).slice(0, 500) : [];
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const sort = SORTS.has(input.sort) ? input.sort : 'relevance';
  const { data, error } = await supabase.rpc('search_gallery_products', {
    // Keep lexical retrieval faithful to what the visitor typed; only the
    // embedding path uses the Gateway-normalized English semantic query.
    p_query_text: query, p_query_embedding: embedding,
    p_category: appliedFilters.category, p_shop_id: appliedFilters.shopId,
    p_min_price: appliedFilters.minPrice, p_max_price: appliedFilters.maxPrice,
    p_material: appliedFilters.material, p_technique: appliedFilters.technique,
    p_favorites_only: Boolean(input.visibleFilters?.favoritesOnly), p_favorite_ids: favoriteIds,
    p_sort: sort, p_page: page, p_page_size: GALLERY_PAGE_SIZE,
  });
  if (error) throw error;
  const products = (data ?? []).map(mapProduct);
  const total = Number(data?.[0]?.total_count) || 0;
  const searchId = UUID_PATTERN.test(input.searchId ?? '') ? input.searchId : crypto.randomUUID();
  const mode = embedding ? 'hybrid' : 'keyword_fallback';
  const latencyMs = Date.now() - startedAt;
  const eventType = ['filter_change', 'sort', 'page'].includes(input.interaction) ? input.interaction : 'search';
  void recordEvent(supabase, {
    search_id: searchId, event_type: eventType, user_id: input.userId ?? null,
    query_text: plan.semanticQuery, filters: appliedFilters, result_count: total,
    retrieval_mode: mode, latency_ms: latencyMs,
  });
  if (input.userId && eventType === 'search') {
    void supabase.from('user_product_signals').insert({
      user_id: input.userId, event_type: 'search', query_text: plan.semanticQuery.slice(0, 100), product_id: null,
    }).then(({ error: signalError }) => {
      if (signalError) console.error('Gallery search signal error:', signalError);
    });
  }
  return {
    searchId, searchPlan: plan, appliedFilters,
    options: { categories: taxonomy.categories, shops: taxonomy.shops, materials: taxonomy.materials, techniques: taxonomy.techniques },
    products, page, pageSize: GALLERY_PAGE_SIZE, total, totalPages: Math.ceil(total / GALLERY_PAGE_SIZE),
    mode, parserFallback, latencyMs,
  };
}

export async function recordGallerySearchClick(supabase, { searchId, productId, userId }) {
  if (!UUID_PATTERN.test(searchId) || !UUID_PATTERN.test(productId)) throw new Error('INVALID_CLICK');
  const [{ data: product }, { data: search }] = await Promise.all([
    supabase.from('products').select('id').eq('id', productId).eq('status', 'active').maybeSingle(),
    supabase.from('gallery_search_events').select('query_text').eq('search_id', searchId)
      .eq('event_type', 'search').order('created_at').limit(1).maybeSingle(),
  ]);
  if (!product) throw new Error('INVALID_CLICK');
  const operations = [recordEvent(supabase, {
    search_id: searchId, event_type: 'click', user_id: userId ?? null,
    query_text: search?.query_text ?? null, product_id: productId,
  })];
  if (userId) operations.push(supabase.from('user_product_signals').insert({
    user_id: userId, event_type: 'product_click', query_text: search?.query_text?.slice(0, 100) ?? null, product_id: productId,
  }));
  await Promise.allSettled(operations);
}

export async function resetGalleryRecommendations(supabase, userId) {
  const [{ error: signalsError }, { error: analyticsError }] = await Promise.all([
    supabase.from('user_product_signals').delete().eq('user_id', userId),
    supabase.from('gallery_search_events').update({ user_id: null }).eq('user_id', userId),
  ]);
  if (signalsError) throw signalsError;
  if (analyticsError) throw analyticsError;
}
