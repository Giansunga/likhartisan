import type { Product } from '.';

export type InventoryFilter = 'all' | 'low' | 'out';
export type ProductSort = 'newest' | 'oldest' | 'name' | 'price_low' | 'price_high' | 'stock_low' | 'stock_high' | 'views';

export interface ProductAdminFilters {
  q: string;
  shop: string;
  category: string;
  status: 'all' | Product['status'];
  inventory: InventoryFilter;
  sort: ProductSort;
  page: number;
}

export interface ProductVariationDraft {
  id?: string;
  dimensions: string;
  height: string;
  openingDiameter: string;
  price: string;
  stock: string;
}

export interface ProductEditorErrors {
  name?: string;
  category?: string;
  image?: string;
  model?: string;
  variations?: string;
  save?: string;
}

export interface ProductInventoryCounts {
  total: number;
  active: number;
  low: number;
  out: number;
}
