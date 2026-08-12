import { describe, expect, it } from 'vitest';
import type { Product } from '../../../types';
import {
  getLowestProductPrices,
  getMembershipYear,
  getProductDisplayPrice,
  getProductRatingSummaries,
  getStoryParagraphs,
} from '../shopStorefront';

const product = { id: 'product-1', price: 0 } as Product;

describe('shop storefront helpers', () => {
  it('keeps only the lowest positive variation price', () => {
    expect(getLowestProductPrices([
      { product_id: 'product-1', price: 250 },
      { product_id: 'product-1', price: '180' },
      { product_id: 'product-1', price: 0 },
      { product_id: 'product-2', price: null },
    ])).toEqual({ 'product-1': 180 });
  });

  it('summarizes genuine review rows', () => {
    expect(getProductRatingSummaries([
      { product_id: 'product-1', rating: 5 },
      { product_id: 'product-1', rating: 3 },
    ])).toEqual({ 'product-1': { avg: 4, count: 2 } });
  });

  it('does not present a zero price as a purchasable amount', () => {
    expect(getProductDisplayPrice(product)).toBeNull();
    expect(getProductDisplayPrice(product, 125)).toBe(125);
  });

  it('derives membership and story content from stored shop fields', () => {
    expect(getMembershipYear('2023-06-05T10:00:00.000Z')).toBe(2023);
    expect(getMembershipYear('')).toBeNull();
    expect(getStoryParagraphs({ about: 'First paragraph.\n\nSecond paragraph.', description: '' })).toEqual([
      'First paragraph.',
      'Second paragraph.',
    ]);
  });
});
