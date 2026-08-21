import type { Product } from '../types';
import type { InventoryFilter, ProductAdminFilters, ProductInventoryCounts, ProductSort } from '../types/adminProducts';

export const PRODUCT_PAGE_SIZE = 10;
export const DEFAULT_PRODUCT_FILTERS: ProductAdminFilters = { q: '', shop: '', category: '', status: 'all', inventory: 'all', sort: 'newest', page: 1 };

const INVENTORY_FILTERS: InventoryFilter[] = ['all', 'low', 'out'];
const SORTS: ProductSort[] = ['newest', 'oldest', 'name', 'price_low', 'price_high', 'stock_low', 'stock_high', 'views'];
const STATUSES: ProductAdminFilters['status'][] = ['all', 'active', 'archived', 'draft'];

export function inventoryCondition(stock: number): Exclude<InventoryFilter, 'all'> | 'healthy' {
  if (stock <= 0) return 'out';
  if (stock <= 3) return 'low';
  return 'healthy';
}

export function getProductInventoryCounts(products: Product[]): ProductInventoryCounts {
  return {
    total: products.length,
    active: products.filter((product) => product.status === 'active').length,
    low: products.filter((product) => inventoryCondition(product.stock) === 'low').length,
    out: products.filter((product) => inventoryCondition(product.stock) === 'out').length,
  };
}

function dateValue(product: Product) {
  const value = Date.parse(product.createdAt);
  return Number.isNaN(value) ? 0 : value;
}

export function filterAndSortProducts(products: Product[], filters: ProductAdminFilters) {
  const query = filters.q.trim().toLowerCase();
  const result = products.filter((product) => {
    const matchesQuery = !query || product.name.toLowerCase().includes(query) || product.shopName.toLowerCase().includes(query);
    const matchesShop = !filters.shop || product.shopId === filters.shop;
    const matchesCategory = !filters.category || product.category === filters.category;
    const matchesStatus = filters.status === 'all' || product.status === filters.status;
    const matchesInventory = filters.inventory === 'all' || inventoryCondition(product.stock) === filters.inventory;
    return matchesQuery && matchesShop && matchesCategory && matchesStatus && matchesInventory;
  });

  return [...result].sort((left, right) => {
    switch (filters.sort) {
      case 'oldest': return dateValue(left) - dateValue(right);
      case 'name': return left.name.localeCompare(right.name);
      case 'price_low': return left.price - right.price;
      case 'price_high': return right.price - left.price;
      case 'stock_low': return left.stock - right.stock;
      case 'stock_high': return right.stock - left.stock;
      case 'views': return right.views - left.views;
      default: return dateValue(right) - dateValue(left);
    }
  });
}

export function paginateProducts(products: Product[], page: number, pageSize = PRODUCT_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return { page: safePage, totalPages, items: products.slice((safePage - 1) * pageSize, safePage * pageSize) };
}

export function productFiltersFromSearch(search: URLSearchParams): ProductAdminFilters {
  const status = search.get('status');
  const inventory = search.get('inventory');
  const sort = search.get('sort');
  const parsedPage = Number.parseInt(search.get('page') ?? '', 10);
  return {
    q: search.get('q') ?? '',
    shop: search.get('shop') ?? '',
    category: search.get('category') ?? '',
    status: STATUSES.includes(status as ProductAdminFilters['status']) ? status as ProductAdminFilters['status'] : 'all',
    inventory: INVENTORY_FILTERS.includes(inventory as InventoryFilter) ? inventory as InventoryFilter : 'all',
    sort: SORTS.includes(sort as ProductSort) ? sort as ProductSort : 'newest',
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  };
}

export function mergeProductFilters(search: URLSearchParams, filters: ProductAdminFilters) {
  const next = new URLSearchParams(search);
  const put = (key: string, value: string, hidden: boolean) => hidden ? next.delete(key) : next.set(key, value);
  put('q', filters.q.trim(), !filters.q.trim());
  put('shop', filters.shop, !filters.shop);
  put('category', filters.category, !filters.category);
  put('status', filters.status, filters.status === 'all');
  put('inventory', filters.inventory, filters.inventory === 'all');
  put('sort', filters.sort, filters.sort === 'newest');
  put('page', String(filters.page), filters.page === 1);
  return next;
}
