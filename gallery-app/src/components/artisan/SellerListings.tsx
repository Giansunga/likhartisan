import { useMemo, useState } from 'react';
import { AlertTriangle, Archive, CheckCircle2, CircleOff, Package, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { recomputeProductStock } from '../../lib/stockSync';
import type { ArtisanProduct } from '../../types/artisan';
import { SellerConfirmDialog, SellerOverlay } from './Overlay';
import SellerListingCard from './SellerListingCard';
import SellerListingToolbar from './SellerListingToolbar';
import { useArtisanPortal } from './artisanContextValue';
import { filterAndSortListings, getListingCounts, type ListingFilters } from './listingUtils';

interface VariationDraft {
  id?: string;
  dimensions: string;
  height: string;
  openingDiameter: string;
  price: string;
  stock: string;
}

const defaultFilters: ListingFilters = { search: '', status: 'all', inventory: 'all', category: 'all', sort: 'newest' };
const emptyVariation = (): VariationDraft => ({ dimensions: '', height: '', openingDiameter: '', price: '', stock: '' });

export default function SellerListings() {
  const { products, productPrices, loadingProducts, setProducts } = useArtisanPortal();
  const [filters, setFilters] = useState(defaultFilters);
  const [editing, setEditing] = useState<ArtisanProduct | null>(null);
  const [materials, setMaterials] = useState('');
  const [technique, setTechnique] = useState('');
  const [variations, setVariations] = useState<VariationDraft[]>([]);
  const [originalVariationIds, setOriginalVariationIds] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ArtisanProduct | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const currentProducts = useMemo(() => products.filter(product => product.status !== 'archived'), [products]);
  const categories = useMemo(() => [...new Set(currentProducts.map(product => product.category).filter(Boolean))].sort(), [currentProducts]);
  const visible = useMemo(() => filterAndSortListings(currentProducts, filters, productPrices), [currentProducts, filters, productPrices]);
  const counts = getListingCounts(products);

  async function openEdit(product: ArtisanProduct) {
    setEditing(product);
    setMaterials(product.materials || '');
    setTechnique(product.technique || '');
    setVariations([]);
    setEditLoading(true);
    setFeedback(null);
    const { data, error } = await supabase.from('product_variations').select('*').eq('product_id', product.id).order('sort_order');
    if (error) setFeedback({ tone: 'error', text: error.message });
    const rows = data || [];
    setVariations(rows.map(row => ({ id: row.id, dimensions: row.dimensions || '', height: row.height || '', openingDiameter: row.opening_diameter || '', price: row.price == null ? '' : String(row.price), stock: String(row.stock ?? 0) })));
    setOriginalVariationIds(rows.map(row => row.id));
    setEditLoading(false);
  }

  function updateVariation(index: number, key: keyof VariationDraft, value: string) {
    setVariations(current => current.map((variation, itemIndex) => itemIndex === index ? { ...variation, [key]: value } : variation));
  }

  async function saveListing() {
    if (!editing || saving) return;
    const invalid = variations.some(variation => Number(variation.price || 0) < 0 || Number(variation.stock || 0) < 0 || !Number.isInteger(Number(variation.stock || 0)));
    if (invalid) { setFeedback({ tone: 'error', text: 'Prices must be zero or more and stock must be a whole number.' }); return; }
    setSaving(true);
    setFeedback(null);
    try {
      const { error: productError } = await supabase.from('products').update({ materials: materials.trim(), technique: technique.trim() }).eq('id', editing.id).select('id').single();
      if (productError) throw productError;
      const retainedIds = variations.flatMap(variation => variation.id ? [variation.id] : []);
      const removedIds = originalVariationIds.filter(id => !retainedIds.includes(id));
      const operations = variations.filter(variation => variation.dimensions.trim() || variation.height.trim() || variation.openingDiameter.trim()).map((variation, sortOrder) => {
        const payload = { dimensions: variation.dimensions.trim() || 'N/A', height: variation.height.trim() || 'N/A', opening_diameter: variation.openingDiameter.trim() || 'N/A', price: variation.price ? Number(variation.price) : null, stock: Number(variation.stock) || 0, sort_order: sortOrder };
        return variation.id ? supabase.from('product_variations').update(payload).eq('id', variation.id) : supabase.from('product_variations').insert({ ...payload, product_id: editing.id });
      });
      const results = await Promise.all(operations);
      const variationError = results.find(result => result.error)?.error;
      if (variationError) throw variationError;
      if (removedIds.length) {
        const { error: removeError } = await supabase.from('product_variations').delete().in('id', removedIds);
        if (removeError) throw removeError;
      }
      const stock = await recomputeProductStock(editing.id);
      setProducts(current => current.map(product => product.id === editing.id ? { ...product, materials: materials.trim(), technique: technique.trim(), stock } : product));
      setEditing(null);
      setFeedback({ tone: 'success', text: `${editing.name} was updated successfully.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: `${error instanceof Error ? error.message : 'Listing could not be saved.'} Your changes are still here.` });
    } finally { setSaving(false); }
  }

  async function updateStatus(product: ArtisanProduct, status: 'active' | 'inactive') {
    setFeedback(null);
    const { data, error } = await supabase.from('products').update({ status }).eq('id', product.id).select('*').single();
    if (error) { setFeedback({ tone: 'error', text: error.message }); return; }
    setProducts(current => current.map(item => item.id === product.id ? data as ArtisanProduct : item));
    setFeedback({ tone: 'success', text: `${product.name} is now ${status}.` });
  }

  async function archiveListing() {
    if (!archiveTarget) return;
    setArchiving(true);
    const { data, error } = await supabase.from('products').update({ status: 'archived' }).eq('id', archiveTarget.id).select('*').single();
    if (error) setFeedback({ tone: 'error', text: error.message });
    else {
      setProducts(current => current.map(product => product.id === archiveTarget.id ? data as ArtisanProduct : product));
      setFeedback({ tone: 'success', text: `${archiveTarget.name} moved to Design Vault.` });
      setArchiveTarget(null);
    }
    setArchiving(false);
  }

  return <div className="seller-listing-page">
    {feedback ? <div className={`seller-section-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.tone === 'success' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}<span>{feedback.text}</span><button onClick={() => setFeedback(null)} aria-label="Dismiss">×</button></div> : null}
    <div className="seller-listing-stats">
      <div><Package /><span>Total listings<strong>{counts.total}</strong></span></div>
      <div><CheckCircle2 /><span>Active<strong>{counts.active}</strong></span></div>
      <div><CircleOff /><span>Inactive<strong>{counts.inactive}</strong></span></div>
      <div className="is-warning"><AlertTriangle /><span>Low stock<strong>{counts.lowStock}</strong></span></div>
      <div className="is-danger"><Archive /><span>Out of stock<strong>{counts.outOfStock}</strong></span></div>
    </div>
    <SellerListingToolbar filters={filters} categories={categories} resultCount={visible.length} onChange={setFilters} />
    {loadingProducts ? <div className="seller-product-skeleton">{[1,2,3,4].map(item => <div key={item} />)}</div> : visible.length ? <div className="seller-product-list">{visible.map(product => <SellerListingCard key={product.id} product={product} price={productPrices[product.id] ?? product.price ?? 0} onEdit={openEdit} onArchive={setArchiveTarget} onToggleStatus={item => void updateStatus(item, item.status === 'active' ? 'inactive' : 'active')} />)}</div> : <div className="seller-empty-panel"><Package size={34} /><h2>No listings match this view</h2><p>Change or clear the filters to see more products.</p></div>}

    <SellerOverlay open={Boolean(editing)} title={editing ? `Edit ${editing.name}` : 'Edit listing'} description="Update materials, production details, pricing, and variation inventory." onClose={() => setEditing(null)} busy={saving} footer={<><button className="seller-button seller-button--secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</button><button className="seller-button seller-button--primary" onClick={() => void saveListing()} disabled={saving || editLoading}>{saving ? 'Saving…' : 'Save changes'}</button></>}>
      {editLoading ? <div className="seller-edit-loading">Loading listing details…</div> : <div className="seller-listing-editor">
        <section><h3>Product specifications</h3><div className="seller-editor-grid"><label><span>Materials</span><input value={materials} onChange={event => setMaterials(event.target.value)} placeholder="e.g. Stoneware clay" /></label><label><span>Technique</span><input value={technique} onChange={event => setTechnique(event.target.value)} placeholder="e.g. Hand-thrown" /></label></div></section>
        <section><div className="seller-editor-section-heading"><div><h3>Variations</h3><p>Keep pricing and stock accurate for every option.</p></div><button type="button" onClick={() => setVariations(current => [...current, emptyVariation()])}><Plus size={15} /> Add variation</button></div>
          {variations.length ? <div className="seller-variation-list">{variations.map((variation, index) => <div className="seller-variation-card" key={variation.id || `new-${index}`}><header><strong>Variation {index + 1}</strong><button type="button" onClick={() => setVariations(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove variation ${index + 1}`}><Trash2 size={15} /></button></header><div className="seller-editor-grid seller-editor-grid--three"><label><span>Dimensions</span><input value={variation.dimensions} onChange={event => updateVariation(index, 'dimensions', event.target.value)} /></label><label><span>Height</span><input value={variation.height} onChange={event => updateVariation(index, 'height', event.target.value)} /></label><label><span>Opening diameter</span><input value={variation.openingDiameter} onChange={event => updateVariation(index, 'openingDiameter', event.target.value)} /></label><label><span>Price</span><input type="number" min="0" value={variation.price} onChange={event => updateVariation(index, 'price', event.target.value)} /></label><label><span>Stock</span><input type="number" min="0" step="1" value={variation.stock} onChange={event => updateVariation(index, 'stock', event.target.value)} /></label></div></div>)}</div> : <div className="seller-editor-empty"><p>No variations yet.</p><button type="button" onClick={() => setVariations([emptyVariation()])}><Plus size={15} /> Add the first variation</button></div>}
        </section>
      </div>}
    </SellerOverlay>
    <SellerConfirmDialog open={Boolean(archiveTarget)} title="Archive listing?" description={archiveTarget ? `${archiveTarget.name} will be hidden from customers and moved to Design Vault.` : ''} confirmLabel="Archive listing" busy={archiving} onClose={() => { if (!archiving) setArchiveTarget(null); }} onConfirm={() => void archiveListing()} />
  </div>;
}
