import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { InventoryFilter, ListingFilters, ListingSort, ListingStatusFilter } from './listingUtils';

interface Props {
  filters: ListingFilters;
  categories: string[];
  resultCount: number;
  showStatus?: boolean;
  onChange: (next: ListingFilters) => void;
}

export default function SellerListingToolbar({ filters, categories, resultCount, showStatus = true, onChange }: Props) {
  const dirty = filters.search || filters.status !== 'all' || filters.inventory !== 'all' || filters.category !== 'all' || filters.sort !== 'newest';
  const update = <K extends keyof ListingFilters>(key: K, value: ListingFilters[K]) => onChange({ ...filters, [key]: value });
  return <div className="seller-listing-toolbar">
    <div className="seller-listing-toolbar__search"><Search size={17} /><input value={filters.search} onChange={event => update('search', event.target.value)} placeholder="Search name, category, or material" aria-label="Search listings" /></div>
    <div className="seller-listing-toolbar__filters"><SlidersHorizontal size={16} aria-hidden="true" />
      {showStatus ? <select value={filters.status} onChange={event => update('status', event.target.value as ListingStatusFilter)} aria-label="Listing status"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select> : null}
      <select value={filters.inventory} onChange={event => update('inventory', event.target.value as InventoryFilter)} aria-label="Inventory status"><option value="all">All inventory</option><option value="in-stock">In stock</option><option value="low-stock">Low stock</option><option value="out-of-stock">Out of stock</option></select>
      <select value={filters.category} onChange={event => update('category', event.target.value)} aria-label="Category"><option value="all">All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select>
      <select value={filters.sort} onChange={event => update('sort', event.target.value as ListingSort)} aria-label="Sort listings"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="price">Lowest price</option><option value="stock">Lowest stock</option></select>
    </div>
    <div className="seller-listing-toolbar__footer"><span>{resultCount} result{resultCount === 1 ? '' : 's'}</span>{dirty ? <button type="button" onClick={() => onChange({ search: '', status: 'all', inventory: 'all', category: 'all', sort: 'newest' })}><X size={14} /> Clear filters</button> : null}</div>
  </div>;
}
