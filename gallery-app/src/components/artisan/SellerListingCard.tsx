import { Archive, ExternalLink, Pencil, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ArtisanProduct } from '../../types/artisan';
import { getInventoryState } from './listingUtils';

interface Props {
  product: ArtisanProduct;
  price: number;
  archived?: boolean;
  busy?: boolean;
  onEdit?: (product: ArtisanProduct) => void;
  onArchive?: (product: ArtisanProduct) => void;
  onRestore?: (product: ArtisanProduct) => void;
  onToggleStatus?: (product: ArtisanProduct) => void;
}

export default function SellerListingCard({ product, price, archived, busy, onEdit, onArchive, onRestore, onToggleStatus }: Props) {
  const inventory = getInventoryState(product.stock);
  return (
    <article className={`seller-product-row ${archived ? 'is-archived' : ''}`}>
      <div className="seller-product-row__image">{product.image ? <img src={product.image} alt="" /> : <span>No image</span>}</div>
      <div className="seller-product-row__identity"><strong>{product.name}</strong><span>{product.category || 'Uncategorized'}</span><small>Added {new Date(product.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small></div>
      <div className="seller-product-row__price"><span>Starting price</span><strong>₱{price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
      <div className="seller-product-row__stock"><span>Inventory</span><strong>{product.stock} in stock</strong><small className={`is-${inventory}`}>{inventory === 'out-of-stock' ? 'Out of stock' : inventory === 'low-stock' ? 'Low stock' : 'In stock'}</small></div>
      <div className="seller-product-row__status"><span>Status</span><b className={`is-${archived ? 'archived' : product.status}`}>{archived ? 'Archived' : product.status}</b></div>
      <div className="seller-product-row__actions">
        <Link to={`/product/${product.id}`} target="_blank" aria-label={`Preview ${product.name}`}><ExternalLink size={16} /></Link>
        {archived ? <button type="button" disabled={busy} onClick={() => onRestore?.(product)}><RotateCcw size={16} /> Restore</button> : <>
          <button type="button" onClick={() => onEdit?.(product)}><Pencil size={16} /> Edit</button>
          <button type="button" className="seller-product-row__status-action" onClick={() => onToggleStatus?.(product)}>{product.status === 'active' ? 'Deactivate' : 'Activate'}</button>
          <button type="button" className="is-danger" onClick={() => onArchive?.(product)}><Archive size={16} /> Archive</button>
        </>}
      </div>
    </article>
  );
}
