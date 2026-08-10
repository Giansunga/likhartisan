import type { ArtisanProduct } from '../../types/artisan';

export type ListingStatusFilter = 'all' | 'active' | 'inactive';
export type InventoryFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock';
export type ListingSort = 'newest' | 'oldest' | 'name' | 'price' | 'stock';

export interface ListingFilters {
  search: string;
  status: ListingStatusFilter;
  inventory: InventoryFilter;
  category: string;
  sort: ListingSort;
}

export function getInventoryState(stock: number) {
  if (stock <= 0) return 'out-of-stock' as const;
  if (stock <= 3) return 'low-stock' as const;
  return 'in-stock' as const;
}

export function filterAndSortListings(products: ArtisanProduct[], filters: ListingFilters, prices: Record<string, number>) {
  const query = filters.search.trim().toLocaleLowerCase();
  return products.filter(product => {
    if (query && !`${product.name} ${product.category} ${product.materials || ''}`.toLocaleLowerCase().includes(query)) return false;
    if (filters.status !== 'all' && product.status !== filters.status) return false;
    if (filters.inventory !== 'all' && getInventoryState(product.stock) !== filters.inventory) return false;
    return filters.category === 'all' || product.category === filters.category;
  }).sort((a, b) => {
    if (filters.sort === 'name') return a.name.localeCompare(b.name);
    if (filters.sort === 'price') return (prices[a.id] ?? a.price ?? 0) - (prices[b.id] ?? b.price ?? 0);
    if (filters.sort === 'stock') return a.stock - b.stock;
    const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return filters.sort === 'oldest' ? delta : -delta;
  });
}

export function getListingCounts(products: ArtisanProduct[]) {
  const current = products.filter(product => product.status !== 'archived');
  return {
    total: current.length,
    active: current.filter(product => product.status === 'active').length,
    inactive: current.filter(product => product.status === 'inactive').length,
    lowStock: current.filter(product => getInventoryState(product.stock) === 'low-stock').length,
    outOfStock: current.filter(product => getInventoryState(product.stock) === 'out-of-stock').length,
  };
}
