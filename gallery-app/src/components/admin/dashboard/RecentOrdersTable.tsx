import { useNavigate } from 'react-router-dom';

function fmt(n: number) {
  return '\u20B1' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

const statusColors: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#FFF3E0', color: '#E65100' },
  paid: { bg: '#DCFCE7', color: '#16A34A' },
  completed: { bg: '#DCFCE7', color: '#15803D' },
  cancelled: { bg: '#FEE2E2', color: '#DC2626' },
  preparing: { bg: '#DBEAFE', color: '#2563EB' },
  shipped: { bg: '#EDE9FE', color: '#7C3AED' },
  delivered: { bg: '#DCFCE7', color: '#16A34A' },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusColors[status] || statusColors.pending;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
      fontSize: '0.75rem', fontWeight: 600, background: s.bg, color: s.color,
      textTransform: 'capitalize' as const,
    }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface Order {
  id: string;
  user_name: string;
  total: number;
  status: string;
  delivery_status?: string;
  created_at: string;
  items?: any[];
}

interface RecentOrdersTableProps {
  orders: Order[];
}

export default function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  const navigate = useNavigate();

  return (
    <div style={{
      background: '#fff', borderRadius: '14px',
      border: '1px solid #E9DED2',
      boxShadow: '0 2px 8px rgba(147,67,8,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #F0EBE4' }}>
        <h3 style={{ fontWeight: 700, color: '#1F1F1F', fontSize: '0.95rem' }}>Recent Orders</h3>
        <button
          onClick={() => navigate('/admin/orders')}
          style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #E9DED2', background: '#fff', color: '#934308', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
        >
          View All Orders
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #F0EBE4' }}>
            {['ORDER', 'CUSTOMER', 'SHOP', 'AMOUNT', 'STATUS', 'DATE', 'ACTION'].map(h => (
              <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#77716B', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: '#A89688' }}>No orders yet.</td></tr>
          ) : orders.map((o) => (
            <tr key={o.id} style={{ borderBottom: '1px solid #F5F0EB', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FDF8F4')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1F1F1F', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                #{o.id.slice(0, 8).toUpperCase()}
              </td>
              <td style={{ padding: '12px 16px', color: '#1F1F1F' }}>{o.user_name || '--'}</td>
              <td style={{ padding: '12px 16px', color: '#77716B' }}>{o.items?.[0]?.shop_name || '--'}</td>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1F1F1F' }}>{fmt(o.total || 0)}</td>
              <td style={{ padding: '12px 16px' }}><StatusBadge status={o.status || 'pending'} /></td>
              <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#77716B' }}>
                {fmtDate(o.created_at)}<br />
                <span style={{ fontSize: '0.75rem', color: '#A89688' }}>{fmtTime(o.created_at)}</span>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate('/admin/orders'); }}
                  style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #E9DED2', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="#77716B" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
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