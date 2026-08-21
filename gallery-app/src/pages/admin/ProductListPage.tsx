import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Box, CheckCircle2, CircleAlert, LoaderCircle, PackagePlus, RefreshCw, Search, ShoppingBag, Warehouse, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { uploadToR2 } from '../../lib/r2';
import { recomputeProductStock } from '../../lib/stockSync';
import { mapSupabaseProduct } from '../../lib/utils';
import { DEFAULT_PRODUCT_FILTERS, filterAndSortProducts, getProductInventoryCounts, mergeProductFilters, paginateProducts, productFiltersFromSearch } from '../../lib/adminProducts';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';
import ProductTable from '../../components/admin/ProductTable';
import ProductEditorDialog, { type ProductEditorSave } from '../../components/admin/ProductEditorDialog';
import type { Product } from '../../types';
import type { ProductAdminFilters, ProductSort } from '../../types/adminProducts';
import './products-admin.css';

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'newest', label: 'Newest added' }, { value: 'oldest', label: 'Oldest added' }, { value: 'name', label: 'Name A–Z' }, { value: 'price_low', label: 'Price: low to high' }, { value: 'price_high', label: 'Price: high to low' }, { value: 'stock_low', label: 'Stock: low to high' }, { value: 'stock_high', label: 'Stock: high to low' }, { value: 'views', label: 'Most viewed' },
];

function SummaryCard({ label, value, note, active, onClick, icon }: { label: string; value: number; note: string; active: boolean; onClick: () => void; icon: ReactNode }) {
  return <button className="products-summary-card" type="button" aria-pressed={active} onClick={onClick}><span>{icon}{label}</span><strong>{value.toLocaleString()}</strong><small>{note}</small></button>;
}

function trapDialog(event: KeyboardEvent<HTMLElement>, onDismiss: () => void) {
  if (event.key === 'Escape') { event.preventDefault(); onDismiss(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0]; const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function ProductConfirm({ product, action, busy, onCancel, onConfirm }: { product: Product; action: 'archive' | 'delete'; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const deleting = action === 'delete';
  return <div className="products-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section className="products-confirm" role="dialog" aria-modal="true" aria-labelledby="products-confirm-title" tabIndex={-1} onKeyDown={(event) => trapDialog(event, () => { if (!busy) onCancel(); })}><h2 id="products-confirm-title">{deleting ? 'Delete product?' : product.status === 'archived' ? 'Activate product?' : 'Archive product?'}</h2><p>{product.name}</p><small>{deleting ? 'This permanently removes the product. This action cannot be undone.' : product.status === 'archived' ? 'This will make the product active in the catalog again.' : 'Archived products remain in the admin catalog but are removed from the active listing.'}</small><footer><button type="button" autoFocus onClick={onCancel} disabled={busy}>Cancel</button><button className={deleting ? 'is-danger' : ''} type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : deleting ? 'Delete product' : product.status === 'archived' ? 'Activate product' : 'Archive product'}</button></footer></section></div>;
}

export default function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(() => productFiltersFromSearch(searchParams), [searchKey]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [confirmation, setConfirmation] = useState<{ product: Product; action: 'archive' | 'delete' } | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    if (hasLoadedRef.current) setRefreshing(true); else setLoading(true);
    setError('');
    const { data, error: productsError } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (request !== requestRef.current) return;
    if (productsError) { setError(productsError.message || 'Could not load products.'); setLoading(false); setRefreshing(false); return; }
    const mapped = ((data ?? []) as any[]).map(mapSupabaseProduct) as Product[];
    if (mapped.length) {
      const { data: variations, error: variationsError } = await supabase.from('product_variations').select('product_id, price').in('product_id', mapped.map((product) => product.id));
      if (request !== requestRef.current) return;
      if (variationsError) { setError(variationsError.message || 'Could not load product prices.'); setLoading(false); setRefreshing(false); return; }
      const lowest: Record<string, number> = {};
      for (const variation of variations ?? []) {
        if (variation.price != null && (lowest[variation.product_id] == null || variation.price < lowest[variation.product_id])) lowest[variation.product_id] = variation.price;
      }
      mapped.forEach((product) => { if (lowest[product.id] != null) product.price = lowest[product.id]; });
    }
    setProducts(mapped); hasLoadedRef.current = true; setUpdatedAt(new Date()); setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  usePortalRealtimeRefresh(['products', 'product_variations'], load);

  const updateFilters = useCallback((next: ProductAdminFilters, replace = false) => {
    setSearchParams(mergeProductFilters(new URLSearchParams(searchKey), next), { replace });
  }, [searchKey, setSearchParams]);
  const changeFilters = (patch: Partial<ProductAdminFilters>) => updateFilters({ ...filters, ...patch, page: patch.page ?? 1 });
  const filtered = useMemo(() => filterAndSortProducts(products, filters), [filters, products]);
  const pagination = useMemo(() => paginateProducts(filtered, filters.page), [filtered, filters.page]);
  const counts = useMemo(() => getProductInventoryCounts(products), [products]);
  const shops = useMemo(() => [...new Map(products.filter((product) => product.shopId).map((product) => [product.shopId, product.shopName])).entries()].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name)), [products]);
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(), [products]);
  const hasFilters = Boolean(filters.q || filters.shop || filters.category || filters.status !== 'all' || filters.inventory !== 'all' || filters.sort !== 'newest' || filters.page !== 1);

  useEffect(() => { if (filters.page !== pagination.page) updateFilters({ ...filters, page: pagination.page }, true); }, [filters, pagination.page, updateFilters]);

  const performConfirmation = async () => {
    if (!confirmation) return;
    const { product, action } = confirmation;
    setBusyProductId(product.id);
    try {
      if (action === 'delete') {
        const { error: deleteError } = await supabase.from('products').delete().eq('id', product.id);
        if (deleteError) throw deleteError;
        setProducts((current) => current.filter((item) => item.id !== product.id));
        toast.success('Product deleted.');
      } else {
        const status = product.status === 'archived' ? 'active' : 'archived';
        const { error: archiveError } = await supabase.from('products').update({ status }).eq('id', product.id);
        if (archiveError) throw archiveError;
        setProducts((current) => current.map((item) => item.id === product.id ? { ...item, status } : item));
        toast.success(status === 'active' ? 'Product activated.' : 'Product archived.');
      }
      setConfirmation(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Product action failed.');
    } finally { setBusyProductId(null); }
  };

  const saveProduct = async (product: Product, data: ProductEditorSave) => {
    const updateData: Record<string, unknown> = { name: data.name, category: data.category, materials: data.materials, technique: data.technique };
    if (data.imageFile) {
      const url = await uploadToR2(data.imageFile, 'products');
      if (!url) throw new Error('Product image upload failed.');
      updateData.image = url;
    }
    if (data.modelFile) {
      const url = await uploadToR2(data.modelFile, 'models');
      if (!url) throw new Error('3D model upload failed.');
      updateData.model3d = url;
    }
    const { error: productError } = await supabase.from('products').update(updateData).eq('id', product.id);
    if (productError) throw new Error(productError.message || 'Could not save product details.');
    const keptIds: string[] = [];
    for (const [index, variation] of data.variations.entries()) {
      const variationData = { dimensions: variation.dimensions.trim() || 'N/A', height: variation.height.trim() || 'N/A', opening_diameter: variation.openingDiameter.trim() || 'N/A', price: variation.price ? Number(variation.price) : null, stock: Number(variation.stock) || 0 };
      if (variation.id) {
        const { error: variationError } = await supabase.from('product_variations').update(variationData).eq('id', variation.id);
        if (variationError) throw new Error(variationError.message || 'Could not save a product variation.');
        keptIds.push(variation.id);
      } else {
        const { data: inserted, error: variationError } = await supabase.from('product_variations').insert({ product_id: product.id, ...variationData, sort_order: index }).select('id').single();
        if (variationError) throw new Error(variationError.message || 'Could not add a product variation.');
        if (inserted?.id) keptIds.push(inserted.id);
      }
    }
    const removal = keptIds.length ? supabase.from('product_variations').delete().eq('product_id', product.id).not('id', 'in', `(${keptIds.join(',')})`) : supabase.from('product_variations').delete().eq('product_id', product.id);
    const { error: removalError } = await removal;
    if (removalError) throw new Error(removalError.message || 'Could not remove deleted variations.');
    const stock = await recomputeProductStock(product.id);
    setProducts((current) => current.map((item) => item.id === product.id ? { ...item, name: data.name, category: data.category, materials: data.materials, technique: data.technique, stock, inStock: stock > 0, ...(typeof updateData.image === 'string' ? { image: updateData.image } : {}), ...(typeof updateData.model3d === 'string' ? { model3d: updateData.model3d } : {}) } : item));
    toast.success('Product changes saved.');
    void load();
  };

  if (loading && !hasLoadedRef.current) return <main className="products-page" aria-busy="true"><h1 className="sr-only">Products</h1><div className="products-summary-grid">{[0, 1, 2, 3].map((item) => <div className="products-summary-card products-skeleton" key={item}><span /></div>)}</div><div className="products-panel products-skeleton">{[0, 1, 2, 3, 4].map((item) => <span key={item} />)}</div></main>;
  if (error && !hasLoadedRef.current) return <main className="products-page"><h1 className="sr-only">Products</h1><section className="products-panel products-state"><CircleAlert aria-hidden="true" /><h2>Products could not be loaded</h2><p>{error}</p><button type="button" onClick={() => void load()}>Try again</button></section></main>;

  return <main className="products-page">
    <h1 className="sr-only">Products</h1>
    <div className="products-page__topbar" aria-live="polite"><span className={refreshing ? 'is-refreshing' : ''}>{refreshing ? <LoaderCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{refreshing ? 'Refreshing' : 'Live data'}</span>{updatedAt && <small>Updated {updatedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</small>}<button type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw aria-hidden="true" />Refresh</button><Link to="/admin/products/create"><PackagePlus aria-hidden="true" />Upload 3D Product</Link></div>
    <section className="products-summary-grid" aria-label="Product inventory summary"><SummaryCard label="Total products" value={counts.total} note="All catalog items" active={filters.status === 'all' && filters.inventory === 'all'} onClick={() => changeFilters({ status: 'all', inventory: 'all' })} icon={<Box aria-hidden="true" />} /><SummaryCard label="Active" value={counts.active} note="Visible catalog items" active={filters.status === 'active'} onClick={() => changeFilters({ status: 'active', inventory: 'all' })} icon={<ShoppingBag aria-hidden="true" />} /><SummaryCard label="Low stock" value={counts.low} note="1–3 units remaining" active={filters.inventory === 'low'} onClick={() => changeFilters({ inventory: 'low' })} icon={<Warehouse aria-hidden="true" />} /><SummaryCard label="Out of stock" value={counts.out} note="Needs replenishment" active={filters.inventory === 'out'} onClick={() => changeFilters({ inventory: 'out' })} icon={<AlertCircle aria-hidden="true" />} /></section>
    <section className="products-toolbar" aria-label="Product filters"><div className="products-toolbar__main"><label className="products-search"><Search aria-hidden="true" /><span className="sr-only">Search products and shops</span><input type="search" value={filters.q} placeholder="Search products or shops" onChange={(event) => changeFilters({ q: event.target.value })} />{filters.q && <button type="button" aria-label="Clear product search" onClick={() => changeFilters({ q: '' })}><X aria-hidden="true" /></button>}</label><label className="products-sort"><span className="sr-only">Sort products</span><select value={filters.sort} onChange={(event) => changeFilters({ sort: event.target.value as ProductSort })}>{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><div className="products-toolbar__filters"><select aria-label="Shop" value={filters.shop} onChange={(event) => changeFilters({ shop: event.target.value })}><option value="">All shops</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select><select aria-label="Category" value={filters.category} onChange={(event) => changeFilters({ category: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><select aria-label="Status" value={filters.status} onChange={(event) => changeFilters({ status: event.target.value as ProductAdminFilters['status'] })}><option value="all">All status</option><option value="active">Active</option><option value="archived">Archived</option><option value="draft">Draft</option></select><select aria-label="Inventory" value={filters.inventory} onChange={(event) => changeFilters({ inventory: event.target.value as ProductAdminFilters['inventory'] })}><option value="all">All inventory</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></div><footer><span>{filtered.length.toLocaleString()} of {products.length.toLocaleString()} products</span>{hasFilters && <button type="button" onClick={() => updateFilters(DEFAULT_PRODUCT_FILTERS)}>Clear filters</button>}</footer></section>
    {error && <div className="products-notice" role="status"><AlertCircle aria-hidden="true" />{error}<button type="button" onClick={() => void load()}>Retry</button></div>}
    <section className="products-panel" aria-label="Product catalog">{products.length === 0 ? <div className="products-state"><Box aria-hidden="true" /><h2>No products yet</h2><p>Upload the first 3D product to start the catalog.</p><Link to="/admin/products/create">Upload 3D Product</Link></div> : filtered.length === 0 ? <div className="products-state"><Search aria-hidden="true" /><h2>No products match these filters</h2><p>Try another search or clear the active filters.</p><button type="button" onClick={() => updateFilters(DEFAULT_PRODUCT_FILTERS)}>Clear filters</button></div> : <><ProductTable products={pagination.items} busyProductId={busyProductId} onEdit={setEditing} onArchive={(product) => setConfirmation({ product, action: 'archive' })} onDelete={(product) => setConfirmation({ product, action: 'delete' })} />{pagination.totalPages > 1 && <footer className="products-pagination"><span>Page {pagination.page} of {pagination.totalPages}</span><div><button type="button" disabled={pagination.page === 1} onClick={() => updateFilters({ ...filters, page: pagination.page - 1 })}>Previous</button><button type="button" disabled={pagination.page === pagination.totalPages} onClick={() => updateFilters({ ...filters, page: pagination.page + 1 })}>Next</button></div></footer>}</>}</section>
    <ProductEditorDialog product={editing} onClose={() => setEditing(null)} onSave={saveProduct} />
    {confirmation && <ProductConfirm product={confirmation.product} action={confirmation.action} busy={busyProductId === confirmation.product.id} onCancel={() => setConfirmation(null)} onConfirm={() => void performConfirmation()} />}
  </main>;
}
