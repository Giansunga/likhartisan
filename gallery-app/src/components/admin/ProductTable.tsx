import { useState, useMemo } from 'react';
import type { Product } from '../../types';

interface ProductTableProps {
  products: Product[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onEdit: (product: Product) => void;
}

function SortIcon({ sortBy, sortDir, col }: { sortBy: string; sortDir: string; col: string }) {
  if (sortBy !== col) return <span className="text-brown-medium ml-1">↕</span>;
  return <span className="text-primary ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

export default function ProductTable({ products, onDelete, onArchive, onEdit }: ProductTableProps) {
  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'stock' | 'createdAt'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const perPage = 6;

  const shopNames = useMemo(() => [...new Set(products.map(p => p.shopName))], [products]);
  const categories = useMemo(() => [...new Set(products.map(p => p.category))], [products]);

  const filtered = useMemo(() => {
    let result = [...products];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.shopName.toLowerCase().includes(q));
    }
    if (shopFilter !== 'All') result = result.filter(p => p.shopName === shopFilter);
    if (categoryFilter !== 'All') result = result.filter(p => p.category === categoryFilter);
    if (statusFilter !== 'All') result = result.filter(p => p.status === statusFilter);

    result.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [products, search, shopFilter, categoryFilter, statusFilter, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        <input type="text" placeholder="Search products..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-xl border border-cream-tertiary bg-white text-sm focus:outline-none focus:border-accent flex-1 min-w-[200px]" />
        <select value={shopFilter} onChange={e => { setShopFilter(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-xl border border-cream-tertiary bg-white text-sm focus:outline-none focus:border-accent">
          <option value="All">All Shops</option>
          {shopNames.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-xl border border-cream-tertiary bg-white text-sm focus:outline-none focus:border-accent">
          <option value="All">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-xl border border-cream-tertiary bg-white text-sm focus:outline-none focus:border-accent">
          <option value="All">All Status</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-cream-tertiary overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-tertiary bg-cream-secondary/50">
              <th className="text-left py-4 px-4 font-semibold text-brown-dark">Product</th>
              <th className="text-left py-4 px-4 font-semibold text-brown-dark">Shop</th>
              <th className="text-left py-4 px-4 font-semibold text-brown-dark">Category</th>
              <th className="text-left py-4 px-4 font-semibold text-brown-dark cursor-pointer" onClick={() => toggleSort('price')}>
                Price <SortIcon sortBy={sortBy} sortDir={sortDir} col="price" />
              </th>
              <th className="text-left py-4 px-4 font-semibold text-brown-dark cursor-pointer" onClick={() => toggleSort('stock')}>
                Stock <SortIcon sortBy={sortBy} sortDir={sortDir} col="stock" />
              </th>
              <th className="text-left py-4 px-4 font-semibold text-brown-dark">Status</th>
              <th className="text-right py-4 px-4 font-semibold text-brown-dark">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(p => (
              <tr key={p.id} className="border-b border-cream-tertiary hover:bg-cream-secondary/30 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <img src={p.image} alt={p.name} className="w-12 h-12 rounded-xl object-cover" />
                    <span className="font-medium text-brown-dark">{p.name}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-brown-medium">{p.shopName}</td>
                <td className="py-3 px-4"><span className="px-3 py-1 rounded-full bg-cream-secondary text-brown-medium text-xs font-medium">{p.category}</span></td>
                <td className="py-3 px-4 font-semibold text-brown-dark">₱{p.price.toLocaleString()}</td>
                <td className="py-3 px-4">
                  <span className={p.stock === 0 ? 'text-red-500 font-semibold' : p.stock <= 3 ? 'text-amber-500 font-semibold' : 'text-brown-medium'}>
                    {p.stock}
                    {p.stock === 0 && <span className="ml-1 text-xs">(Out)</span>}
                    {p.stock > 0 && p.stock <= 3 && <span className="ml-1 text-xs">(Low)</span>}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    p.status === 'active' ? 'bg-cream-secondary text-accent' :
                    p.status === 'archived' ? 'bg-cream-tertiary text-brown-medium' : 'bg-cream-secondary text-primary'
                  }`}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onEdit(p)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-primary text-primary hover:bg-cream-secondary transition-colors">
                      Edit
                    </button>
                    <button onClick={() => onArchive(p.id)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-cream-tertiary text-brown-medium hover:bg-cream-secondary transition-colors">
                      {p.status === 'archived' ? 'Activate' : 'Archive'}
                    </button>
                    <button onClick={() => onDelete(p.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-cream-tertiary text-accent hover:bg-cream-secondary transition-colors">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-brown-medium">No products found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 rounded-xl text-sm border border-cream-tertiary disabled:opacity-30 hover:bg-cream-secondary transition-colors">Previous</button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i + 1)}
              className={`w-10 h-10 rounded-xl text-sm font-medium transition-colors ${page === i + 1 ? 'bg-primary text-white' : 'hover:bg-cream-secondary text-brown-medium'}`}>{i + 1}</button>
          ))}
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 rounded-xl text-sm border border-cream-tertiary disabled:opacity-30 hover:bg-cream-secondary transition-colors">Next</button>
        </div>
      )}
    </div>
  );
}
