import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { displayVariation } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

interface OrderItem {
  productId: string;
  productName: string;
  image: string;
  qty: number;
  price: number;
  shop_name: string;
  dimensions?: string;
  variation?: string;
}

interface OrderDetail {
  id: string;
  items: OrderItem[];
  total: number;
  status: string;
  delivery_status: string;
  shop: string;
  date: string;
  courier?: string;
  tracking?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'To Pay', color: '#C1570D' },
  paid: { label: 'To Ship', color: '#C1570D' },
  completed: { label: 'Completed', color: '#C1570D' },
  cancelled: { label: 'Cancelled', color: '#D32F2F' },
  refunded: { label: 'Refunded', color: '#D32F2F' },
};

const DELIVERY_MAP: Record<string, string> = {
  pending: 'Seller is preparing your order',
  preparing: 'Seller is preparing your order',
  shipped: 'Product has been handed to courier',
  delivered: 'Product has been delivered',
  completed: 'Order completed',
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!id || authLoading) return;
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, authLoading]);

  async function loadOrder() {
    setLoading(true);
    if (!user) { navigate('/'); return; }

    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (data) {
      const items: OrderItem[] = (data.items || []).map((i: any) => ({
        productId: i.product_id || i.productId || '',
        productName: i.product_name || i.productName || '',
        image: i.image || '',
        qty: i.qty || 1,
        price: i.price || 0,
        shop_name: i.shop_name || 'LikhArtisan Shop',
        dimensions: i.dimensions || '',
        variation: i.variation || '',
      }));

      setOrder({
        id: data.id,
        items,
        total: data.total,
        status: data.status || 'pending',
        delivery_status: data.delivery_status || 'pending',
        shop: items[0]?.shop_name || 'LikhArtisan Shop',
        date: data.created_at,
        courier: data.courier || '',
        tracking: data.tracking_number || '',
      });
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAF5EF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontFamily: 'var(--font-sans)' }}>Loading...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAF5EF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <p style={{ color: '#888', fontFamily: 'var(--font-sans)' }}>Order not found.</p>
        <Link to="/dashboard?tab=purchases" style={{ color: '#C1570D', fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-sans)' }}>Back to My Purchase</Link>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[order.status] || { label: order.status, color: '#C1570D' };
  const deliveryText = DELIVERY_MAP[order.delivery_status] || 'Processing';
  const orderDate = new Date(order.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const orderTime = new Date(order.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const shortId = order.id.replace(/-/g, '').slice(0, 12).toUpperCase();
  const trackingId = order.tracking || `LKHRTSN${Date.now().toString().slice(-10)}`;

  return (
    <div style={{ minHeight: '100vh', background: '#FAF5EF' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EAEAEA', padding: '16px 0' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', fontWeight: 700, color: '#222', margin: 0 }}>Order Details</h1>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '20px' }}>
        <div className="order-card" style={{ cursor: 'default' }}>
          {/* ── Header ── */}
          <div className="order-card-header">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#C1570D" strokeWidth="1.8" style={{ width: 16, height: 16, flexShrink: 0 }}>
                  <path d="M4 10h16l-1 10H5L4 10z" />
                  <path d="M8 10V7a4 4 0 018 0v3" />
                </svg>
                <span className="order-shop-name">{order.shop}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#999', fontFamily: 'var(--font-sans)', paddingLeft: '24px' }}>
                Order #{shortId}
                <span style={{ margin: '0 6px', color: '#ccc' }}>|</span>
                Placed on {orderDate}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusInfo.color, letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'var(--font-sans)' }}>
                {statusInfo.label}
              </span>
            </div>
          </div>

          {/* ── Current Status Pill ── */}
          <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', padding: '10px 14px', background: '#FFF7F0', border: '1px solid #F5D9C0', borderRadius: '10px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#C1570D" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
                <rect x="2" y="7" width="15" height="13" rx="2"/><path d="M17 11h3l2 2v5h-5v-7z"/><circle cx="6.5" cy="20" r="1.5"/><circle cx="19" cy="20" r="1.5"/>
              </svg>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#C1570D', fontFamily: 'var(--font-sans)', flex: 1 }}>{deliveryText}</span>
              <span style={{ fontSize: '0.72rem', color: '#999', fontFamily: 'var(--font-sans)' }}>{orderTime}</span>
            </div>
          </div>

          {/* ── Product Items ── */}
          {order.items.map((item, idx) => (
            <div className="order-product-row" key={idx}>
              <img src={item.image} alt={item.productName} className="order-product-img" />
              <div className="order-product-info">
                <h5 style={{ fontFamily: 'var(--font-sans)' }}>{item.productName}</h5>
                {(item.dimensions || item.variation) && <p style={{ fontFamily: 'var(--font-sans)', color: '#888', fontSize: '0.78rem' }}>{displayVariation(item.dimensions || item.variation || '')}</p>}
                <p style={{ fontFamily: 'var(--font-sans)', color: '#888', fontSize: '0.78rem' }}>Qty: {item.qty}</p>
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#C1570D', flexShrink: 0, fontFamily: 'var(--font-sans)', textAlign: 'right' }}>
                {'\u20B1'}{(item.price * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          ))}

          {/* ── Footer: Total + Actions ── */}
          <div className="order-card-footer">
            <div style={{ flex: 1 }}>
              <div className="order-total" style={{ fontFamily: 'var(--font-sans)', textAlign: 'right', marginBottom: '10px' }}>
                Order Total: <span style={{ color: '#C1570D', fontWeight: 700, fontSize: '1.05rem' }}>{'\u20B1'}{order.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#777', fontSize: '0.8rem', fontFamily: 'var(--font-sans)' }}>
                  Tracking ID: {trackingId}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button className="order-action-btn" onClick={() => navigate('/chat')}>Contact Seller</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
