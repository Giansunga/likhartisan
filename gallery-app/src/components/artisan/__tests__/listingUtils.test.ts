import { describe, expect, it } from 'vitest';
import type { ArtisanProduct } from '../../../types/artisan';
import { filterAndSortListings, getInventoryState, getListingCounts } from '../listingUtils';

const product = (overrides: Partial<ArtisanProduct>): ArtisanProduct => ({
  id: 'one', name: 'Clay Vase', description: '', category: 'Vases', price: 900, stock: 8, image: '', materials: 'Clay', dimensions: '', shop_id: 'shop', shop_name: 'Studio', status: 'active', views: 0, created_at: '2026-08-01T00:00:00Z', ...overrides,
});

const products = [
  product({ id: 'active', name: 'Clay Vase' }),
  product({ id: 'low', name: 'Rattan Bowl', category: 'Bowls', materials: 'Rattan', stock: 2, status: 'inactive', created_at: '2026-08-03T00:00:00Z' }),
  product({ id: 'empty', name: 'Tea Cup', stock: 0 }),
  product({ id: 'archived', name: 'Old Pot', status: 'archived' }),
];

describe('seller listing utilities', () => {
  it('classifies stock consistently', () => {
    expect(getInventoryState(0)).toBe('out-of-stock');
    expect(getInventoryState(3)).toBe('low-stock');
    expect(getInventoryState(4)).toBe('in-stock');
  });

  it('calculates current listing summary without archived products', () => {
    expect(getListingCounts(products)).toEqual({ total: 3, active: 2, inactive: 1, lowStock: 1, outOfStock: 1 });
  });

  it('searches materials and combines inventory and status filters', () => {
    const result = filterAndSortListings(products, { search: 'rattan', status: 'inactive', inventory: 'low-stock', category: 'Bowls', sort: 'newest' }, {});
    expect(result.map(item => item.id)).toEqual(['low']);
  });

  it('sorts using seller variation prices when available', () => {
    const result = filterAndSortListings(products.slice(0, 2), { search: '', status: 'all', inventory: 'all', category: 'all', sort: 'price' }, { active: 1200, low: 300 });
    expect(result.map(item => item.id)).toEqual(['low', 'active']);
  });
});
