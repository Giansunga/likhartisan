import { describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCT_FILTERS, filterAndSortProducts, getProductInventoryCounts, inventoryCondition, mergeProductFilters, paginateProducts, productFiltersFromSearch } from '../adminProducts';
import type { Product } from '../../types';

const products: Product[] = [
  { id: 'out', name: 'Empty Jar', description: '', category: 'Jars', price: 200, stock: 0, inStock: false, image: '', materials: '', dimensions: '', height: '', openingDiameter: '', technique: '', shopId: 'shop-a', shopName: 'Alpha', status: 'active', views: 4, ratingAvg: 0, ratingCount: 0, createdAt: '2026-08-01T00:00:00Z', updatedAt: '' },
  { id: 'low', name: 'Low Vase', description: '', category: 'Vases', price: 100, stock: 3, inStock: true, image: '', materials: '', dimensions: '', height: '', openingDiameter: '', technique: '', shopId: 'shop-b', shopName: 'Beta', status: 'active', views: 10, ratingAvg: 0, ratingCount: 0, createdAt: '2026-08-03T00:00:00Z', updatedAt: '' },
  { id: 'healthy', name: 'Plate', description: '', category: 'Plates', price: 300, stock: 12, inStock: true, image: '', materials: '', dimensions: '', height: '', openingDiameter: '', technique: '', shopId: 'shop-a', shopName: 'Alpha', status: 'archived', views: 20, ratingAvg: 0, ratingCount: 0, createdAt: '2026-08-02T00:00:00Z', updatedAt: '' },
];

describe('admin product utilities', () => {
  it('uses consistent inventory definitions and summary counts', () => {
    expect(inventoryCondition(0)).toBe('out');
    expect(inventoryCondition(3)).toBe('low');
    expect(inventoryCondition(4)).toBe('healthy');
    expect(getProductInventoryCounts(products)).toEqual({ total: 3, active: 2, low: 1, out: 1 });
  });

  it('filters with stable shop IDs and sorts selected products', () => {
    expect(filterAndSortProducts(products, { ...DEFAULT_PRODUCT_FILTERS, shop: 'shop-a', sort: 'views' }).map((item) => item.id)).toEqual(['healthy', 'out']);
    expect(filterAndSortProducts(products, { ...DEFAULT_PRODUCT_FILTERS, inventory: 'low' }).map((item) => item.id)).toEqual(['low']);
    expect(filterAndSortProducts(products, { ...DEFAULT_PRODUCT_FILTERS, q: 'beta', sort: 'name' }).map((item) => item.id)).toEqual(['low']);
  });

  it('round-trips URL filters without discarding unrelated parameters', () => {
    const query = new URLSearchParams('keep=1&q=vase&shop=shop-b&inventory=low&sort=views&page=3');
    expect(productFiltersFromSearch(query)).toEqual({ ...DEFAULT_PRODUCT_FILTERS, q: 'vase', shop: 'shop-b', inventory: 'low', sort: 'views', page: 3 });
    expect(mergeProductFilters(query, DEFAULT_PRODUCT_FILTERS).toString()).toBe('keep=1');
  });

  it('clamps pages after a filter reduces the result set', () => {
    const result = paginateProducts(products, 4, 2);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(['healthy']);
  });
});
