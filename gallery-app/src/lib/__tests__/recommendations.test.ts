import { describe, expect, it } from 'vitest';
import type { Product } from '../../types';
import {
  normalizeSearchQuery,
  orderRecommendedProducts,
  productMatchesSearch,
  recommendationScore,
  searchRelevance,
  seededShuffle,
  type UserProductSignal,
} from '../recommendations';

function product(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    description: '',
    category: 'Jars',
    price: 100,
    stock: 1,
    inStock: true,
    image: '',
    materials: 'Clay',
    dimensions: '',
    height: '',
    openingDiameter: '',
    technique: 'Hand-thrown',
    shopId: 'shop-1',
    shopName: 'Artisan Shop',
    status: 'active',
    views: 0,
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function signal(overrides: Partial<UserProductSignal> = {}): UserProductSignal {
  return {
    user_id: 'user-1',
    event_type: 'search',
    query_text: 'vase',
    product_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

const now = new Date('2026-08-05T00:00:00.000Z');

describe('seededShuffle', () => {
  it('is deterministic and does not mutate the source array', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const original = [...source];
    expect(seededShuffle(source, 42)).toEqual(seededShuffle(source, 42));
    expect(source).toEqual(original);
  });

  it('normally produces a different order for another seed', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(source, 42)).not.toEqual(seededShuffle(source, 43));
  });
});

describe('search matching', () => {
  const vase = product('vase', {
    name: 'Terracotta Garden Vase',
    category: 'Vases',
    description: 'A traditional vessel',
    materials: 'Red Clay',
    technique: 'Coil-built',
    shopName: 'Santo Tomas Pottery',
  });

  it('normalizes casing, punctuation, spacing, and diacritics', () => {
    expect(normalizeSearchQuery('  CLÁY---Vase  ')).toBe('clay vase');
  });

  it('matches all supported searchable product fields', () => {
    for (const query of ['garden', 'vases', 'vessel', 'clay', 'coil', 'santo']) {
      expect(productMatchesSearch(vase, query)).toBe(true);
    }
    expect(productMatchesSearch(vase, 'porcelain')).toBe(false);
  });

  it('gives an exact name match more relevance than a description match', () => {
    const exact = product('exact', { name: 'Clay Vase' });
    const description = product('description', { description: 'Includes a clay vase motif' });
    expect(searchRelevance(exact, 'clay vase')).toBeGreaterThan(searchRelevance(description, 'clay vase'));
  });
});

describe('recommendation scoring and ordering', () => {
  it('weights recent searches more strongly than old searches and ignores expired signals', () => {
    const vase = product('vase', { name: 'Clay Vase', category: 'Vases' });
    const recent = recommendationScore(vase, [signal()], [vase], now);
    const older = recommendationScore(vase, [signal({ created_at: '2026-06-07T00:00:00.000Z' })], [vase], now);
    const expired = recommendationScore(vase, [signal({ created_at: '2026-04-01T00:00:00.000Z' })], [vase], now);
    expect(recent).toBeGreaterThan(older);
    expect(older).toBeGreaterThan(0);
    expect(expired).toBe(0);
  });

  it('uses clicked product attributes to recommend related products', () => {
    const clicked = product('clicked', { category: 'Vases', materials: 'Red Clay', technique: 'Coil-built', shopId: 'shop-a' });
    const related = product('related', { category: 'Vases', materials: 'Red Clay', technique: 'Coil-built', shopId: 'shop-b' });
    const unrelated = product('unrelated', { category: 'Planters', materials: 'Porcelain', technique: 'Slip-cast', shopId: 'shop-c' });
    const click = signal({ event_type: 'product_click', query_text: null, product_id: clicked.id });
    expect(recommendationScore(related, [click], [clicked, related, unrelated], now))
      .toBeGreaterThan(recommendationScore(unrelated, [click], [clicked, related, unrelated], now));
  });

  it('interleaves three personalized products with two discovery products without duplicates', () => {
    const products = [
      product('v1', { name: 'Vase One', category: 'Vases' }),
      product('v2', { name: 'Vase Two', category: 'Vases' }),
      product('v3', { name: 'Vase Three', category: 'Vases' }),
      product('p1', { name: 'Planter One', category: 'Planters' }),
      product('j1', { name: 'Jar One', category: 'Jars' }),
    ];
    const ordered = orderRecommendedProducts(products, { signals: [signal()], catalog: products, seed: 7, now });
    expect(ordered.slice(0, 3).every(item => item.category === 'Vases')).toBe(true);
    expect(ordered).toHaveLength(products.length);
    expect(new Set(ordered.map(item => item.id)).size).toBe(products.length);
    expect(products.map(item => item.id)).toEqual(['v1', 'v2', 'v3', 'p1', 'j1']);
  });

  it('falls back to a stable full shuffle with no usable signals', () => {
    const products = [product('1'), product('2'), product('3'), product('4')];
    const ordered = orderRecommendedProducts(products, { signals: [], catalog: products, seed: 99, now });
    expect(ordered).toEqual(seededShuffle(products, 99));
  });

  it('ranks the current search before historical recommendation score', () => {
    const currentMatch = product('current', { name: 'Porcelain Planter', category: 'Planters' });
    const historyMatch = product('history', { name: 'Clay Vase', category: 'Vases', description: 'planter accent' });
    const products = [historyMatch, currentMatch];
    const ordered = orderRecommendedProducts(products, {
      signals: [signal({ query_text: 'vase' })],
      catalog: products,
      seed: 4,
      query: 'porcelain planter',
      now,
    });
    expect(ordered[0].id).toBe('current');
  });
});
