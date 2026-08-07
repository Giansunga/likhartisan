import { useNavigate } from 'react-router-dom';

function fmt(n: number) {
  return '\u20B1' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusColors: Record<string, { bg: string; color: string }> = {
  active: { bg: '#DCFCE7', color: '#16A34A' },
  approved: { bg: '#DCFCE7', color: '#16A34A' },
  pending: { bg: '#FFF3E0', color: '#E65100' },
  archived: { bg: '#F5F5F5', color: '#929090' },
  draft: { bg: '#FFF3E0', color: '#E65100' },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusColors[status] || statusColors.pending;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
      fontSize: '0.72rem', fontWeight: 600, background: s.bg, color: s.color,
      textTransform: 'capitalize' as const,
    }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface Product {
  id: string;
  name: string;
  image: string;
  price: number;
  shop_name: string;
  category: string;
  status: string;
}

interface RecentProductsTableProps {
  products: Product[];
}

export default function RecentProductsTable({ products }: RecentProductsTableProps) {
  const navigate = useNavigate();

  return (
    <div style={{
      background: '#fff', borderRadius: '14px',
      border: '1px solid #E9DED2',
      boxShadow: '0 2px 8px rgba(147,67,8,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #F0EBE4' }}>
        <h3 style={{ fontWeight: 700, color: '#1F1F1F', fontSize: '0.95rem' }}>Recently Uploaded Products</h3>
        <button
          onClick={() => navigate('/admin/products')}
          style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #E9DED2', background: '#fff', color: '#934308', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
        >
          View All Products
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #F0EBE4' }}>
            {['PRODUCT', 'SHOP', 'CATEGORY', 'PRICE', 'STATUS', 'ACTION'].map(h => (
              <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#77716B', fontSize: '0.7rem', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: '#A89688' }}>No products uploaded yet.</td></tr>
          ) : products.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #F5F0EB', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FDF8F4')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {p.image && <img src={p.image} alt="" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #E9DED2' }} />}
                  <span style={{ fontWeight: 500, color: '#1F1F1F' }}>{p.name}</span>
                </div>
              </td>
              <td style={{ padding: '12px 16px', color: '#77716B' }}>{p.shop_name || '--'}</td>
              <td style={{ padding: '12px 16px', color: '#77716B' }}>{p.category || '--'}</td>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1F1F1F' }}>{fmt(p.price || 0)}</td>
              <td style={{ padding: '12px 16px' }}><StatusBadge status={p.status || 'active'} /></td>
              <td style={{ padding: '12px 16px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate('/admin/products'); }}
                  style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #E9DED2', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="#77716B" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
                    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}