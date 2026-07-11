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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Card 1 — Shipping Status */}
          <div style={{ background: '#fff', border: '1px solid #EAEAEA', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#C1570D', fontFamily: 'var(--font-sans)', marginBottom: '16px' }}>
                {statusInfo.label}
              </div>
              <div style={{ borderTop: '1px solid #EAEAEA', paddingTop: '16px' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#222', marginBottom: '12px', fontFamily: 'var(--font-sans)' }}>Shipping Details</div>
                <div style={{ fontSize: '0.82rem', color: '#777', marginBottom: '14px', fontFamily: 'var(--font-sans)' }}>
                  Courier Name: <span style={{ color: '#555' }}>{trackingId}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#FFF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C1570D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="3" width="15" height="13" rx="1" />
                      <path d="M16 8h4l3 3v5h-7V8z" />
                      <circle cx="5.5" cy="18.5" r="2.5" />
                      <circle cx="18.5" cy="18.5" r="2.5" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.82rem', color: '#C1570D', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>{deliveryText}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#aaa', fontFamily: 'var(--font-sans)' }}>{orderDate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2 — Product Information */}
          <div style={{ background: '#fff', border: '1px solid #EAEAEA', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#C1570D', fontFamily: 'var(--font-sans)', marginBottom: '16px' }}>
                {order.shop}
              </div>
              <div style={{ borderTop: '1px solid #EAEAEA', paddingTop: '16px' }}>
                {order.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: idx < order.items.length - 1 ? '16px' : 0 }}>
                    <img src={item.image} alt={item.productName}
                      style={{ width: '72px', height: '72px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #EAEAEA', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.94rem', fontWeight: 600, color: '#222', marginBottom: '2px', fontFamily: 'var(--font-sans)' }}>{item.productName}</div>
                      {(item.variation || item.dimensions) && (
                        <div style={{ fontSize: '0.82rem', color: '#777', fontFamily: 'var(--font-sans)' }}>{displayVariation(item.variation || item.dimensions || '')}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.82rem', color: '#777', marginBottom: '4px', fontFamily: 'var(--font-sans)' }}>x{item.qty}</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#222', fontFamily: 'var(--font-sans)' }}>{'\u20B1'}{item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid #EAEAEA', marginTop: '16px', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: '#777', fontFamily: 'var(--font-sans)' }}>Order Total:</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#222', fontFamily: 'var(--font-sans)' }}>{'\u20B1'}{order.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Card 3 — Order Details */}
          <div style={{ background: '#fff', border: '1px solid #EAEAEA', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#222', fontFamily: 'var(--font-sans)' }}>Order Details</div>
                <button onClick={() => navigate('/chat')}
                  style={{ padding: '7px 18px', border: '1.5px solid #C1570D', borderRadius: '8px', background: '#fff', color: '#C1570D', fontWeight: 600, fontSize: '0.78rem', fontFamily: 'var(--font-sans)', cursor: 'pointer', letterSpacing: '0.3px', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#C1570D'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#C1570D'; }}>
                  CONTACT SELLER
                </button>
              </div>
              <div style={{ borderTop: '1px solid #EAEAEA' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #EAEAEA' }}>
                  <span style={{ fontSize: '0.85rem', color: '#777', fontFamily: 'var(--font-sans)' }}>Order ID</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#222', fontFamily: 'var(--font-sans)' }}>{shortId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
                  <span style={{ fontSize: '0.85rem', color: '#777', fontFamily: 'var(--font-sans)' }}>Order Time</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#222', fontFamily: 'var(--font-sans)' }}>{orderTime}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
