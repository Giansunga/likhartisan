import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { addToCart } from '../../data/store';
import { usePurchases } from '../../hooks/usePurchases';
import { API_BASE } from '../../lib/api';
import { purchaseApi } from '../../lib/purchaseApi';
import { parsePurchaseFilters } from '../../lib/purchaseFilters';
import { supabase } from '../../lib/supabase';
import { displayVariation } from '../../lib/utils';
import type { PurchaseDetail, PurchaseStatus, PurchaseSummary, ReorderPlan } from '../../types/purchases';
import OrderStatusTracker from './OrderStatusTracker';
import './PurchasePanel.css';

const TABS: Array<{ key: PurchaseStatus; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'to-pay', label: 'To Pay' }, { key: 'to-ship', label: 'To Ship' },
  { key: 'to-receive', label: 'To Receive' }, { key: 'completed', label: 'Completed' },
  { key: 'return-refund', label: 'Returns' }, { key: 'cancelled', label: 'Cancelled' },
];
const STATUS_MESSAGE: Record<string, string> = {
  'to-pay': 'Payment is waiting for you', 'to-ship': 'The seller is preparing your order',
  'to-receive': 'Delivered — confirm when everything looks right', completed: 'Order completed',
  'return-refund': 'Return or refund in progress', cancelled: 'Order cancelled',
};
const money = (value: number) => `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const EMPTY_REVIEWED_PRODUCTS = new Set<string>();

interface Props {
  reviewedProductIds?: Set<string>;
  onRate?: (order: PurchaseSummary, itemIndex: number, editing: boolean) => void;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="purchase-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <div className="purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-modal-title" onMouseDown={event => event.stopPropagation()}>
      <div className="purchase-modal__head"><h2 id="purchase-modal-title">{title}</h2><button aria-label="Close" onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>;
}

function ReturnDialog({ order, detail, onClose, onDone }: { order: PurchaseSummary; detail: PurchaseDetail; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('damaged');
  const [resolution, setResolution] = useState('refund');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const evidenceRequired = ['damaged', 'defective', 'wrong_item'].includes(reason);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const items = Object.entries(selected).filter(([, quantity]) => quantity > 0).map(([itemIndex, quantity]) => ({ itemIndex: Number(itemIndex), quantity }));
    if (!items.length) return toast.error('Select at least one affected item.');
    if (description.trim().length < 10) return toast.error('Please add a little more detail.');
    if (evidenceRequired && !files.length) return toast.error('This reason requires at least one image.');
    setBusy(true);
    try {
      const draft = await purchaseApi<{ request: { id: string } }>(`/${order.id}/returns`, { method: 'POST', body: JSON.stringify({ reason, requestedResolution: resolution, description, items }) });
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]; setProgress(`Uploading image ${index + 1} of ${files.length}…`);
        const signed = await purchaseApi<{ path: string; token: string }>(`/returns/${draft.request.id}/evidence/presign`, { method: 'POST', body: JSON.stringify({ contentType: file.type, size: file.size }) });
        const uploaded = await supabase.storage.from('return-evidence').uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
        if (uploaded.error) throw uploaded.error;
        await purchaseApi(`/returns/${draft.request.id}/evidence/complete`, { method: 'POST', body: JSON.stringify({ path: signed.path }) });
      }
      setProgress('Submitting request…');
      await purchaseApi(`/returns/${draft.request.id}/submit`, { method: 'POST' });
      toast.success('Return request submitted.'); onDone(); onClose();
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); setProgress(''); }
  }
  return <Modal title="Request a return" onClose={onClose}>
    <form onSubmit={submit} className="return-form">
      <p className="purchase-muted">Eligible until {detail.returnEligibility.deadline ? new Date(detail.returnEligibility.deadline).toLocaleDateString() : 'receipt is confirmed'}.</p>
      <fieldset><legend>Affected items</legend>{order.items.map(item => <label className="return-item" key={item.index}>
        <input type="checkbox" checked={Boolean(selected[item.index])} onChange={event => setSelected(current => ({ ...current, [item.index]: event.target.checked ? 1 : 0 }))} />
        <span>{item.productName}</span>{selected[item.index] ? <input aria-label={`Quantity for ${item.productName}`} type="number" min="1" max={item.quantity} value={selected[item.index]} onChange={event => setSelected(current => ({ ...current, [item.index]: Number(event.target.value) }))} /> : null}
      </label>)}</fieldset>
      <div className="return-form__grid"><label>Reason<select value={reason} onChange={event => setReason(event.target.value)}><option value="damaged">Damaged</option><option value="defective">Defective</option><option value="wrong_item">Wrong item</option><option value="missing_item">Missing item</option><option value="not_as_described">Not as described</option><option value="other">Other</option></select></label><label>Resolution<select value={resolution} onChange={event => setResolution(event.target.value)}><option value="refund">Refund</option><option value="replacement">Replacement</option></select></label></div>
      <label>Description<textarea rows={4} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe what happened and which item is affected." /></label>
      <label>Evidence {evidenceRequired ? '(required)' : '(optional)'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => {
        const chosen = Array.from(event.target.files || []); if (chosen.length > 3 || chosen.some(file => file.size > 5 * 1024 * 1024)) return toast.error('Choose up to 3 JPG, PNG, or WebP images under 5 MB each.'); setFiles(chosen);
      }} /></label>
      {progress && <p className="purchase-progress" role="status">{progress}</p>}
      <div className="purchase-modal__actions"><button type="button" className="purchase-btn secondary" onClick={onClose}>Cancel</button><button disabled={busy} className="purchase-btn primary">{busy ? 'Working…' : 'Submit request'}</button></div>
    </form>
  </Modal>;
}

export default function PurchasePanel({ reviewedProductIds = EMPTY_REVIEWED_PRODUCTS, onRate }: Props) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const restored = parsePurchaseFilters(params);
  const { status, page, query: submittedQ } = restored;
  const [draftQ, setDraftQ] = useState(submittedQ);
  const linkedOrderId = params.get('order');
  const [details, setDetails] = useState<Record<string, PurchaseDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [mutation, setMutation] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ order: PurchaseSummary; action: 'cancel' | 'receive' } | null>(null);
  const [returnOrder, setReturnOrder] = useState<PurchaseSummary | null>(null);
  const orderRefs = useRef<Record<string, HTMLElement | null>>({});
  const lastScrolledOrderRef = useRef<string | null>(null);
  const query = useMemo(() => { const next = new URLSearchParams(); next.set('status', status); next.set('sort', 'newest'); next.set('page', String(page)); if (submittedQ) next.set('q', submittedQ); return next.toString(); }, [page, status, submittedQ]);
  const { data, loading, refreshing, error, reload } = usePurchases(user?.id, query, authLoading);
  function update(values: Record<string, string | null>) { const next = new URLSearchParams(params); next.set('tab', 'purchases'); Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); setParams(next); }
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(id);
    try { const detail = await purchaseApi<PurchaseDetail>(`/${id}`); setDetails(current => ({ ...current, [id]: detail })); }
    catch (error) { toast.error((error as Error).message); }
    finally { setDetailLoading(null); }
  }, []);
  // The URL is the single source of truth for an open purchase so LIKHAI links,
  // browser navigation, and manually opening a card always stay synchronized.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (linkedOrderId && !details[linkedOrderId]) void loadDetail(linkedOrderId); }, [details, linkedOrderId, loadDetail]);
  useEffect(() => { lastScrolledOrderRef.current = null; }, [linkedOrderId]);
  useEffect(() => {
    if (!linkedOrderId || !details[linkedOrderId] || lastScrolledOrderRef.current === linkedOrderId) return;
    const frame = window.requestAnimationFrame(() => {
      orderRefs.current[linkedOrderId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      lastScrolledOrderRef.current = linkedOrderId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [details, linkedOrderId]);
  function toggle(id: string) {
    update({ order: linkedOrderId === id ? null : id });
  }
  async function mutate(order: PurchaseSummary, action: 'cancel' | 'receive') { setMutation(order.id); try { await purchaseApi(`/${order.id}/${action}`, { method: 'POST' }); toast.success(action === 'cancel' ? 'Order cancelled.' : 'Receipt confirmed.'); setConfirm(null); await reload(); } catch (e) { toast.error((e as Error).message); } finally { setMutation(null); } }
  async function pay(order: PurchaseSummary) {
    setMutation(order.id);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) throw new Error('Sign-in required');
      if (order.checkoutSessionId) {
        const response = await fetch(`${API_BASE}/api/session/${order.checkoutSessionId}`, { headers: { Authorization: `Bearer ${authSession.access_token}` } });
        const paymentSession = await response.json();
        if (response.ok && paymentSession.checkout_url) {
          localStorage.setItem('likhartisan_checkout_session_id', order.checkoutSessionId);
          localStorage.setItem('likhartisan_order_id', order.id);
          window.location.assign(paymentSession.checkout_url);
          return;
        }
      }
      if (order.orderType !== 'customized') throw new Error('This payment session has expired.');
      const response = await fetch(`${API_BASE}/api/orders/${order.id}/checkout`, {
        method: 'POST', headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      const result = await response.json() as { checkoutUrl?: string; checkoutSessionId?: string; error?: string };
      if (!response.ok || !result.checkoutUrl || !result.checkoutSessionId) throw new Error(result.error || 'Payment is temporarily unavailable.');
      localStorage.setItem('likhartisan_checkout_session_id', result.checkoutSessionId);
      localStorage.setItem('likhartisan_order_id', order.id);
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      toast.error((error as Error).message || 'Payment is temporarily unavailable.');
    } finally {
      setMutation(null);
    }
  }
  async function reorder(order: PurchaseSummary) { setMutation(order.id); try { const plan = await purchaseApi<ReorderPlan>(`/${order.id}/reorder-plan`, { method: 'POST' }); if (!plan.available.length) return toast.error('None of these items are currently available.'); const warning = plan.unavailable.length ? `\n\nUnavailable: ${plan.unavailable.map(item => item.productName).join(', ')}` : ''; if (!window.confirm(`Add ${plan.available.length} available item${plan.available.length === 1 ? '' : 's'} to your cart?${warning}`)) return; plan.available.forEach(addToCart); toast.success('Available items added to your cart.'); navigate('/cart'); } catch (e) { toast.error((e as Error).message); } finally { setMutation(null); } }
  const primary = (order: PurchaseSummary) => order.status === 'to-pay' ? <button className="purchase-btn primary" onClick={() => void pay(order)}>Pay now</button> : order.status === 'to-receive' ? <button className="purchase-btn primary" onClick={() => setConfirm({ order, action: 'receive' })}>Confirm received</button> : order.status === 'completed' ? <button className="purchase-btn primary" onClick={() => void reorder(order)}>Buy again</button> : <button className="purchase-btn primary" onClick={() => void toggle(order.id)}>View details</button>;
  const visibleOrders = linkedOrderId && details[linkedOrderId] && !data.orders.some(order => order.id === linkedOrderId)
    ? [details[linkedOrderId], ...data.orders]
    : data.orders;
  return <section className="purchase-center" aria-labelledby="purchase-title">
    <header className="purchase-header"><div><h1 id="purchase-title">My Purchases</h1><p>{data.statusCounts.all || 0} order{data.statusCounts.all === 1 ? '' : 's'} in your purchase history</p></div>{refreshing && <span role="status">Updating…</span>}</header>
    <form className="purchase-filters" onSubmit={event => { event.preventDefault(); update({ q: draftQ.trim() || null, page: null, order: null }); }}>
      <div className="purchase-search"><input value={draftQ} onChange={event => setDraftQ(event.target.value)} placeholder="Search order, product, shop, or tracking" aria-label="Search purchases" /><button className="purchase-btn primary">Search</button></div>
    </form>
    <nav className="purchase-tabs" aria-label="Purchase status">{TABS.map(tab => <button key={tab.key} aria-pressed={status === tab.key} onClick={() => update({ status: tab.key === 'all' ? null : tab.key, page: null, order: null })}>{tab.label}<span>{data.statusCounts[tab.key] || 0}</span></button>)}</nav>
    {loading ? <div className="purchase-list" aria-label="Loading purchases">{[1, 2, 3].map(value => <div className="purchase-card skeleton" key={value}><i /><div><i /><i /></div></div>)}</div> : error ? <div className="purchase-state"><h2>We couldn’t load your purchases</h2><p>{error}</p><button className="purchase-btn primary" onClick={() => void reload()}>Try again</button></div> : !visibleOrders.length ? <div className="purchase-state"><h2>{data.statusCounts.all ? 'No orders match these filters' : 'Your first handmade find is waiting'}</h2><p>{data.statusCounts.all ? 'Try another search or status.' : 'Orders you place will appear here.'}</p>{data.statusCounts.all ? <button className="purchase-btn secondary" onClick={() => { setDraftQ(''); update({ q: null, status: null, dateFrom: null, dateTo: null, sort: null, page: null }); }}>Clear filters</button> : <Link className="purchase-btn primary" to="/gallery">Explore the gallery</Link>}</div> : <div className="purchase-list">{visibleOrders.map(order => {
      const detail = details[order.id]; const isOpen = linkedOrderId === order.id; const shops = order.shops.length > 1 ? 'Multiple shops' : order.shops[0]?.name || 'LikhArtisan Shop';
      return <article className="purchase-card" key={order.id} id={`order-${order.id}`} ref={node => { orderRefs.current[order.id] = node; }}><div className="purchase-card__top"><div><strong>{shops}</strong><span>Order #{order.shortId} · {new Date(order.createdAt).toLocaleDateString()}</span></div><div className={`purchase-status status-${order.status}`}><strong>{TABS.find(tab => tab.key === order.status)?.label}</strong><span>{STATUS_MESSAGE[order.status]}</span></div></div>
        <div className="purchase-card__items">{order.items.slice(0, 2).map(item => <div className="purchase-item" key={item.index}><img src={item.image} alt="" /><div><strong>{item.productName}</strong><span>{displayVariation(item.dimensions || item.variation || '') || `Quantity: ${item.quantity}`}</span></div><b>{money(item.price * item.quantity)}</b></div>)}{order.items.length > 2 && <p>+{order.items.length - 2} more item{order.items.length > 3 ? 's' : ''}</p>}</div>
        <div className="purchase-card__footer"><div>Order total <strong>{money(order.total)}</strong></div><div>{primary(order)}<button className="purchase-btn secondary" aria-expanded={isOpen} aria-controls={`detail-${order.id}`} onClick={() => void toggle(order.id)}>{isOpen ? 'Hide details' : 'Details'}</button></div></div>
        {isOpen && <div className="purchase-detail" id={`detail-${order.id}`}>{detailLoading === order.id ? <div className="purchase-detail__loading" role="status">Loading authentic tracking history…</div> : detail ? <>
          {detail.returnRequest && <div className="return-status"><strong>Return request: {detail.returnRequest.status.replaceAll('_', ' ')}</strong>{detail.returnRequest.resolution_note && <span>{detail.returnRequest.resolution_note}</span>}</div>}
          <OrderStatusTracker detail={detail} />
          <div className="purchase-detail__grid"><section><h3>Delivery</h3><p><strong>Courier:</strong> {detail.deliveryProvider || (detail.deliveryOption === 'pickup' ? 'Shop pickup' : 'To be assigned')}</p><p><strong>Tracking:</strong> {detail.trackingNumber || 'Not available yet'}</p><p><strong>Estimated delivery:</strong> {detail.estimatedDelivery ? new Date(detail.estimatedDelivery).toLocaleDateString() : 'To be confirmed'}</p></section><section><h3>All items</h3>{detail.items.map(item => <div className="purchase-detail-item" key={item.index}><span>{item.productName} × {item.quantity}</span><strong>{money(item.price * item.quantity)}</strong></div>)}<dl><div><dt>Subtotal</dt><dd>{money(detail.subtotal)}</dd></div><div><dt>Shipping</dt><dd>{money(detail.shippingFee)}</dd></div><div><dt>Total</dt><dd>{money(detail.total)}</dd></div></dl></section></div>
          <div className="purchase-actions"><button className="purchase-btn secondary" onClick={() => navigate(`/chat?order=${order.id}&shop=${order.shops[0]?.id || ''}`)}>Contact seller</button>{order.status === 'to-pay' && <button className="purchase-btn danger" onClick={() => setConfirm({ order, action: 'cancel' })}>Cancel order</button>}{detail.returnEligibility.eligible && !detail.returnRequest && <button className="purchase-btn secondary" onClick={() => setReturnOrder(order)}>Return / refund</button>}{order.status === 'completed' && order.items.map(item => <button className="purchase-btn secondary" key={item.index} onClick={() => onRate?.(order, item.index, reviewedProductIds.has(item.productId))}>{reviewedProductIds.has(item.productId) ? 'Edit review' : 'Rate item'}</button>)}</div>
        </> : <button className="purchase-btn secondary" onClick={() => void loadDetail(order.id)}>Retry details</button>}</div>}
      </article>;
    })}</div>}
    {data.pagination.totalPages > 1 && <nav className="purchase-pagination" aria-label="Purchase pages"><button disabled={page <= 1} onClick={() => update({ page: String(page - 1), order: null })}>Previous</button><span>Page {page} of {data.pagination.totalPages}</span><button disabled={page >= data.pagination.totalPages} onClick={() => update({ page: String(page + 1), order: null })}>Next</button></nav>}
    {confirm && <Modal title={confirm.action === 'cancel' ? 'Cancel this order?' : 'Confirm receipt?'} onClose={() => setConfirm(null)}><p>{confirm.action === 'cancel' ? 'Only unpaid pending orders can be cancelled. This action cannot be undone.' : 'Check that every item arrived in satisfactory condition before confirming.'}</p><div className="purchase-modal__actions"><button className="purchase-btn secondary" onClick={() => setConfirm(null)}>Not now</button><button disabled={mutation === confirm.order.id} className={`purchase-btn ${confirm.action === 'cancel' ? 'danger' : 'primary'}`} onClick={() => void mutate(confirm.order, confirm.action)}>{mutation ? 'Working…' : 'Confirm'}</button></div></Modal>}
    {returnOrder && details[returnOrder.id] && <ReturnDialog order={returnOrder} detail={details[returnOrder.id]} onClose={() => setReturnOrder(null)} onDone={() => { setDetails(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== returnOrder.id))); void reload(); }} />}
  </section>;
}
