type ChatProduct = {
  id: string;
  name: string;
  category?: string;
  material?: string;
  price: number;
  image?: string;
};

const PLACEHOLDER = 'https://via.placeholder.com/64?text=Pottery';

export default function ChatProductCard({ product }: { product: ChatProduct }) {
  const fmtPrice = `₱${Number(product.price || 0).toLocaleString()}`;
  const src = product.image && product.image.trim() ? product.image : PLACEHOLDER;
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
        onError={e => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER; }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dark)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {product.name}
        </div>
        {product.category && (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', margin: '2px 0' }}>
            {product.category}{product.material ? ` · ${product.material}` : ''}
          </div>
        )}
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary-color)' }}>{fmtPrice}</div>
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', flexShrink: 0 }}>View →</span>
    </a>
  );
}
