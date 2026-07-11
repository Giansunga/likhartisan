type ChatProduct = {
  id: string;
  name: string;
  category?: string;
  material?: string;
  price: number;
  image?: string;
};

// Inline SVG fallback (no network dependency) — via.placeholder.com is dead.
const FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" fill="#F2EAE1"/><path d="M28 14c-6 0-10 5-10 11 0 6 4 9 4 13h12c0-4 4-7 4-13 0-6-4-11-10-11z" fill="#C9B7A6"/><circle cx="24" cy="26" r="1.6" fill="#7A6450"/><circle cx="32" cy="26" r="1.6" fill="#7A6450"/></svg>'
);

export default function ChatProductCard({ product }: { product: ChatProduct }) {
  const fmtPrice = `₱${Number(product.price || 0).toLocaleString()}`;
  const src = product.image && product.image.trim() ? product.image : FALLBACK;
  return (
    <a
      href={`/product/${product.id}`}
      onClick={e => { e.preventDefault(); window.location.assign(`/product/${product.id}`); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
        border: '1px solid var(--bg-tertiary)', borderRadius: '12px', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '8px', textDecoration: 'none',
      }}
    >
      <img
        src={src}
        alt={product.name}
        style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0, background: 'var(--bg-secondary)' }}
        onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK; }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-dark)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {product.name}
        </div>
        {product.category && (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', margin: '2px 0' }}>
            {product.category}{product.material ? ` · ${product.material}` : ''}
          </div>
        )}
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary-color)' }}>{fmtPrice}</div>
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', flexShrink: 0 }}>View →</span>
    </a>
  );
}
