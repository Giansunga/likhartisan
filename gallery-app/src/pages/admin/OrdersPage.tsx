import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { exportToCsv } from '../../lib/csvExport';
import type { Order, OrderActivityLog } from '../../types';

const INPUT_STYLE: React.CSSProperties = {
  padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
  fontSize: '0.88rem', outline: 'none', background: '#fff',
  color: 'var(--text-dark)', cursor: 'pointer',
};
const SEARCH_INPUT: React.CSSProperties = {
  ...INPUT_STYLE, paddingLeft: '38px', width: '100%', boxSizing: 'border-box' as const, cursor: 'text',
};
const CARD_BG = '#fff';
const CARD_BORDER = '1px solid #E9DED2';
const CARD_RADIUS = '14px';
const CARD_SHADOW = '0 2px 8px rgba(147,67,8,0.04)';

function formatCurrency(v: number) {
  return '\u20B1' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatShortDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(d);
}

const PAYMENT_STATUS_OPTIONS = ['pending', 'paid', 'failed', 'refunded'] as const;
const ORDER_STATUS_OPTIONS = ['pending', 'paid', 'completed', 'cancelled', 'refunded'] as const;
const DELIVERY_STATUS_OPTIONS = ['pending', 'preparing', 'shipped', 'delivered', 'completed'] as const;

function paymentBadge(status?: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending:  { bg: '#FFF3E0', color: '#E65100', label: 'Pending' },
    paid:     { bg: '#E8F5E9', color: '#2E7D32', label: 'Paid' },
    failed:   { bg: '#FFEBEE', color: '#C62828', label: 'Failed' },
    refunded: { bg: '#F3E5F5', color: '#6A1B9A', label: 'Refunded' },
  };
  const s = map[status || 'pending'] || map.pending;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function orderBadge(status?: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending:   { bg: '#FFF3E0', color: '#E65100', label: 'Pending' },
    paid:      { bg: '#E8F5E9', color: '#2E7D32', label: 'Paid' },
    completed: { bg: '#E8F5E9', color: '#1B5E20', label: 'Completed' },
    cancelled: { bg: '#FFEBEE', color: '#C62828', label: 'Cancelled' },
    refunded:  { bg: '#F3E5F5', color: '#6A1B9A', label: 'Refunded' },
  };
  const s = map[status || 'pending'] || map.pending;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function deliveryBadge(status?: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending:   { bg: '#FFF3E0', color: '#E65100', label: 'Pending' },
    preparing: { bg: '#E3F2FD', color: '#1565C0', label: 'Preparing' },
    shipped:   { bg: '#F3E5F5', color: '#6A1B9A', label: 'Shipped' },
    delivered: { bg: '#E8F5E9', color: '#2E7D32', label: 'Delivered' },
    completed: { bg: '#E8F5E9', color: '#1B5E20', label: 'Completed' },
    cancelled: { bg: '#FFEBEE', color: '#C62828', label: 'Cancelled' },
  };
  const s = map[status || 'pending'] || map.pending;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function displayVariation(v?: string) {
  if (!v) return null;
  try {
    const parsed = JSON.parse(v);
    const parts = [parsed.dimensions, parsed.height, parsed.openingDiameter].filter(Boolean);
    return parts.length > 0 ? parts.join(' × ') : v;
  } catch { return v; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ORDERS PAGE — MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function OrdersPage() {
  const { user } = useAuth();

  /* ── state ── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterDelivery, setFilterDelivery] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<'created_at' | 'total'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'payment' | 'delivery' | 'activity' | 'problems'>('overview');
  const [activityLogs, setActivityLogs] = useState<OrderActivityLog[]>([]);
  const [sellerNotes, setSellerNotes] = useState('');
  const [buyerNotes, setBuyerNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // confirm dialogs
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; confirmLabel?: string; confirmDanger?: boolean; action: () => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // payment management
  const [verifyModal, setVerifyModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [rejectModal, setRejectModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [rejectReason, setRejectReason] = useState('');
  const [refundModal, setRefundModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  // cancellation
  const [cancelModal, setCancelModal] = useState<{ open: boolean; order: Order | null; action: 'approve' | 'reject' }>({ open: false, order: null, action: 'approve' });
  const [cancelNote, setCancelNote] = useState('');

  // problem/dispute
  const [problemModal, setProblemModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [problemType, setProblemType] = useState('');
  const [problemNotes, setProblemNotes] = useState('');
  const [resolveModal, setResolveModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [resolution, setResolution] = useState('');

  /* ── fetch ── */
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders((data || []) as Order[]);
    } catch (e: any) {
      console.error('Failed to fetch orders:', e);
      showToast('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  /* ── realtime ── */
  useEffect(() => {
    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        setOrders(prev => [payload.new as Order, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new as Order : o));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (payload) => {
        setOrders(prev => prev.filter(o => o.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ── realtime activity log ── */
  useEffect(() => {
    if (!selectedOrder) return;
    const channel = supabase
      .channel(`order-activity:${selectedOrder.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_activity_log', filter: `order_id=eq.${selectedOrder.id}` }, (payload) => {
        setActivityLogs(prev => [payload.new as OrderActivityLog, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedOrder?.id]);

  /* ── toast helper ── */
  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  /* ── helper: get user display name ── */
  function getActorName(): string {
    return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Admin';
  }

  /* ── update order status ── */
  async function updateOrderStatus(orderId: string, newStatus: string, reason?: string) {
    setStatusUpdating(true);
    try {
      const { data: current } = await supabase.from('orders').select('status, payment_status, delivery_status').eq('id', orderId).single();
      const updates: Record<string, any> = {};
      if (newStatus === 'cancelled') {
        updates.status = 'cancelled';
        updates.delivery_status = 'cancelled';
        updates.cancel_reason = reason || null;
        updates.cancelled_by = user?.id || null;
      } else if (['paid', 'completed', 'refunded'].includes(newStatus)) {
        updates.status = newStatus;
      }
      const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
      if (error) throw error;

      // log
      await supabase.rpc('log_order_change', {
        p_order_id: orderId,
        p_previous_status: current?.status,
        p_new_status: updates.status || current?.status,
        p_previous_payment_status: current?.payment_status,
        p_new_payment_status: updates.payment_status || current?.payment_status,
        p_previous_delivery_status: current?.delivery_status,
        p_new_delivery_status: updates.delivery_status || current?.delivery_status,
        p_action_type: 'status_update',
        p_actor_id: user?.id,
        p_actor_name: getActorName(),
        p_actor_role: 'admin',
        p_reason: reason || null,
      });

      showToast(`Order status updated to ${updates.status || newStatus}`, 'success');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, ...updates } : prev);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Failed to update status', 'error');
    } finally {
      setStatusUpdating(false);
    }
  }

  /* ── update delivery status ── */
  async function updateDeliveryStatus(orderId: string, newDelivery: string, reason?: string) {
    setStatusUpdating(true);
    try {
      const { data: current } = await supabase.from('orders').select('status, payment_status, delivery_status').eq('id', orderId).single();
      const updates: Record<string, any> = { delivery_status: newDelivery };
      if (newDelivery === 'completed') updates.status = 'completed';
      if (newDelivery === 'cancelled') {
        updates.status = 'cancelled';
        updates.cancelled_by = user?.id || null;
      }
      const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
      if (error) throw error;

      await supabase.rpc('log_order_change', {
        p_order_id: orderId,
        p_previous_status: current?.status,
        p_new_status: updates.status || current?.status,
        p_previous_payment_status: current?.payment_status,
        p_new_payment_status: current?.payment_status,
        p_previous_delivery_status: current?.delivery_status,
        p_new_delivery_status: newDelivery,
        p_action_type: 'delivery_update',
        p_actor_id: user?.id,
        p_actor_name: getActorName(),
        p_actor_role: 'admin',
        p_reason: reason || null,
      });

      showToast(`Delivery status updated to ${newDelivery}`, 'success');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, ...updates } : prev);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Failed to update delivery', 'error');
    } finally {
      setStatusUpdating(false);
    }
  }

  /* ── save notes ── */
  async function saveNotes(orderId: string) {
    setNotesSaving(true);
    try {
      const { error } = await supabase.from('orders').update({
        seller_notes: sellerNotes,
        customer_notes: buyerNotes,
      }).eq('id', orderId);
      if (error) throw error;
      showToast('Notes saved', 'success');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, seller_notes: sellerNotes, customer_notes: buyerNotes } : o));
    } catch (e: any) {
      showToast(e.message || 'Failed to save notes', 'error');
    } finally {
      setNotesSaving(false);
    }
  }

  /* ── payment verify / reject ── */
  async function verifyPayment(orderId: string) {
    try {
      const { error } = await supabase.from('orders').update({
        payment_status: 'paid',
        status: 'paid',
        payment_verified_at: new Date().toISOString(),
        payment_verified_by: user?.id,
      }).eq('id', orderId);
      if (error) throw error;

      const { data: current } = await supabase.from('orders').select('status, payment_status, delivery_status').eq('id', orderId).single();
      await supabase.rpc('log_order_change', {
        p_order_id: orderId, p_previous_status: current?.status, p_new_status: 'paid',
        p_previous_payment_status: current?.payment_status, p_new_payment_status: 'paid',
        p_previous_delivery_status: current?.delivery_status, p_new_delivery_status: current?.delivery_status,
        p_action_type: 'payment_verified', p_actor_id: user?.id, p_actor_name: getActorName(),
        p_actor_role: 'admin', p_reason: null,
      });

      showToast('Payment verified', 'success');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_status: 'paid', status: 'paid' } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, payment_status: 'paid', status: 'paid' } : prev);
      setVerifyModal({ open: false, order: null });
    } catch (e: any) {
      showToast(e.message || 'Failed to verify payment', 'error');
    }
  }

  async function rejectPayment(orderId: string, reason: string) {
    try {
      const { error } = await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', orderId);
      if (error) throw error;

      const { data: current } = await supabase.from('orders').select('status, payment_status, delivery_status').eq('id', orderId).single();
      await supabase.rpc('log_order_change', {
        p_order_id: orderId, p_previous_status: current?.status, p_new_status: current?.status,
        p_previous_payment_status: current?.payment_status, p_new_payment_status: 'failed',
        p_previous_delivery_status: current?.delivery_status, p_new_delivery_status: current?.delivery_status,
        p_action_type: 'payment_rejected', p_actor_id: user?.id, p_actor_name: getActorName(),
        p_actor_role: 'admin', p_reason: reason,
      });

      showToast('Payment rejected', 'success');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_status: 'failed' } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, payment_status: 'failed' } : prev);
      setRejectModal({ open: false, order: null });
      setRejectReason('');
    } catch (e: any) {
      showToast(e.message || 'Failed to reject payment', 'error');
    }
  }

  /* ── refund ── */
  async function processRefund(orderId: string, amount: number, reason: string) {
    try {
      const { error } = await supabase.from('orders').update({
        refund_status: 'refunded', refund_amount: amount, status: 'refunded',
      }).eq('id', orderId);
      if (error) throw error;

      const { data: current } = await supabase.from('orders').select('status, payment_status, delivery_status').eq('id', orderId).single();
      await supabase.rpc('log_order_change', {
        p_order_id: orderId, p_previous_status: current?.status, p_new_status: 'refunded',
        p_previous_payment_status: current?.payment_status, p_new_payment_status: 'refunded',
        p_previous_delivery_status: current?.delivery_status, p_new_delivery_status: current?.delivery_status,
        p_action_type: 'refund_processed', p_actor_id: user?.id, p_actor_name: getActorName(),
        p_actor_role: 'admin', p_reason: reason,
      });

      showToast(`Refund of ${formatCurrency(amount)} processed`, 'success');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, refund_status: 'refunded', refund_amount: amount, status: 'refunded' } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, refund_status: 'refunded', refund_amount: amount, status: 'refunded' } : prev);
      setRefundModal({ open: false, order: null });
      setRefundAmount('');
      setRefundReason('');
    } catch (e: any) {
      showToast(e.message || 'Failed to process refund', 'error');
    }
  }

  /* ── problem/dispute ── */
  async function flagProblem(orderId: string, type: string, notes: string) {
    try {
      const { error } = await supabase.from('orders').update({
        is_problematic: true, problem_type: type, problem_notes: notes,
      }).eq('id', orderId);
      if (error) throw error;

      const { data: current } = await supabase.from('orders').select('status, payment_status, delivery_status').eq('id', orderId).single();
      await supabase.rpc('log_order_change', {
        p_order_id: orderId, p_previous_status: current?.status, p_new_status: current?.status,
        p_previous_payment_status: current?.payment_status, p_new_payment_status: current?.payment_status,
        p_previous_delivery_status: current?.delivery_status, p_new_delivery_status: current?.delivery_status,
        p_action_type: 'problem_flagged', p_actor_id: user?.id, p_actor_name: getActorName(),
        p_actor_role: 'admin', p_reason: `${type}: ${notes}`,
      });

      showToast('Order flagged as problematic', 'success');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, is_problematic: true, problem_type: type, problem_notes: notes } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, is_problematic: true, problem_type: type, problem_notes: notes } : prev);
      setProblemModal({ open: false, order: null });
      setProblemType('');
      setProblemNotes('');
    } catch (e: any) {
      showToast(e.message || 'Failed to flag problem', 'error');
    }
  }

  async function resolveProblem(orderId: string, res: string) {
    try {
      const { error } = await supabase.from('orders').update({
        is_problematic: false, problem_resolution: res,
      }).eq('id', orderId);
      if (error) throw error;

      const { data: current } = await supabase.from('orders').select('status, payment_status, delivery_status').eq('id', orderId).single();
      await supabase.rpc('log_order_change', {
        p_order_id: orderId, p_previous_status: current?.status, p_new_status: current?.status,
        p_previous_payment_status: current?.payment_status, p_new_payment_status: current?.payment_status,
        p_previous_delivery_status: current?.delivery_status, p_new_delivery_status: current?.delivery_status,
        p_action_type: 'problem_resolved', p_actor_id: user?.id, p_actor_name: getActorName(),
        p_actor_role: 'admin', p_reason: res,
      });

      showToast('Problem resolved', 'success');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, is_problematic: false, problem_resolution: res } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, is_problematic: false, problem_resolution: res } : prev);
      setResolveModal({ open: false, order: null });
      setResolution('');
    } catch (e: any) {
      showToast(e.message || 'Failed to resolve problem', 'error');
    }
  }

  /* ── toggle investigation ── */
  async function toggleInvestigation(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const newVal = !order.flagged_for_investigation;
    await supabase.from('orders').update({ flagged_for_investigation: newVal }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, flagged_for_investigation: newVal } : o));
    if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, flagged_for_investigation: newVal } : prev);
    showToast(newVal ? 'Order flagged for investigation' : 'Investigation flag removed', 'success');
  }

  /* ── save seller notes (quick) ── */
  async function saveSellerNotes(orderId: string, notes: string) {
    await supabase.from('orders').update({ seller_notes: notes }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, seller_notes: notes } : o));
  }

  /* ── load activity logs for selected order ── */
  useEffect(() => {
    if (!selectedOrder) { setActivityLogs([]); return; }
    (async () => {
      const { data } = await supabase
        .from('order_activity_log')
        .select('*')
        .eq('order_id', selectedOrder.id)
        .order('created_at', { ascending: false });
      setActivityLogs((data || []) as OrderActivityLog[]);
    })();
  }, [selectedOrder?.id]);

  /* ── sync notes when selecting order ── */
  useEffect(() => {
    if (!selectedOrder) return;
    setSellerNotes(selectedOrder.seller_notes || '');
    setBuyerNotes(selectedOrder.customer_notes || '');
  }, [selectedOrder?.id]);

  /* ── filtering ── */
  const filtered = useMemo(() => {
    let list = [...orders];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(o =>
        o.id.toLowerCase().includes(s) ||
        o.user_name?.toLowerCase().includes(s) ||
        o.email?.toLowerCase().includes(s) ||
        (o.items || []).some(i => i.product_name?.toLowerCase().includes(s) || i.shop_name?.toLowerCase().includes(s))
      );
    }
    if (filterStatus !== 'all') list = list.filter(o => o.status === filterStatus);
    if (filterPayment !== 'all') list = list.filter(o => o.payment_status === filterPayment);
    if (filterDelivery !== 'all') list = list.filter(o => o.delivery_status === filterDelivery);
    if (filterType !== 'all') list = list.filter(o => (o.order_type || 'product') === filterType);
    if (dateFrom) list = list.filter(o => new Date(o.created_at) >= new Date(dateFrom));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      list = list.filter(o => new Date(o.created_at) <= end);
    }
    list.sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      const cmp = sortField === 'total' ? (va as number) - (vb as number) : new Date(va as string).getTime() - new Date(vb as string).getTime();
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return list;
  }, [orders, search, filterStatus, filterPayment, filterDelivery, filterType, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── summary stats ── */
  const stats = useMemo(() => {
    const total = orders.length;
    const pendingConfirmation = orders.filter(o => o.status === 'pending' && o.delivery_status === 'pending').length;
    const preparing = orders.filter(o => o.delivery_status === 'preparing').length;
    const readyForDelivery = orders.filter(o => o.delivery_status === 'shipped').length;
    const shipped = orders.filter(o => o.delivery_status === 'shipped').length;
    const delivered = orders.filter(o => o.delivery_status === 'delivered').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;
    const paymentIssues = orders.filter(o => o.payment_status === 'failed').length;
    return { total, pendingConfirmation, preparing, readyForDelivery, shipped, delivered, completed, cancelled, paymentIssues };
  }, [orders]);

  /* ── export ── */
  function handleExport() {
    exportToCsv(filtered, [
      { key: 'id', label: 'Order ID', transform: (v: string) => v.slice(0, 8).toUpperCase() },
      { key: 'user_name', label: 'Customer' },
      { key: 'email', label: 'Email' },
      { key: 'items', label: 'Products', transform: (v: any[]) => (v || []).map((i: any) => `${i.product_name} (x${i.qty})`).join('; ') },
      { key: 'subtotal', label: 'Subtotal', transform: (v: number) => `₱${(v || 0).toFixed(2)}` },
      { key: 'shipping_fee', label: 'Shipping', transform: (v: number) => `₱${(v || 0).toFixed(2)}` },
      { key: 'total', label: 'Total', transform: (v: number) => `₱${(v || 0).toFixed(2)}` },
      { key: 'payment_status', label: 'Payment Status', transform: (v: string) => v || 'pending' },
      { key: 'status', label: 'Order Status' },
      { key: 'delivery_status', label: 'Delivery Status' },
      { key: 'delivery_option', label: 'Delivery Option' },
      { key: 'order_type', label: 'Order Type', transform: (v: string) => v || 'product' },
      { key: 'created_at', label: 'Order Date', transform: (v: string) => formatDate(v) },
    ], 'orders-export');
    showToast('Exported successfully', 'success');
  }

  /* ── open order detail ── */
  function openDetail(order: Order) {
    setSelectedOrder(order);
    setDetailTab('overview');
  }

  /* ── render ── */
  return (
    <div style={{ position: 'relative' }}>
      {/* ── TOAST ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: '20px', right: '20px', zIndex: 3000,
              padding: '14px 24px', borderRadius: '12px', fontWeight: 600, fontSize: '0.88rem',
              color: toast.type === 'success' ? '#fff' : '#fff',
              background: toast.type === 'success' ? '#2E7D32' : '#C62828',
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            }}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px', fontFamily: 'var(--font-serif)' }}>
          Orders Management
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#8C7B6E' }}>Monitor and manage all customer orders across every shop.</p>
      </motion.div>

      {/* ── SUMMARY CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Orders', value: stats.total },
          { label: 'Pending', value: stats.pendingConfirmation },
          { label: 'Preparing', value: stats.preparing },
          { label: 'Shipped', value: stats.shipped },
          { label: 'Delivered', value: stats.delivered },
          { label: 'Completed', value: stats.completed },
          { label: 'Cancelled', value: stats.cancelled },
          { label: 'Payment Issues', value: stats.paymentIssues },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(147,67,8,0.1)' }}
            style={{ background: '#fff', border: '1px solid #E9DED2', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(147,67,8,0.04)' }}
          >
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1F1F1F', marginBottom: '4px', lineHeight: 1 }}>
              {stat.value}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#77716B', fontWeight: 500 }}>{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── SEARCH, FILTERS, EXPORT ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }}
        style={{ background: CARD_BG, border: CARD_BORDER, borderRadius: CARD_RADIUS, padding: '20px 24px', marginBottom: '20px', boxShadow: CARD_SHADOW }}
      >
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* search */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '200px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#929090" strokeWidth="2.5" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', height: '15px', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Search order, customer, product..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={SEARCH_INPUT} />
          </div>

          {/* order status */}
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={INPUT_STYLE}>
            <option value="all">All Status</option>
            {ORDER_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>

          {/* payment status */}
          <select value={filterPayment} onChange={e => { setFilterPayment(e.target.value); setPage(1); }} style={INPUT_STYLE}>
            <option value="all">All Payment</option>
            {PAYMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>

          {/* delivery status */}
          <select value={filterDelivery} onChange={e => { setFilterDelivery(e.target.value); setPage(1); }} style={INPUT_STYLE}>
            <option value="all">All Delivery</option>
            {DELIVERY_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>

          {/* order type */}
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={INPUT_STYLE}>
            <option value="all">All Types</option>
            <option value="product">Regular Product</option>
            <option value="customized">Customized Pottery</option>
          </select>

          {/* date range */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: '#8C7B6E', flexShrink: 0 }}>From</span>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={INPUT_STYLE} />
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: '#8C7B6E', flexShrink: 0 }}>To</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={INPUT_STYLE} />
          </div>

          {/* sort */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select value={sortField} onChange={e => setSortField(e.target.value as 'created_at' | 'total')} style={INPUT_STYLE}>
              <option value="created_at">Sort by Date</option>
              <option value="total">Sort by Total</option>
            </select>
            <button
              onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              style={{ ...INPUT_STYLE, width: '38px', textAlign: 'center', padding: '10px', cursor: 'pointer', fontSize: '1rem' }}
              title={sortDir === 'desc' ? 'Descending' : 'Ascending'}
            >
              {sortDir === 'desc' ? '\u2193' : '\u2191'}
            </button>
          </div>

          {/* export */}
          <button
            onClick={handleExport}
            style={{
              ...INPUT_STYLE, background: 'var(--primary-color)', color: '#fff', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* active filter count + clear */}
        {(filterStatus !== 'all' || filterPayment !== 'all' || filterDelivery !== 'all' || filterType !== 'all' || dateFrom || dateTo || search) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #F0EBE4' }}>
            <span style={{ fontSize: '0.78rem', color: '#8C7B6E' }}>
              Showing {filtered.length} of {orders.length} orders
            </span>
            <button
              onClick={() => { setSearch(''); setFilterStatus('all'); setFilterPayment('all'); setFilterDelivery('all'); setFilterType('all'); setDateFrom(''); setDateTo(''); setPage(1); }}
              style={{ fontSize: '0.78rem', color: 'var(--primary-color)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Clear all
            </button>
          </div>
        )}
      </motion.div>

      {/* ── ORDERS TABLE ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.4 }}
        style={{ background: CARD_BG, border: CARD_BORDER, borderRadius: CARD_RADIUS, overflow: 'hidden', boxShadow: CARD_SHADOW }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E8E0D8', textAlign: 'left' }}>
              {[
                { label: 'Order #', key: 'id', width: '90px' },
                { label: 'Customer', key: 'user_name', width: '140px' },
                { label: 'Products', key: 'items', width: '200px' },
                { label: 'Total', key: 'total', width: '100px', sortable: true },
                { label: 'Payment', key: 'payment_status', width: '90px' },
                { label: 'Status', key: 'status', width: '100px' },
                { label: 'Delivery', key: 'delivery_status', width: '100px' },
                { label: 'Date', key: 'created_at', width: '130px', sortable: true },
                { label: 'Actions', key: 'actions', width: '110px' },
              ].map(col => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => {
                    if (sortField === col.key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                    else { setSortField(col.key as any); setSortDir('desc'); }
                  } : undefined}
                  style={{
                    padding: '14px 16px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.72rem',
                    textTransform: 'uppercase', letterSpacing: '0.5px', width: col.width, minWidth: col.width,
                    cursor: col.sortable ? 'pointer' : 'default', userSelect: 'none',
                  }}
                >
                  {col.label}
                  {col.sortable && sortField === col.key && (
                    <span style={{ marginLeft: '4px' }}>{sortDir === 'desc' ? '\u2193' : '\u2191'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f0eb' }}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j} style={{ padding: '14px 16px' }}>
                      <div className="shimmer-skeleton" style={{ height: j === 0 ? '16px' : '20px', width: j === 1 ? '100%' : '80px', borderRadius: j <= 1 ? '4px' : '12px' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '60px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '4px' }}>No orders found</p>
                  <p style={{ fontSize: '0.85rem', color: '#A89688' }}>Try adjusting your filters or date range.</p>
                </td>
              </tr>
            ) : paged.map(order => (
              <tr
                key={order.id}
                onClick={() => openDetail(order)}
                style={{ borderBottom: '1px solid #f5f0eb', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FDF8F4')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-dark)', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                  #{order.id.slice(0, 8).toUpperCase()}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-dark)' }}>{order.user_name || 'Customer'}</p>
                  <p style={{ fontSize: '0.75rem', color: '#A89688' }}>{order.email || order.buyer_email || ''}</p>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  {(order.items || []).slice(0, 2).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: idx === 0 && order.items.length > 1 ? '4px' : 0 }}>
                      {item.image && <img src={item.image} alt="" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                          {item.product_name || 'Product'}
                        </p>
                        {item.variation && <p style={{ fontSize: '0.7rem', color: '#A89688' }}>{displayVariation(item.variation) || item.variation}</p>}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#8C7B6E', flexShrink: 0 }}>x{item.qty}</span>
                    </div>
                  ))}
                  {(order.items || []).length > 2 && (
                    <p style={{ fontSize: '0.72rem', color: '#A89688', marginTop: '2px' }}>+{order.items.length - 2} more</p>
                  )}
                </td>
                <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-dark)' }}>
                  {formatCurrency(order.total || 0)}
                </td>
                <td style={{ padding: '14px 16px' }}>{paymentBadge(order.payment_status)}</td>
                <td style={{ padding: '14px 16px' }}>{orderBadge(order.status)}</td>
                <td style={{ padding: '14px 16px' }}>{deliveryBadge(order.delivery_status)}</td>
                <td style={{ padding: '14px 16px', fontSize: '0.8rem', color: '#8C7B6E' }}>
                  {formatShortDate(order.created_at)}<br />
                  <span style={{ fontSize: '0.72rem', color: '#A89688' }}>{formatTime(order.created_at)}</span>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {order.is_problematic && (
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#C62828', flexShrink: 0 }} title="Has a problem" />
                    )}
                    {order.flagged_for_investigation && (
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#E65100', flexShrink: 0 }} title="Under investigation" />
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); openDetail(order); }}
                      style={{
                        padding: '5px 12px', border: '1.5px solid #E8E0D8', borderRadius: '6px', background: '#fff',
                        color: 'var(--text-dark)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-color)'; e.currentTarget.style.color = 'var(--primary-color)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E0D8'; e.currentTarget.style.color = 'var(--text-dark)'; }}
                    >
                      View
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid #f5f0eb' }}>
            <span style={{ fontSize: '0.8rem', color: '#8C7B6E' }}>
              Page {page} of {totalPages} ({filtered.length} orders)
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button disabled={page <= 1} onClick={() => setPage(1)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #E8E0D8', background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', fontSize: '0.8rem', opacity: page <= 1 ? 0.4 : 1 }}>
                {'\u00AB'}
              </button>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #E8E0D8', background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', fontSize: '0.8rem', opacity: page <= 1 ? 0.4 : 1 }}>
                {'\u2039'}
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    style={{
                      padding: '6px 12px', borderRadius: '6px', border: pageNum === page ? '1.5px solid var(--primary-color)' : '1px solid #E8E0D8',
                      background: pageNum === page ? 'var(--primary-color)' : '#fff', color: pageNum === page ? '#fff' : 'var(--text-dark)',
                      fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #E8E0D8', background: '#fff', cursor: page >= totalPages ? 'default' : 'pointer', fontSize: '0.8rem', opacity: page >= totalPages ? 0.4 : 1 }}>
                {'\u203A'}
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #E8E0D8', background: '#fff', cursor: page >= totalPages ? 'default' : 'pointer', fontSize: '0.8rem', opacity: page >= totalPages ? 0.4 : 1 }}>
                {'\u00BB'}
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════
          ORDER DETAIL DRAWER
          ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedOrder && (
          <>
            {/* overlay */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1500 }}
              onClick={() => setSelectedOrder(null)}
            />
            {/* drawer */}
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              style={{
                position: 'fixed', top: 0, right: 0, width: '680px', maxWidth: '95vw', height: '100vh',
                background: '#FAFAF7', zIndex: 1600, display: 'flex', flexDirection: 'column',
                boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              }}
            >
              {/* drawer header */}
              <div style={{ padding: '20px 28px', background: '#fff', borderBottom: '1px solid #EDE8E2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-dark)', fontFamily: 'var(--font-serif)', margin: 0 }}>
                    Order #{selectedOrder.id.slice(0, 8).toUpperCase()}
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: '#8C7B6E', marginTop: '2px' }}>
                    {formatDate(selectedOrder.created_at)} &middot; {selectedOrder.order_type === 'customized' ? 'Customized Pottery' : 'Regular Product'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => toggleInvestigation(selectedOrder.id)}
                    title={selectedOrder.flagged_for_investigation ? 'Remove investigation flag' : 'Flag for investigation'}
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: selectedOrder.flagged_for_investigation ? '#FFF3E0' : '#fff',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
                    }}
                  >
                    {selectedOrder.flagged_for_investigation ? '!' : '?'}
                  </button>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8C7B6E', fontSize: '1rem' }}
                  >
                    &#x2715;
                  </button>
                </div>
              </div>

              {/* tab nav */}
              <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #EDE8E2', background: '#fff', flexShrink: 0, padding: '0 28px' }}>
                {([
                  { key: 'overview', label: 'Overview' },
                  { key: 'payment', label: 'Payment' },
                  { key: 'delivery', label: 'Delivery' },
                  { key: 'activity', label: 'Activity' },
                  { key: 'problems', label: 'Problems' },
                ] as const).map(tab => {
                  const active = detailTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setDetailTab(tab.key)}
                      style={{
                        padding: '12px 18px', background: 'none', border: 'none', borderBottom: active ? '2px solid var(--primary-color)' : '2px solid transparent',
                        color: active ? 'var(--primary-color)' : '#8C7B6E', fontWeight: active ? 600 : 500, fontSize: '0.85rem',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* drawer body — scrollable */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

                {/* ── OVERVIEW TAB ── */}
                {detailTab === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* customer info */}
                    <SectionCard title="Customer Information">
                      <InfoRow label="Name" value={selectedOrder.user_name || '--'} />
                      <InfoRow label="Phone" value={selectedOrder.user_phone || '--'} />
                      <InfoRow label="Email" value={selectedOrder.email || selectedOrder.buyer_email || '--'} />
                      <InfoRow label="Address" value={selectedOrder.user_address || '--'} />
                    </SectionCard>

                    {/* shop & artisan */}
                    <SectionCard title="Shop & Artisan">
                      {(selectedOrder.items || []).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: idx < (selectedOrder.items || []).length - 1 ? '10px' : 0 }}>
                          {item.image && <img src={item.image} alt="" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #E8E0D8' }} />}
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>{item.product_name || 'Product'}</p>
                            <p style={{ fontSize: '0.75rem', color: '#8C7B6E' }}>{item.shop_name || 'Shop'} &middot; Qty: {item.qty}</p>
                          </div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>{formatCurrency((item.price || 0) * (item.qty || 1))}</span>
                        </div>
                      ))}
                    </SectionCard>

                    {/* customized design preview (if applicable) */}
                    {selectedOrder.order_type === 'customized' && selectedOrder.items?.[0]?.variation && (
                      <SectionCard title="Customized Design">
                        <InfoRow label="Finish / Color / Decor" value={displayVariation(selectedOrder.items[0].variation) || selectedOrder.items[0].variation || '--'} />
                      </SectionCard>
                    )}

                    {/* totals */}
                    <SectionCard title="Order Totals">
                      <InfoRow label="Subtotal" value={formatCurrency(selectedOrder.subtotal || 0)} />
                      <InfoRow label="Delivery Fee" value={formatCurrency(selectedOrder.shipping_fee || 0)} />
                      <div style={{ borderTop: '1px solid #E8E0D8', marginTop: '8px', paddingTop: '8px' }}>
                        <InfoRow label="Total" value={formatCurrency(selectedOrder.total || 0)} bold />
                      </div>
                    </SectionCard>

                    {/* status badges */}
                    <SectionCard title="Status">
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <div><p style={{ fontSize: '0.72rem', color: '#8C7B6E', marginBottom: '4px' }}>Payment</p>{paymentBadge(selectedOrder.payment_status)}</div>
                        <div><p style={{ fontSize: '0.72rem', color: '#8C7B6E', marginBottom: '4px' }}>Order</p>{orderBadge(selectedOrder.status)}</div>
                        <div><p style={{ fontSize: '0.72rem', color: '#8C7B6E', marginBottom: '4px' }}>Delivery</p>{deliveryBadge(selectedOrder.delivery_status)}</div>
                      </div>
                    </SectionCard>

                    {/* timeline */}
                    <SectionCard title="Order Timeline">
                      <OrderTimeline order={selectedOrder} />
                    </SectionCard>

                    {/* notes */}
                    <SectionCard title="Notes">
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: '6px' }}>Seller Notes</label>
                        <textarea
                          value={sellerNotes}
                          onChange={e => setSellerNotes(e.target.value)}
                          placeholder="Internal notes visible to seller..."
                          rows={2}
                          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                        />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: '6px' }}>Customer Notes</label>
                        <textarea
                          value={buyerNotes}
                          onChange={e => setBuyerNotes(e.target.value)}
                          placeholder="Notes visible to customer..."
                          rows={2}
                          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => saveNotes(selectedOrder.id)}
                          disabled={notesSaving}
                          style={{
                            padding: '8px 18px', borderRadius: '8px', border: 'none',
                            background: 'var(--primary-color)', color: '#fff', fontWeight: 600,
                            fontSize: '0.82rem', cursor: notesSaving ? 'default' : 'pointer',
                            opacity: notesSaving ? 0.6 : 1,
                          }}
                        >
                          {notesSaving ? 'Saving...' : 'Save Notes'}
                        </button>
                      </div>
                    </SectionCard>

                    {/* admin quick actions */}
                    <SectionCard title="Admin Actions">
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {selectedOrder.status === 'pending' && (
                          <ActionBtn color="#2E7D32" onClick={() => setConfirm({ open: true, title: 'Confirm Order', message: 'Mark this order as confirmed (paid)?', confirmLabel: 'Confirm', action: () => updateOrderStatus(selectedOrder.id, 'paid') })}>
                            Confirm Order
                          </ActionBtn>
                        )}
                        {selectedOrder.delivery_status === 'pending' && selectedOrder.status !== 'cancelled' && (
                          <ActionBtn color="#1565C0" onClick={() => setConfirm({ open: true, title: 'Start Preparing', message: 'Move this order to preparing status?', confirmLabel: 'Start', action: () => updateDeliveryStatus(selectedOrder.id, 'preparing') })}>
                            Start Preparing
                          </ActionBtn>
                        )}
                        {selectedOrder.delivery_status === 'preparing' && (
                          <ActionBtn color="#6A1B9A" onClick={() => setConfirm({ open: true, title: 'Ship Order', message: 'Mark this order as shipped?', confirmLabel: 'Ship', action: () => updateDeliveryStatus(selectedOrder.id, 'shipped') })}>
                            Ship / Hand to Courier
                          </ActionBtn>
                        )}
                        {selectedOrder.delivery_status === 'shipped' && (
                          <ActionBtn color="#2E7D32" onClick={() => setConfirm({ open: true, title: 'Mark Delivered', message: 'Confirm this order has been delivered?', confirmLabel: 'Delivered', action: () => updateDeliveryStatus(selectedOrder.id, 'delivered') })}>
                            Mark Delivered
                          </ActionBtn>
                        )}
                        {selectedOrder.delivery_status === 'delivered' && (
                          <ActionBtn color="#1B5E20" onClick={() => setConfirm({ open: true, title: 'Complete Order', message: 'Mark this order as fully completed?', confirmLabel: 'Complete', action: () => updateDeliveryStatus(selectedOrder.id, 'completed') })}>
                            Complete
                          </ActionBtn>
                        )}
                        {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'completed' && selectedOrder.status !== 'refunded' && (
                          <ActionBtn color="#C62828" onClick={() => setConfirm({ open: true, title: 'Cancel Order', message: 'Are you sure? This cannot be undone. Provide a reason below.', confirmLabel: 'Cancel Order', confirmDanger: true, action: () => updateOrderStatus(selectedOrder.id, 'cancelled', 'Cancelled by admin') })}>
                            Cancel Order
                          </ActionBtn>
                        )}
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* ── PAYMENT TAB ── */}
                {detailTab === 'payment' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    <SectionCard title="Payment Information">
                      <InfoRow label="Payment Status" value={<>{paymentBadge(selectedOrder.payment_status)} <span style={{ marginLeft: '8px', fontSize: '0.82rem', color: '#8C7B6E' }}>{selectedOrder.payment_status || 'pending'}</span></>} />
                      <InfoRow label="Payment Reference" value={selectedOrder.payment_reference || '--'} />
                      <InfoRow label="Checkout Session" value={selectedOrder.checkout_session_id ? `${selectedOrder.checkout_session_id.slice(0, 20)}...` : '--'} />
                      <InfoRow label="Order Total" value={formatCurrency(selectedOrder.total || 0)} bold />
                    </SectionCard>

                    {/* payment proof */}
                    <SectionCard title="Payment Proof (QR)">
                      {selectedOrder.payment_proof_url ? (
                        <div style={{ textAlign: 'center' }}>
                          <img src={selectedOrder.payment_proof_url} alt="Payment Proof" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '10px', border: '1px solid #E8E0D8', objectFit: 'contain' }} />
                          <p style={{ fontSize: '0.78rem', color: '#8C7B6E', marginTop: '8px' }}>Uploaded by customer</p>
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.88rem', color: '#A89688', textAlign: 'center', padding: '20px 0' }}>No payment proof uploaded.</p>
                      )}
                    </SectionCard>

                    {/* payment actions */}
                    <SectionCard title="Payment Actions">
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {selectedOrder.payment_status === 'pending' && (
                          <>
                            <ActionBtn color="#2E7D32" onClick={() => setVerifyModal({ open: true, order: selectedOrder })}>
                              Verify Payment
                            </ActionBtn>
                            <ActionBtn color="#C62828" onClick={() => setRejectModal({ open: true, order: selectedOrder })}>
                              Reject Payment
                            </ActionBtn>
                          </>
                        )}
                        {selectedOrder.payment_status === 'paid' && (
                          <ActionBtn color="#6A1B9A" onClick={() => setRefundModal({ open: true, order: selectedOrder })}>
                            Process Refund
                          </ActionBtn>
                        )}
                      </div>
                    </SectionCard>

                    {/* refund info */}
                    {(selectedOrder.refund_status || selectedOrder.refund_amount) && (
                      <SectionCard title="Refund Details">
                        <InfoRow label="Refund Status" value={selectedOrder.refund_status || '--'} />
                        {selectedOrder.refund_amount != null && <InfoRow label="Refund Amount" value={formatCurrency(selectedOrder.refund_amount)} />}
                      </SectionCard>
                    )}
                  </div>
                )}

                {/* ── DELIVERY TAB ── */}
                {detailTab === 'delivery' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    <SectionCard title="Delivery Information">
                      <InfoRow label="Delivery Method" value={selectedOrder.delivery_option === 'courier' ? 'Courier Delivery' : 'Pickup'} />
                      <InfoRow label="Pickup Shop" value={selectedOrder.items?.[0]?.shop_name || '--'} />
                      <InfoRow label="Delivery Address" value={selectedOrder.user_address || '--'} />
                      <InfoRow label="Computed Fee" value={formatCurrency(selectedOrder.shipping_fee || 0)} />
                    </SectionCard>

                    <SectionCard title="Delivery Provider">
                      <InfoRow label="Provider" value={selectedOrder.delivery_provider || 'Lalamove'} />
                      <InfoRow label="Quote ID" value={selectedOrder.lalamove_quote_id || '--'} />
                      <InfoRow label="Tracking" value={
                        selectedOrder.tracking_number ? (
                          <span>
                            {selectedOrder.tracking_number}
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', background: '#FFF3E0', color: '#E65100', marginLeft: '8px', fontWeight: 600 }}>
                              Simulated
                            </span>
                          </span>
                        ) : <span style={{ color: '#A89688' }}>No tracking info</span>
                      } />
                      <InfoRow label="Estimated Delivery" value={selectedOrder.estimated_delivery || '--'} />
                      <InfoRow label="Delivery Notes" value={selectedOrder.delivery_notes || '--'} />
                    </SectionCard>

                    {/* delivery status update */}
                    <SectionCard title="Update Delivery Status">
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {selectedOrder.delivery_status === 'pending' && selectedOrder.status !== 'cancelled' && (
                          <ActionBtn color="#1565C0" onClick={() => setConfirm({ open: true, title: 'Start Preparing', message: 'Move this order to preparing status?', confirmLabel: 'Start', action: () => updateDeliveryStatus(selectedOrder.id, 'preparing') })}>
                            Start Preparing
                          </ActionBtn>
                        )}
                        {selectedOrder.delivery_status === 'preparing' && (
                          <ActionBtn color="#6A1B9A" onClick={() => setConfirm({ open: true, title: 'Ship Order', message: 'Mark this order as shipped?', confirmLabel: 'Ship', action: () => updateDeliveryStatus(selectedOrder.id, 'shipped') })}>
                            Ship / Hand to Courier
                          </ActionBtn>
                        )}
                        {selectedOrder.delivery_status === 'shipped' && (
                          <ActionBtn color="#2E7D32" onClick={() => setConfirm({ open: true, title: 'Mark Delivered', message: 'Confirm this order has been delivered?', confirmLabel: 'Delivered', action: () => updateDeliveryStatus(selectedOrder.id, 'delivered') })}>
                            Mark Delivered
                          </ActionBtn>
                        )}
                        {selectedOrder.delivery_status === 'delivered' && (
                          <ActionBtn color="#1B5E20" onClick={() => setConfirm({ open: true, title: 'Complete Order', message: 'Mark this order as fully completed?', confirmLabel: 'Complete', action: () => updateDeliveryStatus(selectedOrder.id, 'completed') })}>
                            Complete
                          </ActionBtn>
                        )}
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* ── ACTIVITY TAB ── */}
                {detailTab === 'activity' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <SectionCard title="Activity Log">
                      {activityLogs.length === 0 ? (
                        <p style={{ fontSize: '0.88rem', color: '#A89688', textAlign: 'center', padding: '20px 0' }}>No activity recorded yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                          {activityLogs.map(log => (
                            <div key={log.id} style={{ display: 'flex', gap: '14px', padding: '12px 0', borderBottom: '1px solid #F0EBE4' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#FDF5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary-color)' }}>
                                  {log.action_type.includes('payment') ? 'P' : log.action_type.includes('delivery') ? 'D' : log.action_type.includes('refund') ? 'R' : log.action_type.includes('problem') ? '!' : 'A'}
                                </span>
                              </div>
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>
                                  {log.action_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                </p>
                                {log.reason && <p style={{ fontSize: '0.78rem', color: '#8C7B6E', marginTop: '2px' }}>Reason: {log.reason}</p>}
                                {(log.previous_status || log.new_status) && log.previous_status !== log.new_status && (
                                  <p style={{ fontSize: '0.78rem', color: '#8C7B6E', marginTop: '2px' }}>
                                    Status: {log.previous_status || '--'} → {log.new_status || '--'}
                                  </p>
                                )}
                                {(log.previous_delivery_status || log.new_delivery_status) && log.previous_delivery_status !== log.new_delivery_status && (
                                  <p style={{ fontSize: '0.78rem', color: '#8C7B6E', marginTop: '2px' }}>
                                    Delivery: {log.previous_delivery_status || '--'} → {log.new_delivery_status || '--'}
                                  </p>
                                )}
                                <p style={{ fontSize: '0.72rem', color: '#A89688', marginTop: '4px' }}>
                                  by {log.actor_name || 'Unknown'} ({log.actor_role || 'system'}) &middot; {formatDate(log.created_at)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  </div>
                )}

                {/* ── PROBLEMS TAB ── */}
                {detailTab === 'problems' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* existing problem */}
                    {selectedOrder.is_problematic ? (
                      <SectionCard title="Current Problem" accent="#C62828">
                        <InfoRow label="Problem Type" value={selectedOrder.problem_type || '--'} />
                        <InfoRow label="Notes" value={selectedOrder.problem_notes || '--'} />
                        {selectedOrder.problem_resolution && (
                          <InfoRow label="Resolution" value={selectedOrder.problem_resolution} />
                        )}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                          <ActionBtn color="#2E7D32" onClick={() => setResolveModal({ open: true, order: selectedOrder })}>
                            Resolve Problem
                          </ActionBtn>
                          <ActionBtn color="#E65100" onClick={() => toggleInvestigation(selectedOrder.id)}>
                            {selectedOrder.flagged_for_investigation ? 'Remove Flag' : 'Flag for Investigation'}
                          </ActionBtn>
                        </div>
                      </SectionCard>
                    ) : selectedOrder.problem_resolution ? (
                      <SectionCard title="Resolved Problem">
                        <InfoRow label="Previous Issue" value={selectedOrder.problem_type || '--'} />
                        <InfoRow label="Resolution" value={selectedOrder.problem_resolution} />
                      </SectionCard>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>No problems reported</p>
                        <p style={{ fontSize: '0.85rem', color: '#A89688', marginBottom: '16px' }}>Flag this order if there is an issue that needs attention.</p>
                        <ActionBtn color="#C62828" onClick={() => setProblemModal({ open: true, order: selectedOrder })}>
                          Flag as Problematic
                        </ActionBtn>
                      </div>
                    )}

                    {/* cancel request */}
                    {selectedOrder.cancellation_approved === null && selectedOrder.cancel_reason && (
                      <SectionCard title="Cancellation Request" accent="#E65100">
                        <InfoRow label="Reason" value={selectedOrder.cancel_reason} />
                        <p style={{ fontSize: '0.78rem', color: '#A89688', marginTop: '4px' }}>Awaiting admin review</p>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <ActionBtn color="#2E7D32" onClick={() => setConfirm({ open: true, title: 'Approve Cancellation', message: 'Approve this cancellation request?', confirmLabel: 'Approve', action: async () => {
                            await supabase.from('orders').update({ cancellation_approved: true, status: 'cancelled', delivery_status: 'cancelled', cancellation_reviewed_by: user?.id }).eq('id', selectedOrder.id);
                            setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, cancellation_approved: true, status: 'cancelled', delivery_status: 'cancelled' } : o));
                            setSelectedOrder(prev => prev ? { ...prev, cancellation_approved: true, status: 'cancelled', delivery_status: 'cancelled' } : prev);
                            showToast('Cancellation approved', 'success');
                          } })}>
                            Approve
                          </ActionBtn>
                          <ActionBtn color="#C62828" onClick={() => setConfirm({ open: true, title: 'Reject Cancellation', message: 'Reject this cancellation request?', confirmLabel: 'Reject', confirmDanger: true, action: async () => {
                            await supabase.from('orders').update({ cancellation_approved: false, cancellation_reviewed_by: user?.id }).eq('id', selectedOrder.id);
                            setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, cancellation_approved: false } : o));
                            setSelectedOrder(prev => prev ? { ...prev, cancellation_approved: false } : prev);
                            showToast('Cancellation rejected', 'success');
                          } })}>
                            Reject
                          </ActionBtn>
                        </div>
                      </SectionCard>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════
          MODALS
          ═══════════════════════════════════════════════════════════════════ */}

      {/* confirm dialog */}
      {confirm && (
        <ConfirmDialog
          open={confirm.open}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          confirmDanger={confirm.confirmDanger}
          onConfirm={() => { confirm.action(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* verify payment modal */}
      {verifyModal.open && verifyModal.order && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setVerifyModal({ open: false, order: null })}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '420px', maxWidth: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', padding: '28px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0, fontFamily: 'var(--font-serif)' }}>Verify Payment</h3>
            <p style={{ fontSize: '0.9rem', color: '#8C7B6E', margin: '12px 0 0' }}>
              Confirm that the payment of <strong>{formatCurrency(verifyModal.order.total)}</strong> for order #{verifyModal.order.id.slice(0, 8).toUpperCase()} has been received?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button onClick={() => setVerifyModal({ open: false, order: null })} style={{ padding: '10px 24px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => verifyPayment(verifyModal.order!.id)} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#2E7D32', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Verify</button>
            </div>
          </div>
        </div>
      )}

      {/* reject payment modal */}
      {rejectModal.open && rejectModal.order && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => { setRejectModal({ open: false, order: null }); setRejectReason(''); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '420px', maxWidth: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', padding: '28px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0, fontFamily: 'var(--font-serif)' }}>Reject Payment</h3>
            <p style={{ fontSize: '0.9rem', color: '#8C7B6E', margin: '12px 0 12px' }}>Provide a reason for rejecting this payment.</p>
            <textarea
              value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => { setRejectModal({ open: false, order: null }); setRejectReason(''); }} style={{ padding: '10px 24px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => rejectPayment(rejectModal.order!.id, rejectReason)} disabled={!rejectReason.trim()} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#C62828', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: rejectReason.trim() ? 'pointer' : 'default', opacity: rejectReason.trim() ? 1 : 0.5 }}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* refund modal */}
      {refundModal.open && refundModal.order && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => { setRefundModal({ open: false, order: null }); setRefundAmount(''); setRefundReason(''); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '440px', maxWidth: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', padding: '28px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0, fontFamily: 'var(--font-serif)' }}>Process Refund</h3>
            <p style={{ fontSize: '0.9rem', color: '#8C7B6E', margin: '12px 0 16px' }}>
              Original amount: <strong>{formatCurrency(refundModal.order.total)}</strong>
            </p>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: '4px' }}>Refund Amount (₱)</label>
              <input
                type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                placeholder="0.00"
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' as const }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: '4px' }}>Reason</label>
              <textarea
                value={refundReason} onChange={e => setRefundReason(e.target.value)}
                placeholder="Reason for refund..."
                rows={3}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setRefundModal({ open: false, order: null }); setRefundAmount(''); setRefundReason(''); }} style={{ padding: '10px 24px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => processRefund(refundModal.order!.id, Number(refundAmount), refundReason)}
                disabled={!refundAmount || !refundReason.trim()}
                style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#6A1B9A', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: refundAmount && refundReason.trim() ? 'pointer' : 'default', opacity: refundAmount && refundReason.trim() ? 1 : 0.5 }}
              >
                Process Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* flag problem modal */}
      {problemModal.open && problemModal.order && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => { setProblemModal({ open: false, order: null }); setProblemType(''); setProblemNotes(''); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '440px', maxWidth: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', padding: '28px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0, fontFamily: 'var(--font-serif)' }}>Flag Order as Problematic</h3>
            <p style={{ fontSize: '0.9rem', color: '#8C7B6E', margin: '12px 0 16px' }}>Select the type of problem and provide details.</p>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: '4px' }}>Problem Type</label>
              <select value={problemType} onChange={e => setProblemType(e.target.value)} style={{ ...INPUT_STYLE, width: '100%', boxSizing: 'border-box' as const }}>
                <option value="">Select type...</option>
                <option value="seller_not_confirmed">Seller did not confirm</option>
                <option value="payment_unverified">Payment could not be verified</option>
                <option value="product_unavailable">Product was unavailable</option>
                <option value="delivery_delayed">Delivery was delayed</option>
                <option value="damaged_item">Customer reported damaged item</option>
                <option value="disagreement">Customer and seller disagreement</option>
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: '4px' }}>Notes</label>
              <textarea
                value={problemNotes} onChange={e => setProblemNotes(e.target.value)}
                placeholder="Describe the issue..."
                rows={3}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setProblemModal({ open: false, order: null }); setProblemType(''); setProblemNotes(''); }} style={{ padding: '10px 24px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => flagProblem(problemModal.order!.id, problemType, problemNotes)}
                disabled={!problemType || !problemNotes.trim()}
                style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#C62828', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: problemType && problemNotes.trim() ? 'pointer' : 'default', opacity: problemType && problemNotes.trim() ? 1 : 0.5 }}
              >
                Flag Problem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* resolve problem modal */}
      {resolveModal.open && resolveModal.order && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => { setResolveModal({ open: false, order: null }); setResolution(''); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '420px', maxWidth: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', padding: '28px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0, fontFamily: 'var(--font-serif)' }}>Resolve Problem</h3>
            <p style={{ fontSize: '0.9rem', color: '#8C7B6E', margin: '12px 0 12px' }}>Describe how this problem was resolved.</p>
            <textarea
              value={resolution} onChange={e => setResolution(e.target.value)}
              placeholder="Resolution details..."
              rows={3}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => { setResolveModal({ open: false, order: null }); setResolution(''); }} style={{ padding: '10px 24px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => resolveProblem(resolveModal.order!.id, resolution)} disabled={!resolution.trim()} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#2E7D32', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: resolution.trim() ? 'pointer' : 'default', opacity: resolution.trim() ? 1 : 0.5 }}>Resolve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionCard({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #EDE8E2', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EBE4', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {accent && <span style={{ width: '4px', height: '18px', borderRadius: '2px', background: accent }} />}
        <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)', fontFamily: 'var(--font-serif)', margin: 0 }}>{title}</h3>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '6px 0', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.8rem', color: '#8C7B6E', width: '120px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.88rem', color: 'var(--text-dark)', fontWeight: bold ? 600 : 400, flex: 1 }}>{value || '--'}</span>
    </div>
  );
}

function ActionBtn({ color, onClick, children }: { color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 18px', borderRadius: '8px', border: 'none',
        background: color, color: '#fff', fontWeight: 600, fontSize: '0.82rem',
        cursor: 'pointer', transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ORDER TIMELINE
   ═══════════════════════════════════════════════════════════════════════════ */

function OrderTimeline({ order }: { order: Order }) {
  const steps = [
    { key: 'placed', label: 'Order Placed', active: true, date: order.created_at },
    { key: 'payment', label: 'Payment Submitted', active: !!order.payment_status && order.payment_status !== 'pending', date: order.payment_verified_at },
    { key: 'verified', label: 'Payment Verified', active: order.payment_status === 'paid', date: order.payment_verified_at },
    { key: 'confirmed', label: 'Confirmed by Shop', active: order.status === 'paid' && order.delivery_status !== 'pending', date: order.payment_verified_at },
    { key: 'preparing', label: 'Preparing', active: order.delivery_status === 'preparing' || order.delivery_status === 'shipped' || order.delivery_status === 'delivered' || order.delivery_status === 'completed' },
    { key: 'ready', label: 'Ready for Delivery', active: order.delivery_status === 'shipped' || order.delivery_status === 'delivered' || order.delivery_status === 'completed' },
    { key: 'shipped', label: 'Shipped', active: order.delivery_status === 'shipped' || order.delivery_status === 'delivered' || order.delivery_status === 'completed' },
    { key: 'delivered', label: 'Delivered', active: order.delivery_status === 'delivered' || order.delivery_status === 'completed' },
  ];

  const isCancelled = order.status === 'cancelled';

  return (
    <div style={{ padding: '8px 0' }}>
      {steps.map((step, i) => (
        <div key={step.key} style={{ display: 'flex', gap: '14px', position: 'relative' }}>
          {/* line */}
          {i < steps.length - 1 && (
            <div style={{ position: 'absolute', left: '10px', top: '24px', width: '2px', height: 'calc(100% - 8px)', background: step.active && steps[i + 1]?.active ? 'var(--primary-color)' : '#E8E0D8' }} />
          )}
          {/* dot */}
          <div style={{
            width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
            background: step.active ? 'var(--primary-color)' : '#E8E0D8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: '2px',
          }}>
            {step.active && <span style={{ color: '#fff', fontSize: '0.6rem', fontWeight: 700 }}>{'\u2713'}</span>}
          </div>
          {/* label */}
          <div style={{ paddingBottom: i < steps.length - 1 ? '16px' : 0 }}>
            <p style={{ fontSize: '0.82rem', fontWeight: step.active ? 600 : 400, color: step.active ? 'var(--text-dark)' : '#A89688', margin: 0 }}>
              {step.label}
            </p>
            {step.active && step.date && (
              <p style={{ fontSize: '0.72rem', color: '#A89688', margin: '2px 0 0' }}>{formatDate(step.date)}</p>
            )}
          </div>
        </div>
      ))}

      {/* cancelled branch */}
      {isCancelled && (
        <div style={{ display: 'flex', gap: '14px', position: 'relative', marginTop: '8px' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#C62828', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
            <span style={{ color: '#fff', fontSize: '0.6rem', fontWeight: 700 }}>{'\u2715'}</span>
          </div>
          <div>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#C62828', margin: 0 }}>Cancelled</p>
            {order.cancel_reason && <p style={{ fontSize: '0.75rem', color: '#8C7B6E', margin: '2px 0 0' }}>Reason: {order.cancel_reason}</p>}
          </div>
        </div>
      )}
    </div>
  );
}