import { Link } from 'react-router-dom';
import type { LikhAIOrderCard } from '../../types/likhai';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  'to-pay': { label: 'To Pay', color: '#C1570D', bg: '#FFF3E0' },
  'to-ship': { label: 'To Ship', color: '#C1570D', bg: '#FFF3E0' },
  preparing: { label: 'Preparing', color: '#1565C0', bg: '#E3F2FD' },
  'to-receive': { label: 'To Receive', color: '#C1570D', bg: '#FFF3E0' },
  shipped: { label: 'Shipped', color: '#6A1B9A', bg: '#F3E5F5' },
  delivered: { label: 'Delivered', color: '#2E7D32', bg: '#E8F5E9' },
  completed: { label: 'Completed', color: '#2E7D32', bg: '#E8F5E9' },
  'return-refund': { label: 'Return / Refund', color: '#D32F2F', bg: '#FFEBEE' },
  cancelled: { label: 'Cancelled', color: '#757575', bg: '#F0F0F0' },
  pending: { label: 'Pending', color: '#757575', bg: '#F0F0F0' },
};

export default function ChatOrderCard({ order }: { order: LikhAIOrderCard }) {
  const meta = STATUS_META[order.status] || STATUS_META.pending;
  const date = new Date(order.createdAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <article className="likhai-card" aria-label={`Order ${order.shortId}`}>
      <div className="likhai-card__header">
        <strong>Order #{order.shortId}</strong>
        <span className="likhai-status" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
      </div>
      <div className="likhai-card__body">
        {order.image && <img src={order.image} alt="" className="likhai-card__image likhai-card__image--small" />}
        <div className="likhai-card__content">
          <strong>{order.productName || 'Order items'}</strong>
          <span>{order.itemCount} item{order.itemCount === 1 ? '' : 's'} · {date}</span>
          <strong>₱{Number(order.total || 0).toLocaleString()}</strong>
          {order.paymentStatus && <span>Payment: {order.paymentStatus}</span>}
          {order.deliveryProvider && <span>Courier: {order.deliveryProvider}</span>}
          {order.trackingNumber && <span>Tracking: {order.trackingNumber}</span>}
          {order.estimatedDelivery && <span>Estimated delivery: {new Date(order.estimatedDelivery).toLocaleDateString()}</span>}
          {order.returnStatus && <span>Return status: {order.returnStatus.replace(/_/g, ' ')}</span>}
          {order.deliveryNotes && <span>Delivery note: {order.deliveryNotes}</span>}
        </div>
      </div>
      <div className="likhai-card__actions">
        <Link to={order.href}>View order</Link>
        <Link to={`/chat?order=${encodeURIComponent(order.id)}`} className="likhai-card__secondary">Contact seller</Link>
      </div>
    </article>
  );
}
