import { describe, expect, it } from 'vitest';
import { catalogDisplayPrice, summarizeCatalogVariations } from './catalogPresentation';

describe('catalog prices and availability', () => {
  it('uses in-stock prices, sold-out listed prices, and real zero independently of availability', () => {
    expect(summarizeCatalogVariations([
      { product_id: 'mixed', price: 40, stock: 0 },
      { product_id: 'mixed', price: 120, stock: 2 },
      { product_id: 'mixed', price: 150, stock: 1 },
      { product_id: 'sold', price: 50, stock: 0 },
      { product_id: 'sold', price: 90, stock: 0 },
      { product_id: 'free', price: 0, stock: 0 },
      { product_id: 'invalid', price: null, stock: 1 },
      { product_id: 'invalid', price: -20, stock: 0 },
    ])).toEqual({ prices: { mixed: 120, sold: 50, free: 0 }, availability: { mixed: true, sold: false, free: false, invalid: true } });
  });
  it('distinguishes zero from absent or invalid prices and falls back to product prices', () => {
    expect(catalogDisplayPrice({ price: 80 }, 0)).toBe(0);
    expect(catalogDisplayPrice({ price: 80 })).toBe(80);
    expect(catalogDisplayPrice({ price: 0, catalogPrice: null })).toBeNull();
    expect(catalogDisplayPrice({ price: NaN })).toBeNull();
  });
});
