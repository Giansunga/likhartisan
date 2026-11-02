import { ShoppingBag } from 'lucide-react';
import AssetImage from '../../components/AssetImage';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { displayVariation } from '../../lib/utils';
import { purchaseApi } from '../../lib/purchaseApi';
import { getErrorMessage } from '../../lib/portalErrors';
import type { Order } from '../../types';
import { toast } from '../../lib/popups';
import { SellerConfirmDialog } from '../../components/artisan/Overlay';
import { useOverlayA11y } from '../../components/artisan/useOverlayA11y';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';

type SellerOrder = Omit<Order, 'items' | 'design_request_id'> & {
  rowKey: string; item_name: string; item_image: string; item_qty: number; item_price: number;
  item_variation: string; design_request_id: string | null;
};

type SavedSellerOrder = Pick<Order, 'id' | 'status' | 'delivery_status'> & { payment_status?: string };

function isSavedSellerOrder(value: unknown, id: string): value is SavedSellerOrder {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Order>;
  return row.id === id && typeof row.status === 'string' && Boolean(row.status.trim())
    && typeof row.delivery_status === 'string' && Boolean(row.delivery_status.trim());
}

function sellerPaymentStatus(value?: string) {
  if (!value || value === 'pending') return 'Pending';
  if (value === 'paid' || value === 'completed') return 'Paid';
  return value === 'refunded' ? 'Refunded' : 'Cancelled';
}

export function OrdersPanel({ shopId, shopName, loadingOrders, setLoadingOrders }: { shopId: string | null; shopName?: string; loadingOrders: boolean; setLoadingOrders: (v: boolean) => void }) {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTime, setFilterTime] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [now] = useState(() => Date.now());
  const [updateError, setUpdateError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SellerOrder | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const orderPanelRef = useOverlayA11y(Boolean(selectedOrder), () => setSelectedOrder(null));
  const [searchParams, setSearchParams] = useSearchParams();
  const requestSequence = useRef(0);
  const pendingOrders = useRef(new Set<string>());
  const [busyOrders, setBusyOrders] = useState(new Set<string>());

  function formatRelativeTime(dateStr: string) {
    const minutes = Math.max(0, Math.floor((now - new Date(dateStr).getTime()) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const fetchOrders = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (request !== requestSequence.current) return;
      const rows: SellerOrder[] = [];
      for (const order of (data || []) as Order[]) {
        const items = Array.isArray(order.items) ? order.items : [];
        const shopItems = items.filter(item => item.shop_id ? item.shop_id === shopId : (!!shopName && item.shop_name === shopName));
        for (const [index, item] of shopItems.entries()) {
          rows.push({
            ...order, rowKey: `${order.id}:${item.variation_id || item.product_id || index}:${index}`,
            item_name: item.product_name || '', item_image: item.image || '', item_qty: Number(item.qty) || 1,
            item_price: Number(item.price) || 0, item_variation: item.variation || '',
            payment_status: sellerPaymentStatus(order.payment_status),
            delivery_status: order.delivery_status || 'pending', status: order.status || 'pending', order_type: order.order_type || 'product',
            design_request_id: order.design_request_id || null, total: Number(order.total) || 0,
            shipping_fee: Number(order.shipping_fee) || 0, subtotal: Number(order.subtotal) || 0,
          });
        }
      }
      setOrders(rows);
      setSelectedOrder(current => current ? rows.find(row => row.rowKey === current.rowKey) || null : null);
      setLoadError('');
    } catch (cause) { if (request === requestSequence.current) setLoadError(getErrorMessage(cause, 'Orders could not be loaded.')); }
    finally { if (request === requestSequence.current) setLoadingOrders(false); }
  }, [setLoadingOrders, shopId, shopName]);

  const invalidateOrders = useCallback(() => { requestSequence.current++; }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void fetchOrders(); });
    return () => { active = false; invalidateOrders(); };
  }, [fetchOrders, invalidateOrders]);
  usePortalRealtimeRefresh(['orders'], fetchOrders);
  useEffect(() => {
    const orderId = searchParams.get('orderId');
    const match = orderId ? orders.find(row => row.id === orderId) : null;
    if (!match) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSelectedOrder(match);
      const params = new URLSearchParams(searchParams); params.delete('orderId');
      setSearchParams(params, { replace: true });
    });
    return () => { active = false; };
  }, [orders, searchParams, setSearchParams]);

  function applySavedOrder(saved: SavedSellerOrder) {
    // Invalidate reads that began while this mutation was in flight as well as
    // reads that preceded it. A late snapshot must not undo a confirmed write.
    requestSequence.current++;
    const merge = (item: SellerOrder): SellerOrder => ({ ...item, status: saved.status, delivery_status: saved.delivery_status,
      ...(saved.payment_status ? { payment_status: sellerPaymentStatus(saved.payment_status) } : {}) });
    setOrders(current => current.map(item => item.id === saved.id ? merge(item) : item));
    setSelectedOrder(current => current?.id === saved.id ? merge(current) : current);
  }

  async function changeStatus(order: { id: string; order_type?: string }, nextStatus: string) {
    if (pendingOrders.current.has(order.id)) return false;
    pendingOrders.current.add(order.id); setBusyOrders(new Set(pendingOrders.current));
    requestSequence.current++; setUpdateError('');
    try {
      if (order.order_type === 'customized' && nextStatus !== 'cancelled') {
        const { data, error } = await supabase.rpc('advance_custom_order', { p_order_id: order.id, p_next_status: nextStatus });
        if (error) throw error;
        if (!isSavedSellerOrder(data, order.id)) throw new Error('The saved order could not be confirmed. Reload before retrying.');
        applySavedOrder(data);
      } else {
        const result = await purchaseApi<{ order: Pick<Order, 'id' | 'status' | 'delivery_status'>; notificationSent: boolean }>(`/${order.id}/seller-delivery-status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
        if (!isSavedSellerOrder(result?.order, order.id)) throw new Error('The saved order could not be confirmed. Reload before retrying.');
        applySavedOrder(result.order);
        if (!result.notificationSent) toast.error('Order updated but notification failed to send. Do not repeat the order update.');
      }
      return true;
    } catch (cause) { setUpdateError(getErrorMessage(cause, 'Order update failed. Reload before retrying.')); return false; }
    finally { pendingOrders.current.delete(order.id); setBusyOrders(new Set(pendingOrders.current)); setLoadingOrders(false); }
  }
  const advanceDeliveryStatus = changeStatus;

  const deliveryBadge = (status: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
      pending: { bg: '#FFF3E0', color: '#E65100' },
      preparing: { bg: '#E3F2FD', color: '#1565C0' },
      shipped: { bg: '#F3E5F5', color: '#6A1B9A' },
      delivered: { bg: '#E8F5E9', color: '#2E7D32' },
      completed: { bg: '#E8F5E9', color: '#1B5E20' },
      cancelled: { bg: '#FFEBEE', color: '#C62828' },
    };
    const s = styles[status] || styles.pending;
    return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: s.bg, color: s.color, textTransform: 'capitalize' }}>{status}</span>;
  };

  const paymentBadge = (status: string) => {
    const bg = status === 'Paid' ? '#E8F5E9' : status === 'Cancelled' ? '#FFEBEE' : '#FFF3E0';
    const color = status === 'Paid' ? '#2E7D32' : status === 'Cancelled' ? '#C62828' : '#E65100';
    return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: bg, color: color }}>{status}</span>;
  };

  const filtered = orders
    .filter(o => {
      if (filterStatus === 'cancelled' && o.status !== 'cancelled') return false;
      if (filterStatus !== 'all' && filterStatus !== 'cancelled' && o.delivery_status !== filterStatus) return false;
      if (search && !o.item_name.toLowerCase().includes(search.toLowerCase()) && !o.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTime !== 'all') {
        const orderDate = new Date(o.created_at);
        const now = new Date();
        if (filterTime === 'today') {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (orderDate < today) return false;
        } else if (filterTime === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (orderDate < weekAgo) return false;
        } else if (filterTime === 'month') {
          if (orderDate.getMonth() !== now.getMonth() || orderDate.getFullYear() !== now.getFullYear()) return false;
        } else if (filterTime === 'year') {
          if (orderDate.getFullYear() !== now.getFullYear()) return false;
        }
      }
      return true;
    })
    .sort((a, b) => sortOrder === 'newest' ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

return (
    <div>
      {loadError && <div role="alert">{loadError}<button type="button" onClick={() => void fetchOrders()}>Try again</button></div>}
      {updateError && !selectedOrder && (
        <div role="alert" style={{ padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', background: '#FEE2E2', color: '#991B1B', fontSize: '0.9rem', fontWeight: 500, border: '1px solid #FECACA' }}>
          {updateError}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2.5" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', height: '15px', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search order..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 38px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', background: '#fff', color: 'var(--text-dark)', boxSizing: 'border-box' }} />
        </div>
<select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
        style={{ padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', background: '#fff', color: 'var(--text-dark)', cursor: 'pointer' }}>
  <option value="all">Filter Order Status</option>
  <option value="pending">Pending</option>
  <option value="preparing">Preparing</option>
  <option value="shipped">Shipped</option>
  <option value="delivered">Delivered</option>
  <option value="completed">Completed</option>
  <option value="cancelled">Cancelled</option>
</select>
        <select value={filterTime} onChange={e => setFilterTime(e.target.value)}
          style={{ padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', background: '#fff', color: 'var(--text-dark)', cursor: 'pointer' }}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}
          style={{ padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', background: '#fff', color: 'var(--text-dark)', cursor: 'pointer' }}>
          <option value="newest">Sort (Newest)</option>
          <option value="oldest">Sort (Oldest)</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E8E0D8', textAlign: 'left' }}>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order ID</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Item</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingOrders ? (
              [1,2,3,4,5].map(i => (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f0eb' }}>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton" style={{ height: '16px', width: '60px', borderRadius: '4px' }}></div></td>
                      <td style={{ padding: '14px 18px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="shimmer-skeleton" style={{ width: '44px', height: '44px', borderRadius: '6px' }}></div></div></td>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton" style={{ height: '20px', width: '80px', borderRadius: '20px' }}></div></td>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton" style={{ height: '20px', width: '80px', borderRadius: '20px' }}></div></td>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton" style={{ height: '20px', width: '80px', borderRadius: '4px' }}></div></td>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton" style={{ height: '16px', width: '50px', borderRadius: '4px' }}></div></td>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton-warm" style={{ height: '30px', width: '100px', borderRadius: '6px' }}></div></td>
                    </tr>
                  ))
              ) : loadError && filtered.length === 0 ? null : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '48px 18px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FDF5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <ShoppingBag size={26} color="#823E0B" />
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-dark)', fontWeight: 600, marginBottom: '4px' }}>No orders found</p>
                  <p style={{ fontSize: '0.82rem', color: '#A89688' }}>Try adjusting your filters or date range.</p>
                </div>
              </td></tr>
            ) : filtered.map((order) => (
              <tr key={order.rowKey} onClick={event => {
                if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return;
                setSelectedOrder(order);
              }} style={{ borderBottom: '1px solid #f5f0eb', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FDF8F4')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-dark)', fontSize: '0.82rem' }}>{order.id.slice(0, 8).toUpperCase()}</td>
                <td style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <AssetImage src={order.item_image} alt={order.item_name} style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, background: 'var(--bg-secondary)' }} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '2px' }}>{order.item_name}</div>
                      {order.order_type === 'customized' && <a href={`/artisan-dashboard/requests?requestId=${encodeURIComponent(order.design_request_id || '')}`} onClick={event => event.stopPropagation()} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#823E0B' }}>Custom design · View request</a>}
                      {order.item_variation && <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '2px' }}>{displayVariation(order.item_variation)}</div>}
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>Qty: {order.item_qty}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 18px' }}>{paymentBadge(order.payment_status || 'Pending')}</td>
                <td style={{ padding: '14px 18px' }}>{deliveryBadge(order.delivery_status)}</td>
                <td style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--accent-color)' }}>{'\u20B1'}{(order.item_price * order.item_qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: '14px 18px', fontSize: '0.78rem', color: 'var(--text-light)' }}>{formatRelativeTime(order.created_at)}</td>
                <td style={{ padding: '14px 18px' }}>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {/* Cancelled + delivery cancelled: show red Completed label */}
                                    {order.delivery_status === 'cancelled' && (
                                      <span style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#d32f2f', background: '#ffebee', borderRadius: '6px' }}>Completed</span>
                                    )}
                                    {/* Payment cancelled but delivery not yet cancelled: show Cancel Order button */}
                                    {order.delivery_status !== 'cancelled' && (order.payment_status === 'Cancelled' || order.status === 'cancelled') && (
                                      <button onClick={(e) => { e.stopPropagation(); setCancelTarget(order); }}
                                        style={{ padding: '5px 12px', border: '1.5px solid #d32f2f', borderRadius: '6px', background: '#d32f2f', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Cancel Order</button>
                                    )}
                                    {/* Active orders: show action buttons based on delivery status */}
                                    {order.delivery_status === 'pending' && order.payment_status !== 'Cancelled' && order.status !== 'cancelled' && (
                                      <>
                                        <button disabled={busyOrders.has(order.id) || (order.order_type === 'customized' && order.payment_status !== 'Paid')} onClick={(e) => { e.stopPropagation(); void advanceDeliveryStatus(order, 'preparing'); }}
                                          style={{ padding: '5px 12px', border: '1.5px solid #1565C0', borderRadius: '6px', background: '#1565C0', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: order.order_type === 'customized' && order.payment_status !== 'Paid' ? 'not-allowed' : 'pointer', opacity: order.order_type === 'customized' && order.payment_status !== 'Paid' ? 0.55 : 1 }}>{order.order_type === 'customized' && order.payment_status !== 'Paid' ? 'Awaiting Payment' : order.order_type === 'customized' ? 'Start Production' : 'Confirm Order'}</button>
                                      </>
                                    )}
                    {order.delivery_status === 'preparing' && (
                      <>
                        <button disabled={busyOrders.has(order.id)} onClick={(e) => { e.stopPropagation(); void advanceDeliveryStatus(order, 'shipped'); }}
                          style={{ padding: '5px 12px', border: '1.5px solid #ED6C02', borderRadius: '6px', background: '#ED6C02', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Hand to Courier</button>
                      </>
                    )}
                    {order.delivery_status === 'shipped' && (
                      <button disabled={busyOrders.has(order.id)} onClick={(e) => { e.stopPropagation(); void advanceDeliveryStatus(order, 'delivered'); }}
                        style={{ padding: '5px 12px', border: '1.5px solid #2E7D32', borderRadius: '6px', background: '#2E7D32', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Mark Delivered</button>
                    )}
                    {order.delivery_status === 'delivered' && (
                      <button disabled={busyOrders.has(order.id)} onClick={(e) => { e.stopPropagation(); void advanceDeliveryStatus(order, 'completed'); }}
                        style={{ padding: '5px 12px', border: '1.5px solid #1B5E20', borderRadius: '6px', background: '#1B5E20', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Complete</button>
                    )}
                    {order.delivery_status === 'completed' && (
                      <span style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#2E7D32' }}>Completed</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Buyer Detail Modal */}
      {selectedOrder && (
        <div className="seller-overlay seller-overlay--drawer" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', padding: 0 }}
          onClick={() => setSelectedOrder(null)}>
          <div ref={orderPanelRef} className="seller-overlay__panel" role="dialog" aria-modal="true" aria-label={`Order ${selectedOrder.id.slice(0, 8)}`} tabIndex={-1} style={{ background: '#fff', borderRadius: 0, width: 'min(520px, 100%)', maxWidth: '100%', height: '100%', maxHeight: 'none', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #E8E0D8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Order #{selectedOrder.id.slice(0, 8).toUpperCase()}</h3>
                <button onClick={() => setSelectedOrder(null)}
                  style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8C7B6E', fontSize: '1.1rem' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#d32f2f'; e.currentTarget.style.color = '#d32f2f'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E0D8'; e.currentTarget.style.color = '#8C7B6E'; }}>&#x2715;</button>
              </div>
            </div>

            {updateError && <div role="alert" style={{ margin: '16px 28px', padding: '12px', borderRadius: '8px', background: '#FEE2E2', color: '#991B1B' }}>{updateError}</div>}

            {/* Buyer Info */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid #E8E0D8', background: '#FDF8F4' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Buyer Information</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#8C7B6E', width: '60px', flexShrink: 0 }}>Name</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)' }}>{selectedOrder.user_name || '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#8C7B6E', width: '60px', flexShrink: 0 }}>Phone</span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-dark)' }}>{selectedOrder.user_phone || '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#8C7B6E', width: '60px', flexShrink: 0 }}>Address</span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-dark)', lineHeight: 1.4 }}>{selectedOrder.user_address || '—'}</span>
                </div>
              </div>
            </div>

            {/* Item Summary */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid #E8E0D8' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Item Summary</div>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <AssetImage src={selectedOrder.item_image} alt="" style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #E8E0D8' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '2px' }}>{selectedOrder.item_name}</div>
                  {selectedOrder.item_variation && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{displayVariation(selectedOrder.item_variation)}</div>}
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>Qty: {selectedOrder.item_qty}</div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--accent-color)', fontSize: '1rem' }}>{'\u20B1'}{(selectedOrder.item_price * selectedOrder.item_qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              {selectedOrder.order_type === 'customized' && <a href={`/artisan-dashboard/requests?requestId=${encodeURIComponent(selectedOrder.design_request_id || '')}`} style={{ display: 'inline-block', marginTop: '12px', color: '#823E0B', fontSize: '0.82rem', fontWeight: 700 }}>View custom design request</a>}
              {(selectedOrder.shipping_fee > 0 || selectedOrder.delivery_option === 'courier') && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #E8E0D8' }}>
                  <span style={{ fontSize: '0.82rem', color: '#8C7B6E' }}>Shipping Fee{selectedOrder.delivery_option === 'pickup' ? ' (Pickup)' : ''}</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)' }}>{'\u20B1'}{(selectedOrder.shipping_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            {/* Status Row */}
            <div style={{ padding: '20px 28px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#8C7B6E', marginBottom: '4px' }}>Payment</div>
                {(() => {
                  const bg = selectedOrder.payment_status === 'Paid' ? '#E8F5E9' : selectedOrder.payment_status === 'Cancelled' ? '#FFEBEE' : '#FFF3E0';
                  const color = selectedOrder.payment_status === 'Paid' ? '#2E7D32' : selectedOrder.payment_status === 'Cancelled' ? '#C62828' : '#E65100';
                  return <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, background: bg, color: color }}>{selectedOrder.payment_status}</span>;
                })()}
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#8C7B6E', marginBottom: '4px' }}>Delivery</div>
                {(() => {
                  const styles: Record<string, { bg: string; color: string }> = {
                    pending: { bg: '#FFF3E0', color: '#E65100' }, preparing: { bg: '#E3F2FD', color: '#1565C0' },
                    shipped: { bg: '#F3E5F5', color: '#6A1B9A' }, delivered: { bg: '#E8F5E9', color: '#2E7D32' },
                    completed: { bg: '#E8F5E9', color: '#1B5E20' }, cancelled: { bg: '#FFEBEE', color: '#C62828' },
                  };
                  const s = styles[selectedOrder.delivery_status] || styles.pending;
                  return <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, background: s.bg, color: s.color, textTransform: 'capitalize' }}>{selectedOrder.delivery_status}</span>;
                })()}
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#8C7B6E', marginBottom: '4px' }}>Order Total</div>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark)' }}>{'\u20B1'}{selectedOrder.total?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '—'}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedOrder(null)}
                style={{ padding: '10px 24px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Close</button>
              {selectedOrder.delivery_status !== 'cancelled' && (selectedOrder.payment_status === 'Cancelled' || selectedOrder.status === 'cancelled') && (
                <button onClick={() => setCancelTarget(selectedOrder)}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#d32f2f', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel Order</button>
              )}
              {selectedOrder.delivery_status === 'pending' && selectedOrder.payment_status !== 'Cancelled' && selectedOrder.status !== 'cancelled' && (
                <button disabled={busyOrders.has(selectedOrder.id) || (selectedOrder.order_type === 'customized' && selectedOrder.payment_status !== 'Paid')} onClick={() => { void advanceDeliveryStatus(selectedOrder, 'preparing'); }}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: selectedOrder.order_type === 'customized' && selectedOrder.payment_status !== 'Paid' ? 'not-allowed' : 'pointer', opacity: selectedOrder.order_type === 'customized' && selectedOrder.payment_status !== 'Paid' ? 0.55 : 1 }}>{selectedOrder.order_type === 'customized' && selectedOrder.payment_status !== 'Paid' ? 'Awaiting Payment' : selectedOrder.order_type === 'customized' ? 'Start Production' : 'Confirm Order'}</button>
              )}
              {selectedOrder.delivery_status === 'preparing' && (
                <button disabled={busyOrders.has(selectedOrder.id)} onClick={() => { void advanceDeliveryStatus(selectedOrder, 'shipped'); }}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#6A1B9A', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Hand to Courier</button>
              )}
              {selectedOrder.delivery_status === 'shipped' && (
                <button disabled={busyOrders.has(selectedOrder.id)} onClick={() => { void advanceDeliveryStatus(selectedOrder, 'delivered'); }}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#2E7D32', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Mark Delivered</button>
              )}
              {selectedOrder.delivery_status === 'delivered' && (
                <button disabled={busyOrders.has(selectedOrder.id)} onClick={() => { void advanceDeliveryStatus(selectedOrder, 'completed'); }}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#1565C0', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Complete</button>
              )}
            </div>
          </div>
        </div>
      )}
      <SellerConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this order?"
        description={updateError || 'This marks the order cancelled and notifies the buyer.'}
        confirmLabel="Cancel order"
        busy={cancelling}
        onClose={() => { if (!cancelling) setCancelTarget(null); }}
        onConfirm={() => {
          if (!cancelTarget || cancelling || pendingOrders.current.has(cancelTarget.id)) return;
          setCancelling(true);
          void changeStatus(cancelTarget, 'cancelled').then(saved => { if (saved) { setCancelTarget(null); setSelectedOrder(null); } }).finally(() => setCancelling(false));
        }}
      />
    </div>
  );
}
