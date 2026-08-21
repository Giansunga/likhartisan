import { useEffect, useRef, useState } from 'react';
import { Ellipsis, Eye, LockKeyhole, Pencil, Trash2 } from 'lucide-react';
import type { Product } from '../../types';
import { inventoryCondition } from '../../lib/adminProducts';

interface ProductTableProps {
  products: Product[];
  busyProductId?: string | null;
  onDelete: (product: Product) => void;
  onArchive: (product: Product) => void;
  onEdit: (product: Product) => void;
}

function peso(value: number) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value); }
function titleCase(value: string) { return value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Unknown'; }

function StatusBadge({ product }: { product: Product }) {
  const inventory = inventoryCondition(product.stock);
  return <span className={`product-status product-status--${inventory}`}>{inventory === 'out' ? 'Out of stock' : inventory === 'low' ? 'Low stock' : `${product.stock} in stock`}</span>;
}

function ProductImage({ product }: { product: Product }) {
  return <img className="product-cell__image" src={product.image || '/placeholder.svg'} alt="" onError={(event) => { event.currentTarget.src = '/placeholder.svg'; }} />;
}

function ProductActions({ product, busy, onEdit, onArchive, onDelete }: { product: Product; busy: boolean; onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return <div className="product-actions" ref={menuRef}>
    <button className="product-edit-action" type="button" onClick={onEdit} disabled={busy}><Pencil aria-hidden="true" />{busy ? 'Working…' : 'Edit'}</button>
    <button className="product-more-action" type="button" aria-label={`More actions for ${product.name}`} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}><Ellipsis aria-hidden="true" /></button>
    {open && <div className="product-action-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onArchive(); }}>{product.status === 'archived' ? 'Activate product' : 'Archive product'}</button>
      <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpen(false); onDelete(); }}><Trash2 aria-hidden="true" />Delete product</button>
    </div>}
  </div>;
}

export default function ProductTable({ products, busyProductId, onDelete, onArchive, onEdit }: ProductTableProps) {
  return <>
    <div className="products-table-wrap"><table className="products-table">
      <thead><tr><th>Product</th><th>Shop</th><th>Category</th><th>Price</th><th>Inventory</th><th>Status</th><th>Views</th><th>Actions</th></tr></thead>
      <tbody>{products.map((product) => <tr key={product.id}>
        <td><div className="product-cell"><ProductImage product={product} /><div><strong>{product.name}</strong><small>{product.model3d ? '3D model attached' : 'No 3D model'}</small></div></div></td>
        <td>{product.shopName || '—'}</td>
        <td><span className="product-category">{product.category || 'Uncategorized'}</span></td>
        <td className="product-price">{peso(product.price)}</td>
        <td><StatusBadge product={product} /></td>
        <td><span className={`product-publish product-publish--${product.status}`}>{titleCase(product.status)}</span></td>
        <td><span className="product-views"><Eye aria-hidden="true" />{product.views.toLocaleString()}</span></td>
        <td><ProductActions product={product} busy={busyProductId === product.id} onEdit={() => onEdit(product)} onArchive={() => onArchive(product)} onDelete={() => onDelete(product)} /></td>
      </tr>)}</tbody>
    </table></div>
    <div className="products-cards">{products.map((product) => <article className="product-card" key={product.id}>
      <div className="product-card__top"><ProductImage product={product} /><div><strong>{product.name}</strong><span>{product.shopName || 'No shop'} · {product.category || 'Uncategorized'}</span><div><StatusBadge product={product} /><span className={`product-publish product-publish--${product.status}`}>{titleCase(product.status)}</span></div></div></div>
      <div className="product-card__facts"><b>{peso(product.price)}</b><span><Eye aria-hidden="true" />{product.views.toLocaleString()} views</span>{product.model3d ? <span>3D model attached</span> : <span><LockKeyhole aria-hidden="true" />No 3D model</span>}</div>
      <ProductActions product={product} busy={busyProductId === product.id} onEdit={() => onEdit(product)} onArchive={() => onArchive(product)} onDelete={() => onDelete(product)} />
    </article>)}</div>
  </>;
}
