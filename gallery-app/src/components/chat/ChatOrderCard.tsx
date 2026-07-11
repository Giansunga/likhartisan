import { Link } from 'react-router-dom';

type ChatOrder = {
  id: string;
  shortId: string;
  status: string;
  deliveryStatus: string;
  total: number;
  createdAt: string;
  itemCount: number;
  image?: string | null;
  productName?: string | null;
};

// Map an order's status/delivery_status to a unified badge (label + color).
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  'to-pay': { label: 'To Pay', color: '#C1570D', bg: '#FFF3E0' },
  'to-ship': { label: 'To Ship', color: '#C1570D', bg: '#FFF3E0' },
  preparing: { label: 'Preparing', color: '#1565C0', bg: '#E3F2FD' },
  'to-receive': { label: 'To Receive', color: '#C1570D', bg: '#FFF3E0' },
  shipped: { label: 'Shipped', color: '#6A1B9A', bg: '#F3E5F5' },
  delivered: { label: 'Delivered', color: '#2E7D32', bg: '#E8F5E9' },
  completed: { label: 'Completed', color: '#C1570D', bg: '#FFF3E0' },
  'return-refund': { label: 'Return / Refund', color: '#D32F2F', bg: '#FFEBEE' },
  cancelled: { label: 'Cancelled', color: '#757575', bg: '#F0F0F0' },
  pending: { label: 'Pending', color: '#757575', bg: '#F0F0F0' },
};

function resolveMeta(o: ChatOrder) {
  // Prefer the finer-grained delivery_status when the order is past payment.
  const key = o.status === 'to-pay' ? 'to-pay' : (o.deliveryStatus || o.status);
  return STATUS_META[key] || STATUS_META[o.status] || STATUS_META.pending;
}

export default function ChatOrderCard({ order }: { order: ChatOrder }) {
  const meta = resolveMeta(order);
  const fmtDate = new Date(order.createdAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  const fmtTotal = `₱${Number(order.total || 0).toLocaleString()}`;
  return (
    <div style={{
      border: '1px solid var(--bg-tertiary)', borderRadius: '12px', overflow: 'hidden',
      background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--bg-tertiary)' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dark)', fontFamily: 'var(--font-sans)' }}>
          Order #{order.shortId}
        </span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: meta.color, background: meta.bg, padding: '3px 10px', borderRadius: '10px' }}>
          {meta.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px 4px' }}>
        {order.image && (
          <img src={order.image} alt="Order item" style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '2px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-dark)', fontSize: '0.85rem', lineHeight: 1.2 }}>
            {order.productName || 'Order Items'}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>{order.itemCount} item{order.itemCount !== 1 ? 's' : ''} · {fmtDate}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-dark)', fontSize: '0.85rem', marginTop: '2px' }}>{fmtTotal}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', padding: '0 14px 12px' }}>
        <Link
          to={`/dashboard?tab=purchases&order=${order.id}`}
          style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '8px', border: '1.5px solid var(--primary-color)', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none', fontFamily: 'var(--font-sans)' }}
        >
          View Order
        </Link>
        <Link
          to="/chat"
          style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none', fontFamily: 'var(--font-sans)' }}
        >
          Contact Seller
        </Link>
      </div>
    </div>
  );
}
