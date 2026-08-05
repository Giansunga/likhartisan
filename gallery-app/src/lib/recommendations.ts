import type { Product } from '../types';

export type ProductSignalEventType = 'search' | 'product_click';

export interface UserProductSignal {
  id?: string;
  user_id: string;
  event_type: ProductSignalEventType;
  query_text: string | null;
  product_id: string | null;
  created_at: string;
}

const SIGNAL_LIMIT = 100;
const SIGNAL_MAX_AGE_DAYS = 90;
const RECENCY_HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createVisitSeed(): number {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = makeRandom(seed);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function normalizeSearchQuery(query: string): string {
  return query
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

function queryTokens(query: string): string[] {
  return normalizeSearchQuery(query)
    .split(' ')
    .filter(token => token.length >= 2 && !STOP_WORDS.has(token));
}

function normalized(value: string | undefined): string {
  return normalizeSearchQuery(value ?? '');
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(queryTokens(left));
  const rightTokens = new Set(queryTokens(right));
  let matches = 0;
  leftTokens.forEach(token => {
    if (rightTokens.has(token)) matches += 1;
  });
  return matches;
}

export function searchRelevance(product: Product, query: string): number {
  const phrase = normalizeSearchQuery(query);
  const tokens = queryTokens(query);
  if (!phrase || tokens.length === 0) return 0;

  const fields = [
    { value: normalized(product.name), weight: 5 },
    { value: normalized(product.category), weight: 4 },
    { value: normalized(product.materials), weight: 3 },
    { value: normalized(product.technique), weight: 2 },
    { value: normalized(product.description), weight: 1.5 },
    { value: normalized(product.shopName), weight: 1 },
  ];

  let score = 0;
  for (const token of tokens) {
    for (const field of fields) {
      if (field.value.includes(token)) score += field.weight;
    }
  }
  if (fields[0].value === phrase) score += 8;
  else if (fields[0].value.startsWith(phrase)) score += 5;
  else if (fields.some(field => field.value.includes(phrase))) score += 2;
  return score;
}

export function productMatchesSearch(product: Product, query: string): boolean {
  return searchRelevance(product, query) > 0;
}

function usableSignals(signals: readonly UserProductSignal[], now: Date): UserProductSignal[] {
  const cutoff = now.getTime() - SIGNAL_MAX_AGE_DAYS * DAY_MS;
  return [...signals]
    .filter(signal => {
      const timestamp = Date.parse(signal.created_at);
      return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now.getTime();
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, SIGNAL_LIMIT);
}

function recencyWeight(createdAt: string, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - Date.parse(createdAt)) / DAY_MS);
  return 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
}

export function recommendationScore(
  product: Product,
  signals: readonly UserProductSignal[],
  catalog: readonly Product[],
  now = new Date(),
): number {
  const productsById = new Map(catalog.map(item => [item.id, item]));
  let score = 0;

  for (const signal of usableSignals(signals, now)) {
    const recency = recencyWeight(signal.created_at, now);
    if (signal.event_type === 'search' && signal.query_text) {
      score += searchRelevance(product, signal.query_text) * 3 * recency;
      continue;
    }

    if (signal.event_type === 'product_click' && signal.product_id) {
      const clicked = productsById.get(signal.product_id);
      if (!clicked) continue;
      if (clicked.id === product.id) {
        score += 0.25 * recency;
        continue;
      }

      let similarity = 0;
      if (normalized(clicked.category) === normalized(product.category)) similarity += 4;
      similarity += Math.min(3, tokenOverlap(clicked.materials, product.materials) * 1.5);
      similarity += Math.min(2, tokenOverlap(clicked.technique, product.technique));
      if (clicked.shopId && clicked.shopId === product.shopId) similarity += 1;
      score += similarity * 5 * recency;
    }
  }

  return score;
}

export interface RecommendationOptions {
  signals: readonly UserProductSignal[];
  catalog: readonly Product[];
  seed: number;
  query?: string;
  now?: Date;
}

export function orderRecommendedProducts(
  products: readonly Product[],
  { signals, catalog, seed, query = '', now = new Date() }: RecommendationOptions,
): Product[] {
  const discoveryOrder = seededShuffle(products, seed);
  if (products.length <= 1) return discoveryOrder;

  const discoveryRank = new Map(discoveryOrder.map((product, index) => [product.id, index]));
  const scores = new Map(
    products.map(product => [product.id, recommendationScore(product, signals, catalog, now)]),
  );

  if (queryTokens(query).length > 0) {
    return [...products].sort((a, b) => {
      const relevanceDifference = searchRelevance(b, query) - searchRelevance(a, query);
      if (relevanceDifference !== 0) return relevanceDifference;
      const recommendationDifference = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      if (recommendationDifference !== 0) return recommendationDifference;
      return (discoveryRank.get(a.id) ?? 0) - (discoveryRank.get(b.id) ?? 0);
    });
  }

  const personalized = [...products]
    .filter(product => (scores.get(product.id) ?? 0) > 0)
    .sort((a, b) => {
      const difference = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      if (difference !== 0) return difference;
      return (discoveryRank.get(a.id) ?? 0) - (discoveryRank.get(b.id) ?? 0);
    });

  if (personalized.length === 0) return discoveryOrder;

  const result: Product[] = [];
  const used = new Set<string>();
  let personalizedIndex = 0;
  let discoveryIndex = 0;

  const take = (source: Product[], index: number, count: number) => {
    let cursor = index;
    let added = 0;
    while (cursor < source.length && added < count) {
      const product = source[cursor];
      cursor += 1;
      if (used.has(product.id)) continue;
      used.add(product.id);
      result.push(product);
      added += 1;
    }
    return cursor;
  };

  while (result.length < products.length) {
    const before = result.length;
    personalizedIndex = take(personalized, personalizedIndex, 3);
    discoveryIndex = take(discoveryOrder, discoveryIndex, 2);
    if (result.length === before) break;
  }

  if (result.length < products.length) take(discoveryOrder, discoveryIndex, products.length);
  return result;
}
