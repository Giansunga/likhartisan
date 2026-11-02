import AssetImage from '../../components/AssetImage';
import { Popup } from '../../components/Popup';
import { notify } from '../../lib/popups';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import {
  ExceptionSummary,
  OrderDetailDrawer,
  OrdersList,
  OrdersToolbar,
  QueueTabs,
  StatusBadge,
  type DetailTab,
  type FilterChip,
  type QueueKey,
} from '../../components/admin/orders/OrderManagementUI';
import { formatCurrency, matchesQueue } from '../../components/admin/orders/orderManagementUtils';
import { exportToCsv } from '../../lib/csvExport';
import { purchaseApi } from '../../lib/purchaseApi';
import { getErrorMessage } from '../../lib/portalErrors';
import type { Order } from '../../types';
import type { ActivityLogRecord } from '../../types/activity';
import { formatActivityLabel } from '../../lib/activityLog';
import type { ReturnRequest } from '../../types/purchases';
import '../../components/admin/orders/orders.css';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';

const INPUT_STYLE: React.CSSProperties = {
  padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
  fontSize: '0.88rem', outline: 'none', background: '#fff',
  color: 'var(--text-dark)', cursor: 'pointer',
};
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function paymentBadge(status?: string) {
  return <StatusBadge kind="payment" status={status} />;
}

function orderBadge(status?: string) {
  return <StatusBadge kind="order" status={status} />;
}

function deliveryBadge(status?: string) {
  return <StatusBadge kind="delivery" status={status} />;
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
  const [searchParams] = useSearchParams();
  const deepLinkOrderId = searchParams.get('orderId');

  /* ── state ── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [activeQueue, setActiveQueue] = useState<QueueKey>('all');
  const [exceptionFilter, setExceptionFilter] = useState<'all' | 'problematic' | 'investigation'>('all');
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState<'created_at' | 'total'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
  const [returnRequest, setReturnRequest] = useState<ReturnRequest | null>(null);
  const [notesDraft, setNotesDraft] = useState<{ orderId: string; seller: string; buyer: string } | null>(null);
  const sellerNotes = notesDraft?.orderId === selectedOrder?.id ? notesDraft?.seller || '' : selectedOrder?.seller_notes || '';
  const buyerNotes = notesDraft?.orderId === selectedOrder?.id ? notesDraft?.buyer || '' : selectedOrder?.customer_notes || '';
  const [notesSaving, setNotesSaving] = useState(false);
  const [mutatingOrderId, setMutatingOrderId] = useState<string | null>(null);
  const [activityError, setActivityError] = useState('');
  const [activityLoading, setActivityLoading] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [returnRetry, setReturnRetry] = useState(0);
  const pendingOrders = useRef(new Set<string>());
  const orderRequest = useRef(0);
  const activityRequest = useRef(0);
  const mutationVersion = useRef(0);
  const appliedDeepLink = useRef<string | null>(null);
  const selectedOrderId = selectedOrder?.id;
  const invalidateOrderRequests = useCallback(() => { ++orderRequest.current; }, []);
  const invalidateActivityRequests = useCallback(() => { ++activityRequest.current; }, []);

  // confirm dialogs
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; confirmLabel?: string; confirmDanger?: boolean; action: () => Promise<boolean> } | null>(null);

  // payment management
  const [verifyModal, setVerifyModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [rejectModal, setRejectModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [rejectReason, setRejectReason] = useState('');
  const [refundModal, setRefundModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  // problem/dispute
  const [problemModal, setProblemModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [problemType, setProblemType] = useState('');
  const [problemNotes, setProblemNotes] = useState('');
  const [resolveModal, setResolveModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [resolution, setResolution] = useState('');

  /* ── fetch ── */
  const fetchOrders = useCallback(async () => {
    const request = ++orderRequest.current;
    const version = mutationVersion.current;
    setLoading(true);
    setLoadError('');
    try {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (request !== orderRequest.current || version !== mutationVersion.current) return;
      const nextOrders = (data || []) as Order[];
      const requestedDeepLink = deepLinkOrderId !== appliedDeepLink.current ? deepLinkOrderId : null;
      appliedDeepLink.current = deepLinkOrderId;
      setOrders(nextOrders);
      setSelectedOrder(current => {
        const requestedId = requestedDeepLink || current?.id;
        return requestedId ? nextOrders.find(order => order.id === requestedId) || null : null;
      });
    } catch (error) {
      if (request === orderRequest.current && version === mutationVersion.current) {
        setLoadError(getErrorMessage(error, 'Check your connection and try again.'));
      }
    } finally {
      if (request === orderRequest.current) setLoading(false);
    }
  }, [deepLinkOrderId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void fetchOrders(); });
    return () => { active = false; invalidateOrderRequests(); };
  }, [fetchOrders, invalidateOrderRequests]);
  usePortalRealtimeRefresh(['orders'], fetchOrders);

  function showToast(message: string, type: 'success' | 'error') {
    notify(type, message);
  }

  // A successful HTTP request can still update zero rows under RLS or after a
  // deletion. Only reconcile the screen with a row actually returned by storage.
  async function saveOrder(orderId: string, updates: Partial<Order>): Promise<Order | null> {
    if (pendingOrders.current.has(orderId)) return null;
    pendingOrders.current.add(orderId);
    setMutatingOrderId(orderId);
    ++mutationVersion.current;
    try {
      const { data, error } = await supabase.from('orders').update(updates).eq('id', orderId).select('*').maybeSingle();
      if (error) throw error;
      if (!data || data.id !== orderId) throw new Error('Order could not be saved. It may have changed or you may no longer have access. Reload and try again.');
      const saved = data as Order;
      ++mutationVersion.current;
      setOrders(current => current.map(order => order.id === orderId ? saved : order));
      setSelectedOrder(current => current?.id === orderId ? saved : current);
      return saved;
    } catch (error) {
      showToast(getErrorMessage(error, 'Order could not be saved. Please try again.'), 'error');
      return null;
    } finally {
      pendingOrders.current.delete(orderId);
      setMutatingOrderId(current => current === orderId ? null : current);
    }
  }

  async function updateOrderStatus(orderId: string, newStatus: string, reason?: string) {
    const updates: Partial<Order> = newStatus === 'cancelled'
      ? { status: 'cancelled', delivery_status: 'cancelled', cancel_reason: reason || '', cancelled_by: user?.id }
      : { status: newStatus };
    if (!await saveOrder(orderId, updates)) return false;
    showToast(`Order status updated to ${newStatus}`, 'success');
    return true;
  }

  async function updateDeliveryStatus(orderId: string, newDelivery: string) {
    const updates: Partial<Order> = { delivery_status: newDelivery };
    if (newDelivery === 'completed' || newDelivery === 'cancelled') updates.status = newDelivery;
    if (newDelivery === 'cancelled') updates.cancelled_by = user?.id;
    if (!await saveOrder(orderId, updates)) return false;
    showToast(`Delivery status updated to ${newDelivery}`, 'success');
    return true;
  }

  async function saveNotes(orderId: string) {
    if (pendingOrders.current.has(orderId)) return;
    setNotesSaving(true);
    try {
      if (!await saveOrder(orderId, { seller_notes: sellerNotes, customer_notes: buyerNotes })) return;
      setNotesDraft(current => current?.orderId === orderId && current.seller === sellerNotes && current.buyer === buyerNotes ? null : current);
      showToast('Notes saved', 'success');
    } finally { setNotesSaving(false); }
  }

  async function verifyPayment(orderId: string) {
    if (!await saveOrder(orderId, { payment_status: 'paid', status: 'paid', payment_verified_at: new Date().toISOString(), payment_verified_by: user?.id })) return;
    showToast('Payment verified', 'success');
    setVerifyModal({ open: false, order: null });
  }

  async function rejectPayment(orderId: string) {
    if (!await saveOrder(orderId, { payment_status: 'failed' })) return;
    showToast('Payment rejected', 'success');
    setRejectModal({ open: false, order: null });
    setRejectReason('');
  }

  async function processRefund(orderId: string, amount: number) {
    const order = orders.find(item => item.id === orderId);
    if (!Number.isFinite(amount) || amount <= 0 || !order || amount > order.total) {
      showToast('Enter a refund amount greater than zero and no more than the order total.', 'error');
      return;
    }
    if (!await saveOrder(orderId, { refund_status: 'refunded', refund_amount: amount, status: 'refunded' })) return;
    showToast(`Refund of ${formatCurrency(amount)} processed`, 'success');
    setRefundModal({ open: false, order: null });
    setRefundAmount('');
    setRefundReason('');
  }

  async function flagProblem(orderId: string, type: string, notes: string) {
    if (!await saveOrder(orderId, { is_problematic: true, problem_type: type, problem_notes: notes })) return;
    showToast('Order flagged as problematic', 'success');
    setProblemModal({ open: false, order: null });
    setProblemType('');
    setProblemNotes('');
  }

  async function resolveProblem(orderId: string, resolutionText: string) {
    if (!await saveOrder(orderId, { is_problematic: false, problem_resolution: resolutionText })) return;
    showToast('Problem resolved', 'success');
    setResolveModal({ open: false, order: null });
    setResolution('');
  }

  async function toggleInvestigation(orderId: string) {
    const order = orders.find(item => item.id === orderId);
    if (!order) return;
    const saved = await saveOrder(orderId, { flagged_for_investigation: !order.flagged_for_investigation });
    if (saved) showToast(saved.flagged_for_investigation ? 'Order flagged for investigation' : 'Investigation flag removed', 'success');
  }

  async function reviewCancellation(orderId: string, approved: boolean) {
    const updates: Partial<Order> = { cancellation_approved: approved, cancellation_reviewed_by: user?.id };
    if (approved) { updates.status = 'cancelled'; updates.delivery_status = 'cancelled'; }
    if (!await saveOrder(orderId, updates)) return false;
    showToast(approved ? 'Cancellation approved' : 'Cancellation rejected', 'success');
    return true;
  }

  const fetchActivityLogs = useCallback(async () => {
    const request = ++activityRequest.current;
    setActivityError('');
    setActivityLogs([]);
    if (!selectedOrderId) { setActivityLoading(false); return; }
    setActivityLoading(true);
    try {
      const { data, error } = await supabase.from('activity_log').select('*').eq('entity_type', 'orders').eq('entity_id', selectedOrderId).order('occurred_at', { ascending: false });
      if (error) throw error;
      if (request === activityRequest.current) setActivityLogs((data || []) as ActivityLogRecord[]);
    } catch (error) {
      if (request === activityRequest.current) setActivityError(getErrorMessage(error, 'Activity could not be loaded.'));
    } finally {
      if (request === activityRequest.current) setActivityLoading(false);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void fetchActivityLogs(); });
    return () => { active = false; invalidateActivityRequests(); };
  }, [fetchActivityLogs, invalidateActivityRequests]);
  usePortalRealtimeRefresh(['activity_log'], fetchActivityLogs);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!active) return;
      setReturnRequest(null);
      setReturnError('');
      if (!selectedOrderId) return;
      void purchaseApi<{ returnRequest: ReturnRequest | null }>(`/admin/returns/order/${selectedOrderId}`, {}, controller.signal)
        .then(result => { if (active) setReturnRequest(result.returnRequest); })
        .catch(error => { if (active) setReturnError(getErrorMessage(error, 'Return request could not be loaded.')); });
    });
    return () => { active = false; controller.abort(); };
  }, [selectedOrderId, returnRetry]);

  async function updateReturn(status: ReturnRequest['status']) {
    if (!returnRequest || !selectedOrderId || pendingOrders.current.has(selectedOrderId)) return;
    const orderId = selectedOrderId;
    const requestId = returnRequest.id;
    pendingOrders.current.add(orderId);
    setMutatingOrderId(orderId);
    try {
      const updated = await purchaseApi<ReturnRequest>(`/admin/returns/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (!updated || updated.id !== requestId) throw new Error('Return request could not be saved. Reload and try again.');
      setReturnRequest(current => current?.id === requestId ? updated : current);
      showToast(`Return marked ${updated.status.replaceAll('_', ' ')}`, 'success');
    } catch (error) { showToast(getErrorMessage(error, 'Return request could not be saved.'), 'error'); }
    finally {
      pendingOrders.current.delete(orderId);
      setMutatingOrderId(current => current === orderId ? null : current);
    }
  }

  /* ── filtering ── */
  const filtered = useMemo(() => {
    let list = [...orders];
    list = list.filter(order => matchesQueue(order, activeQueue));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(o =>
        o.id.toLowerCase().includes(s) ||
        o.user_name?.toLowerCase().includes(s) ||
        o.email?.toLowerCase().includes(s) ||
        (o.items || []).some(i => i.product_name?.toLowerCase().includes(s) || i.shop_name?.toLowerCase().includes(s))
      );
    }
    if (filterPayment !== 'all') list = list.filter(o => o.payment_status === filterPayment);
    if (exceptionFilter === 'problematic') list = list.filter(o => o.is_problematic);
    if (exceptionFilter === 'investigation') list = list.filter(o => o.flagged_for_investigation);
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
  }, [orders, activeQueue, search, filterPayment, filterType, exceptionFilter, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const currentPage = Math.max(1, Math.min(page, totalPages || 1));
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  /* ── summary stats ── */
  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter(o => o.delivery_status === 'pending' && !['cancelled', 'completed', 'refunded'].includes(o.status)).length,
    preparing: orders.filter(o => o.delivery_status === 'preparing' && o.status !== 'cancelled').length,
    shipped: orders.filter(o => o.delivery_status === 'shipped' && o.status !== 'cancelled').length,
    delivered: orders.filter(o => o.delivery_status === 'delivered' && o.status !== 'cancelled').length,
    completed: orders.filter(o => o.status === 'completed' || o.delivery_status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    paymentIssues: orders.filter(o => o.payment_status === 'failed').length,
    problematic: orders.filter(o => o.is_problematic).length,
    investigations: orders.filter(o => o.flagged_for_investigation).length,
  }), [orders]);

  /* ── export ── */
  function handleExport() {
    exportToCsv(filtered, [
      { key: 'id', label: 'Order ID', transform: (v: string) => v.slice(0, 8).toUpperCase() },
      { key: 'user_name', label: 'Customer' },
      { key: 'email', label: 'Email' },
      { key: 'items', label: 'Products', transform: (v: Order['items']) => (v || []).map((i) => `${i.product_name} (x${i.qty})`).join('; ') },
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

  const closeDetail = useCallback(() => setSelectedOrder(null), []);

  function selectQueue(queue: QueueKey) {
    setActiveQueue(queue);
    setPage(1);
  }

  function clearAllFilters() {
    setSearch('');
    setActiveQueue('all');
    setExceptionFilter('all');
    setFilterPayment('all');
    setFilterType('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  function handleSort(field: 'created_at' | 'total') {
    if (sortField === field) setSortDir(direction => direction === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const queueTabs = [
    { key: 'all' as const, label: 'All orders', count: stats.total },
    { key: 'pending' as const, label: 'Pending', count: stats.pending },
    { key: 'preparing' as const, label: 'Preparing', count: stats.preparing },
    { key: 'shipped' as const, label: 'Shipped', count: stats.shipped },
    { key: 'delivered' as const, label: 'Delivered', count: stats.delivered },
    { key: 'completed' as const, label: 'Completed', count: stats.completed },
    { key: 'cancelled' as const, label: 'Cancelled', count: stats.cancelled },
  ];

  const filterChips: FilterChip[] = [];
  if (search) filterChips.push({ key: 'search', label: `Search: ${search}`, onRemove: () => { setSearch(''); setPage(1); } });
  if (filterPayment !== 'all') filterChips.push({ key: 'payment', label: `Payment: ${filterPayment}`, onRemove: () => { setFilterPayment('all'); setPage(1); } });
  if (filterType !== 'all') filterChips.push({ key: 'type', label: filterType === 'customized' ? 'Customized pottery' : 'Regular product', onRemove: () => { setFilterType('all'); setPage(1); } });
  if (dateFrom) filterChips.push({ key: 'from', label: `From: ${dateFrom}`, onRemove: () => { setDateFrom(''); setPage(1); } });
  if (dateTo) filterChips.push({ key: 'to', label: `To: ${dateTo}`, onRemove: () => { setDateTo(''); setPage(1); } });
  if (exceptionFilter !== 'all') filterChips.push({ key: 'exception', label: exceptionFilter === 'problematic' ? 'Problem orders' : 'Under investigation', onRemove: () => { setExceptionFilter('all'); setPage(1); } });

  /* ── render ── */
  return (
    <div className="orders-page" aria-busy={Boolean(mutatingOrderId)}>
      <div className="portal-action-bar">
        <span className="orders-page-header-meta">{filtered.length} matching order{filtered.length === 1 ? '' : 's'}</span>
      </div>

      <QueueTabs tabs={queueTabs} active={activeQueue} onChange={selectQueue} />

      <ExceptionSummary
        paymentIssues={stats.paymentIssues}
        problematic={stats.problematic}
        investigations={stats.investigations}
        onPaymentIssues={() => { setFilterPayment('failed'); setExceptionFilter('all'); setPage(1); }}
        onProblematic={() => { setExceptionFilter('problematic'); setPage(1); }}
        onInvestigations={() => { setExceptionFilter('investigation'); setPage(1); }}
      />

      <OrdersToolbar
        search={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        advancedOpen={advancedFiltersOpen}
        onToggleAdvanced={() => setAdvancedFiltersOpen(open => !open)}
        payment={filterPayment}
        onPaymentChange={(value) => { setFilterPayment(value); setPage(1); }}
        orderType={filterType}
        onOrderTypeChange={(value) => { setFilterType(value); setPage(1); }}
        dateFrom={dateFrom}
        onDateFromChange={(value) => { setDateFrom(value); setPage(1); }}
        dateTo={dateTo}
        onDateToChange={(value) => { setDateTo(value); setPage(1); }}
        chips={filterChips}
        onClearAll={clearAllFilters}
        onExport={handleExport}
      />

      <OrdersList
        orders={paged}
        loading={loading}
        error={loadError}
        onRetry={fetchOrders}
        onOpen={openDetail}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
      />

      {totalPages > 1 ? (
        <div className="orders-pagination">
          <span>Page {currentPage} of {totalPages} · {filtered.length} orders</span>
          <div className="orders-pagination-buttons">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(1)} aria-label="First page">«</button>
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">‹</button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, index) => {
              let pageNumber: number;
              if (totalPages <= 5) pageNumber = index + 1;
              else if (currentPage <= 3) pageNumber = index + 1;
              else if (currentPage >= totalPages - 2) pageNumber = totalPages - 4 + index;
              else pageNumber = currentPage - 2 + index;
              return <button type="button" className={pageNumber === currentPage ? 'is-active' : ''} key={pageNumber} onClick={() => setPage(pageNumber)} aria-label={`Page ${pageNumber}`} aria-current={pageNumber === currentPage ? 'page' : undefined}>{pageNumber}</button>;
            })}
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">›</button>
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)} aria-label="Last page">»</button>
          </div>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════════
          ORDER DETAIL DRAWER
          ═══════════════════════════════════════════════════════════════════ */}
      <OrderDetailDrawer
        order={selectedOrder}
        activeTab={detailTab}
        onTabChange={setDetailTab}
        onClose={closeDetail}
        onToggleInvestigation={() => selectedOrder && toggleInvestigation(selectedOrder.id)}
        footer={selectedOrder ? (
          <>
            <div className="orders-drawer-footer-secondary">
              <button type="button" disabled={Boolean(mutatingOrderId)} className="orders-secondary-action" onClick={() => toggleInvestigation(selectedOrder.id)}>
                {selectedOrder.flagged_for_investigation ? 'Remove flag' : 'Investigate'}
              </button>
              {!selectedOrder.is_problematic ? (
                <button type="button" className="orders-secondary-action" onClick={() => setProblemModal({ open: true, order: selectedOrder })}>Report issue</button>
              ) : (
                <button type="button" className="orders-secondary-action" onClick={() => setResolveModal({ open: true, order: selectedOrder })}>Resolve issue</button>
              )}
              {selectedOrder.payment_status === 'paid' ? <button type="button" className="orders-secondary-action" onClick={() => setRefundModal({ open: true, order: selectedOrder })}>Refund</button> : null}
              {!['cancelled', 'completed', 'refunded'].includes(selectedOrder.status) ? <button type="button" className="orders-secondary-action" onClick={() => setConfirm({ open: true, title: 'Cancel Order', message: 'Are you sure? This cannot be undone.', confirmLabel: 'Cancel Order', confirmDanger: true, action: () => updateOrderStatus(selectedOrder.id, 'cancelled', 'Cancelled by admin') })}>Cancel</button> : null}
            </div>
            <div className="orders-drawer-footer-primary">
              {selectedOrder.status === 'pending' ? <ActionBtn disabled={Boolean(mutatingOrderId)} color="#2E7D32" onClick={() => setConfirm({ open: true, title: 'Confirm Order', message: 'Mark this order as confirmed (paid)?', confirmLabel: 'Confirm', action: () => updateOrderStatus(selectedOrder.id, 'paid') })}>Confirm order</ActionBtn> : null}
              {selectedOrder.status !== 'pending' && selectedOrder.delivery_status === 'pending' && !['cancelled', 'completed', 'refunded'].includes(selectedOrder.status) ? <ActionBtn disabled={Boolean(mutatingOrderId)} color="#1565C0" onClick={() => setConfirm({ open: true, title: 'Start Preparing', message: 'Move this order to preparing status?', confirmLabel: 'Start', action: () => updateDeliveryStatus(selectedOrder.id, 'preparing') })}>Start preparing</ActionBtn> : null}
              {selectedOrder.delivery_status === 'preparing' ? <ActionBtn disabled={Boolean(mutatingOrderId)} color="#6A1B9A" onClick={() => setConfirm({ open: true, title: 'Ship Order', message: 'Mark this order as shipped?', confirmLabel: 'Ship', action: () => updateDeliveryStatus(selectedOrder.id, 'shipped') })}>Ship order</ActionBtn> : null}
              {selectedOrder.delivery_status === 'shipped' ? <ActionBtn disabled={Boolean(mutatingOrderId)} color="#2E7D32" onClick={() => setConfirm({ open: true, title: 'Mark Delivered', message: 'Confirm this order has been delivered?', confirmLabel: 'Delivered', action: () => updateDeliveryStatus(selectedOrder.id, 'delivered') })}>Mark delivered</ActionBtn> : null}
              {selectedOrder.delivery_status === 'delivered' ? <ActionBtn disabled={Boolean(mutatingOrderId)} color="#1B5E20" onClick={() => setConfirm({ open: true, title: 'Complete Order', message: 'Mark this order as fully completed?', confirmLabel: 'Complete', action: () => updateDeliveryStatus(selectedOrder.id, 'completed') })}>Complete order</ActionBtn> : null}
            </div>
          </>
        ) : undefined}
      >
        {selectedOrder ? <>

                {/* ── OVERVIEW TAB ── */}
                {detailTab === 'overview' && (
                  <div className="orders-detail-summary-grid">
                    {returnError ? <div role="alert">{returnError} <button type="button" onClick={() => setReturnRetry(value => value + 1)}>Retry return request</button></div> : null}

                    {returnRequest && (
                      <SectionCard title="Return Request" className="orders-detail-span-2">
                        <InfoRow label="Status" value={returnRequest.status.replaceAll('_', ' ')} />
                        <InfoRow label="Reason" value={returnRequest.reason.replaceAll('_', ' ')} />
                        <InfoRow label="Requested resolution" value={returnRequest.requested_resolution} />
                        <InfoRow label="Buyer description" value={returnRequest.description || '--'} />
                        {returnRequest.order_return_evidence?.length ? <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>{returnRequest.order_return_evidence.map(evidence => evidence.signedUrl ? <a key={evidence.id} href={evidence.signedUrl} target="_blank" rel="noreferrer"><AssetImage src={evidence.signedUrl} alt="Return evidence" style={{ width: '72px', height: '72px', borderRadius: '8px', objectFit: 'cover' }} /></a> : null)}</div> : null}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                          {returnRequest.status === 'submitted' ? <button disabled={Boolean(mutatingOrderId)} className="orders-secondary-action" onClick={() => void updateReturn('under_review')}>Start review</button> : null}
                          {['submitted', 'under_review'].includes(returnRequest.status) ? <><button disabled={Boolean(mutatingOrderId)} className="orders-secondary-action" onClick={() => void updateReturn('approved')}>Approve</button><button disabled={Boolean(mutatingOrderId)} className="orders-secondary-action" onClick={() => void updateReturn('rejected')}>Reject</button></> : null}
                          {returnRequest.status === 'approved' && returnRequest.requested_resolution === 'refund' ? <button disabled={Boolean(mutatingOrderId)} className="orders-secondary-action" onClick={() => void updateReturn('refunded')}>Mark refund complete</button> : null}
                          {['approved', 'rejected', 'refunded'].includes(returnRequest.status) ? <button disabled={Boolean(mutatingOrderId)} className="orders-secondary-action" onClick={() => void updateReturn('closed')}>Close request</button> : null}
                        </div>
                      </SectionCard>
                    )}

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
                          {item.image && <AssetImage src={item.image} alt="" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #E8E0D8' }} />}
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
                      <SectionCard title="Customized Design" className="orders-detail-span-2">
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
                        <div><p style={{ fontSize: '0.75rem', color: '#8C7B6E', marginBottom: '4px' }}>Payment</p>{paymentBadge(selectedOrder.payment_status)}</div>
                        <div><p style={{ fontSize: '0.75rem', color: '#8C7B6E', marginBottom: '4px' }}>Order</p>{orderBadge(selectedOrder.status)}</div>
                        <div><p style={{ fontSize: '0.75rem', color: '#8C7B6E', marginBottom: '4px' }}>Delivery</p>{deliveryBadge(selectedOrder.delivery_status)}</div>
                      </div>
                    </SectionCard>

                    {/* timeline */}
                    <SectionCard title="Order Timeline" className="orders-detail-span-2">
                      <OrderTimeline order={selectedOrder} />
                    </SectionCard>

                    {/* notes */}
                    <SectionCard title="Notes" className="orders-detail-span-2">
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: '6px' }}>Seller Notes</label>
                        <textarea
                          value={sellerNotes}
                          onChange={e => setNotesDraft({ orderId: selectedOrder.id, seller: e.target.value, buyer: buyerNotes })}
                          placeholder="Internal notes visible to seller..."
                          rows={2}
                          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                        />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: '6px' }}>Customer Notes</label>
                        <textarea
                          value={buyerNotes}
                          onChange={e => setNotesDraft({ orderId: selectedOrder.id, seller: sellerNotes, buyer: e.target.value })}
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
                          <AssetImage src={selectedOrder.payment_proof_url} alt="Payment Proof" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '10px', border: '1px solid #E8E0D8', objectFit: 'contain' }} />
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
                            <ActionBtn disabled={Boolean(mutatingOrderId)} color="#2E7D32" onClick={() => setVerifyModal({ open: true, order: selectedOrder })}>
                              Verify Payment
                            </ActionBtn>
                            <ActionBtn disabled={Boolean(mutatingOrderId)} color="#C62828" onClick={() => setRejectModal({ open: true, order: selectedOrder })}>
                              Reject Payment
                            </ActionBtn>
                          </>
                        )}
                        {selectedOrder.payment_status === 'paid' && (
                          <ActionBtn disabled={Boolean(mutatingOrderId)} color="#6A1B9A" onClick={() => setRefundModal({ open: true, order: selectedOrder })}>
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
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', background: '#FFF3E0', color: '#E65100', marginLeft: '8px', fontWeight: 600 }}>
                              Simulated
                            </span>
                          </span>
                        ) : <span style={{ color: '#A89688' }}>No tracking info</span>
                      } />
                      <InfoRow label="Estimated Delivery" value={selectedOrder.estimated_delivery || '--'} />
                      <InfoRow label="Delivery Notes" value={selectedOrder.delivery_notes || '--'} />
                    </SectionCard>

                  </div>
                )}

                {/* ── ACTIVITY TAB ── */}
                {detailTab === 'activity' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <SectionCard title="Activity Log">
                      {activityError ? <div role="alert">{activityError} <button type="button" onClick={() => void fetchActivityLogs()}>Retry activity</button></div> : activityLoading ? <p role="status">Loading activity…</p> : activityLogs.length === 0 ? (
                        <p style={{ fontSize: '0.88rem', color: '#A89688', textAlign: 'center', padding: '20px 0' }}>No activity recorded yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                          {activityLogs.map(log => (
                            <div key={log.id} style={{ display: 'flex', gap: '14px', padding: '12px 0', borderBottom: '1px solid #F0EBE4' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#FDF5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)' }}>
                                  {log.event_name.includes('payment') ? 'P' : log.event_name.includes('delivery') ? 'D' : log.event_name.includes('refund') ? 'R' : log.event_name.includes('problem') ? '!' : 'A'}
                                </span>
                              </div>
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>
                                  {formatActivityLabel(log.event_name)}
                                </p>
                                {Boolean(log.before_data?.status || log.after_data?.status) && log.before_data?.status !== log.after_data?.status && (
                                  <p style={{ fontSize: '0.78rem', color: '#8C7B6E', marginTop: '2px' }}>
                                    Status: {String(log.before_data?.status || '--')} → {String(log.after_data?.status || '--')}
                                  </p>
                                )}
                                {Boolean(log.before_data?.delivery_status || log.after_data?.delivery_status) && log.before_data?.delivery_status !== log.after_data?.delivery_status && (
                                  <p style={{ fontSize: '0.78rem', color: '#8C7B6E', marginTop: '2px' }}>
                                    Delivery: {String(log.before_data?.delivery_status || '--')} → {String(log.after_data?.delivery_status || '--')}
                                  </p>
                                )}
                                <p style={{ fontSize: '0.75rem', color: '#A89688', marginTop: '4px' }}>
                                  by {log.actor_label || 'Unknown'} ({log.actor_context}) &middot; {formatDate(log.occurred_at)}
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
                          <ActionBtn disabled={Boolean(mutatingOrderId)} color="#2E7D32" onClick={() => setResolveModal({ open: true, order: selectedOrder })}>
                            Resolve Problem
                          </ActionBtn>
                          <ActionBtn disabled={Boolean(mutatingOrderId)} color="#E65100" onClick={() => toggleInvestigation(selectedOrder.id)}>
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
                        <ActionBtn disabled={Boolean(mutatingOrderId)} color="#C62828" onClick={() => setProblemModal({ open: true, order: selectedOrder })}>
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
                          <ActionBtn disabled={Boolean(mutatingOrderId)} color="#2E7D32" onClick={() => setConfirm({ open: true, title: 'Approve Cancellation', message: 'Approve this cancellation request?', confirmLabel: 'Approve', action: () => reviewCancellation(selectedOrder.id, true) })}>
                            Approve
                          </ActionBtn>
                          <ActionBtn disabled={Boolean(mutatingOrderId)} color="#C62828" onClick={() => setConfirm({ open: true, title: 'Reject Cancellation', message: 'Reject this cancellation request?', confirmLabel: 'Reject', confirmDanger: true, action: () => reviewCancellation(selectedOrder.id, false) })}>
                            Reject
                          </ActionBtn>
                        </div>
                      </SectionCard>
                    )}
                  </div>
                )}
              </>
            : null}
      </OrderDetailDrawer>

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
          onConfirm={async () => { if (await confirm.action()) setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* verify payment modal */}
      {verifyModal.open && verifyModal.order && <Popup title="Verify payment?" message={<>Confirm that the payment of <strong>{formatCurrency(verifyModal.order.total)}</strong> for order #{verifyModal.order.id.slice(0, 8).toUpperCase()} has been received?</>} confirmLabel="Verify payment" onCancel={() => setVerifyModal({ open: false, order: null })} onConfirm={() => verifyPayment(verifyModal.order!.id)} />}

      {/* reject payment modal */}
      {rejectModal.open && rejectModal.order && <Popup title="Reject payment" confirmLabel="Reject payment" danger={true} confirmDisabled={!rejectReason.trim()} onCancel={() => { setRejectModal({ open: false, order: null }); setRejectReason(''); }} onConfirm={() => rejectPayment(rejectModal.order!.id)}>

            <p style={{ fontSize: '0.9rem', color: '#8C7B6E', margin: '12px 0 12px' }}>Provide a reason for rejecting this payment.</p>
            <textarea
              value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
      </Popup>}

      {/* refund modal */}
      {refundModal.open && refundModal.order && <Popup title="Process refund" confirmLabel="Process refund" danger={true} confirmDisabled={!refundAmount || !refundReason.trim()} onCancel={() => { setRefundModal({ open: false, order: null }); setRefundAmount(''); setRefundReason(''); }} onConfirm={() => processRefund(refundModal.order!.id, Number(refundAmount))}>

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
      </Popup>}

      {/* flag problem modal */}
      {problemModal.open && problemModal.order && <Popup title="Flag problem" confirmLabel="Flag problem" danger={true} confirmDisabled={!problemType || !problemNotes.trim()} onCancel={() => { setProblemModal({ open: false, order: null }); setProblemType(''); setProblemNotes(''); }} onConfirm={() => flagProblem(problemModal.order!.id, problemType, problemNotes)}>

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
      </Popup>}

      {/* resolve problem modal */}
      {resolveModal.open && resolveModal.order && <Popup title="Resolve problem" confirmLabel="Resolve problem" danger={false} confirmDisabled={!resolution.trim()} onCancel={() => { setResolveModal({ open: false, order: null }); setResolution(''); }} onConfirm={() => resolveProblem(resolveModal.order!.id, resolution)}>

            <p style={{ fontSize: '0.9rem', color: '#8C7B6E', margin: '12px 0 12px' }}>Describe how this problem was resolved.</p>
            <textarea
              value={resolution} onChange={e => setResolution(e.target.value)}
              placeholder="Resolution details..."
              rows={3}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
      </Popup>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionCard({ title, children, accent, className = '' }: { title: string; children: React.ReactNode; accent?: string; className?: string }) {
  return (
    <section className={`orders-detail-section ${className}`.trim()} style={{ background: '#fff', border: '1px solid #EDE8E2', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EBE4', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {accent && <span style={{ width: '4px', height: '18px', borderRadius: '2px', background: accent }} />}
        <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)', fontFamily: 'var(--font-serif)', margin: 0 }}>{title}</h3>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </section>
  );
}

function InfoRow({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '6px 0', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.8rem', color: '#8C7B6E', width: '120px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.88rem', color: 'var(--text-dark)', fontWeight: bold ? 600 : 400, flex: 1, wordBreak: 'break-all' }}>{value || '--'}</span>
    </div>
  );
}

function ActionBtn({ color, onClick, children, disabled }: { color: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
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
            {step.active && <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>{'\u2713'}</span>}
          </div>
          {/* label */}
          <div style={{ paddingBottom: i < steps.length - 1 ? '16px' : 0 }}>
            <p style={{ fontSize: '0.82rem', fontWeight: step.active ? 600 : 400, color: step.active ? 'var(--text-dark)' : '#A89688', margin: 0 }}>
              {step.label}
            </p>
            {step.active && step.date && (
              <p style={{ fontSize: '0.75rem', color: '#A89688', margin: '2px 0 0' }}>{formatDate(step.date)}</p>
            )}
          </div>
        </div>
      ))}

      {/* cancelled branch */}
      {isCancelled && (
        <div style={{ display: 'flex', gap: '14px', position: 'relative', marginTop: '8px' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#C62828', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
            <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>{'\u2715'}</span>
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
