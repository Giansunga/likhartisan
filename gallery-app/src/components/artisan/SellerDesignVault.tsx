import { useMemo, useState } from 'react';
import { Archive, CheckCircle2, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { ArtisanProduct } from '../../types/artisan';
import { SellerConfirmDialog } from './Overlay';
import SellerListingCard from './SellerListingCard';
import SellerListingToolbar from './SellerListingToolbar';
import { useArtisanPortal } from './artisanContextValue';
import { filterAndSortListings, type ListingFilters } from './listingUtils';

const initialFilters: ListingFilters = { search: '', status: 'all', inventory: 'all', category: 'all', sort: 'newest' };

export default function SellerDesignVault() {
  const { products, productPrices, loadingProducts, setProducts } = useArtisanPortal();
  const [filters, setFilters] = useState(initialFilters);
  const [restoreTarget, setRestoreTarget] = useState<ArtisanProduct | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const archived = useMemo(() => products.filter(product => product.status === 'archived'), [products]);
  const categories = useMemo(() => [...new Set(archived.map(product => product.category).filter(Boolean))].sort(), [archived]);
  const visible = useMemo(() => filterAndSortListings(archived, filters, productPrices), [archived, filters, productPrices]);

  async function restoreListing() {
    if (!restoreTarget) return;
    setRestoring(true);
    const { data, error } = await supabase.from('products').update({ status: 'active' }).eq('id', restoreTarget.id).select('*').single();
    if (error) setFeedback({ tone: 'error', text: error.message });
    else {
      setProducts(current => current.map(product => product.id === restoreTarget.id ? data as ArtisanProduct : product));
      setFeedback({ tone: 'success', text: `${restoreTarget.name} is active and visible in My Listings.` });
      setRestoreTarget(null);
    }
    setRestoring(false);
  }

  return <div className="seller-listing-page seller-vault-page">
    <div className="portal-action-bar"><Link className="seller-button seller-button--outline" to="/artisan-dashboard/listings"><RotateCcw size={16} /> Back to listings</Link></div>
    {feedback ? <div className={`seller-section-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}><CheckCircle2 size={17} /><span>{feedback.text}</span><button onClick={() => setFeedback(null)} aria-label="Dismiss">×</button></div> : null}
    <div className="seller-vault-intro"><div><Archive size={24} /><span><strong>{archived.length} archived listing{archived.length === 1 ? '' : 's'}</strong><small>Archived products remain saved but cannot be purchased by customers.</small></span></div></div>
    <SellerListingToolbar filters={filters} categories={categories} resultCount={visible.length} showStatus={false} onChange={setFilters} />
    {loadingProducts ? <div className="seller-product-skeleton">{[1,2,3].map(item => <div key={item} />)}</div> : visible.length ? <div className="seller-product-list">{visible.map(product => <SellerListingCard key={product.id} archived product={product} price={productPrices[product.id] ?? product.price ?? 0} busy={restoring} onRestore={setRestoreTarget} />)}</div> : <div className="seller-empty-panel seller-empty-panel--large"><Archive size={36} /><h2>{archived.length ? 'No archived listings match these filters' : 'Your Design Vault is empty'}</h2><p>{archived.length ? 'Clear or change the filters to find another archived product.' : 'Products you archive from My Listings will be safely stored here.'}</p></div>}
    <SellerConfirmDialog open={Boolean(restoreTarget)} title="Restore listing?" description={restoreTarget ? `${restoreTarget.name} will become active and visible to customers again.` : ''} confirmLabel="Restore listing" danger={false} busy={restoring} onClose={() => { if (!restoring) setRestoreTarget(null); }} onConfirm={() => void restoreListing()} />
  </div>;
}
