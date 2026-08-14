import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp, CheckCircle2, ChevronRight, Clock3, Eye, Inbox, LoaderCircle,
  MessageCircle, PackageCheck, Search, Send, SlidersHorizontal, X, XCircle,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { getPattern } from '../freeform/decor';
import { getFinishDefinition } from '../freeform/materials';
import type {
  DesignRequest, DesignRequestEvent, DesignRequestQueueItem, DesignRequestRevision,
  DesignRequestStage,
} from '../../types/designRequest';
import { useArtisanPortal } from './artisanContextValue';
import {
  deriveDesignRequestStage, DESIGN_REQUEST_STAGE_LABELS, normalizeRequestOrder,
  requestMatches, requestNextAction,
} from './designRequestWorkflow';
import { useOverlayA11y } from './useOverlayA11y';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';

const FreeformViewer = lazy(() => import('../freeform/FreeformViewer'));

type ResponseAction = 'quote' | 'request_changes' | 'decline';
type StageFilter = 'all' | DesignRequestStage;
type SortOrder = 'newest' | 'oldest';
type RequestRecord = DesignRequest & {
  conversations?: { buyer_name?: string } | null;
  order?: unknown;
};

const STAGE_FILTERS: { id: StageFilter; label: string }[] = [
  { id: 'all', label: 'All stages' },
  { id: 'needs_response', label: 'Needs response' },
  { id: 'awaiting_buyer', label: 'Awaiting buyer' },
  { id: 'revision_requested', label: 'Revision requested' },
  { id: 'payment_pending', label: 'Payment pending' },
  { id: 'ready_for_production', label: 'Ready for production' },
  { id: 'in_production', label: 'In production' },
  { id: 'completed', label: 'Completed' },
  { id: 'declined', label: 'Declined' },
];

const EVENT_LABELS: Record<string, string> = {
  submitted: 'Request submitted', changes_requested: 'Changes requested', revised: 'Revision submitted',
  quoted: 'Quote sent', declined: 'Request declined', approved: 'Quote approved',
  payment_verified: 'Payment verified', production_updated: 'Order updated',
};

function money(value: number | null | undefined) {
  return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAge(createdAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(createdAt).toLocaleDateString();
}

function eventDescription(event: DesignRequestEvent) {
  if (event.event_type === 'production_updated') return String(event.payload.delivery_status || 'Order updated').replace('_', ' ');
  if (event.event_type === 'quoted') return `${money(Number(event.payload.quoted_price))} · ${Number(event.payload.lead_time_days) || 0} days`;
  if (event.event_type === 'changes_requested' || event.event_type === 'declined') return String(event.payload.response || '');
  return event.revision_number ? `Revision ${event.revision_number}` : '';
}

export default function SellerRequests() {
  const { shop } = useArtisanPortal();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<DesignRequestQueueItem[]>([]);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<DesignRequestRevision[]>([]);
  const [events, setEvents] = useState<DesignRequestEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<ResponseAction>('quote');
  const [response, setResponse] = useState('');
  const [quote, setQuote] = useState('');
  const [leadDays, setLeadDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => Date.now());
  const selected = requests.find(item => item.id === selectedId) || null;
  const panelRef = useOverlayA11y(Boolean(selected), closeRequest, saving);
  const requestedRequestId = searchParams.get('requestId');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    const { data, error: requestError } = await supabase.from('design_requests')
      .select('*, conversations(buyer_name), order:orders!design_request_id(id,status,payment_status,delivery_status,total,checkout_session_id,order_type)')
      .eq('shop_id', shop.id).order('created_at', { ascending: false });
    if (requestError) setError(requestError.message);
    else {
      const rows = ((data || []) as unknown as RequestRecord[]).map(row => {
        const order = normalizeRequestOrder(row.order);
        const buyerName = row.conversations?.buyer_name?.trim() || 'Customer';
        return { ...row, buyer_name: buyerName, order, stage: deriveDesignRequestStage(row, order) } as DesignRequestQueueItem;
      });
      setRequests(rows);
      if (requestedRequestId && rows.some(item => item.id === requestedRequestId)) setSelectedId(requestedRequestId);
    }
    if (!silent) setLoading(false);
  }, [requestedRequestId, shop.id]);

  const loadHistory = useCallback(async (requestId: string, silent = false) => {
    if (!silent) setDetailLoading(true);
    const [revisionResult, eventResult] = await Promise.all([
      supabase.from('design_request_revisions').select('*').eq('request_id', requestId).order('revision_number', { ascending: false }),
      supabase.from('design_request_events').select('*').eq('request_id', requestId).order('created_at', { ascending: false }),
    ]);
    if (revisionResult.error || eventResult.error) {
      toast.error(revisionResult.error?.message || eventResult.error?.message || 'Could not load request history.');
    } else {
      setRevisions((revisionResult.data || []) as DesignRequestRevision[]);
      setEvents((eventResult.data || []) as DesignRequestEvent[]);
    }
    if (!silent) setDetailLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  useEffect(() => { if (selectedId) queueMicrotask(() => { void loadHistory(selectedId); }); }, [loadHistory, selectedId]);
  usePortalRealtimeRefresh(['design_requests', 'orders'], () => load(true));
  usePortalRealtimeRefresh(['design_request_revisions', 'design_request_events'], () => selectedId ? loadHistory(selectedId, true) : Promise.resolve());

  const counts = useMemo(() => requests.reduce<Record<string, number>>((result, request) => {
    result[request.stage] = (result[request.stage] || 0) + 1;
    return result;
  }, {}), [requests]);
  const visible = useMemo(() => requests.filter(item =>
    (stageFilter === 'all' || item.stage === stageFilter) && requestMatches(item, deferredSearch)
  ).toSorted((a, b) => {
    const delta = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return sort === 'newest' ? delta : -delta;
  }), [deferredSearch, requests, sort, stageFilter]);

  function openRequest(request: DesignRequestQueueItem) {
    setSelectedId(request.id);
    setAction('quote');
    setResponse(request.shop_response || '');
    setQuote(request.quoted_price?.toString() || '');
    setLeadDays(request.lead_time_days?.toString() || '');
    const params = new URLSearchParams(searchParams);
    params.set('requestId', request.id);
    setSearchParams(params, { replace: true });
  }

  function closeRequest() {
    if (saving) return;
    setSelectedId(null);
    setRevisions([]);
    setEvents([]);
    const params = new URLSearchParams(searchParams);
    params.delete('requestId');
    setSearchParams(params, { replace: true });
  }

  async function submitResponse() {
    if (!selected || saving) return;
    if (action === 'quote' && (!(Number(quote) > 0) || !(Number(leadDays) >= 1) || Number(leadDays) > 365)) {
      toast.error('Enter a valid total quote and lead time.'); return;
    }
    if (action !== 'quote' && !response.trim()) {
      toast.error(action === 'decline' ? 'Enter a decline reason.' : 'Describe the requested changes.'); return;
    }
    setSaving(true);
    const { data, error: responseError } = await supabase.rpc('respond_to_design_request', {
      p_request_id: selected.id,
      p_action: action,
      p_response: response.trim(),
      p_quoted_price: action === 'quote' ? Number(quote) : null,
      p_lead_time_days: action === 'quote' ? Number(leadDays) : null,
    });
    setSaving(false);
    if (responseError) { toast.error(responseError.message); return; }
    const updatedRequest = data as DesignRequest;
    setRequests(current => current.map(item => item.id === updatedRequest.id
      ? { ...item, ...updatedRequest, stage: deriveDesignRequestStage(updatedRequest, item.order) }
      : item));
    await loadHistory(selected.id, true);
    toast.success(action === 'quote' ? 'Quote sent to the buyer.' : action === 'request_changes' ? 'Change request sent.' : 'Request declined.');
  }

  async function advanceOrder() {
    if (!selected?.order || saving) return;
    const next = { pending: 'preparing', preparing: 'shipped', shipped: 'delivered', delivered: 'completed' }[selected.order.delivery_status];
    if (!next) return;
    setSaving(true);
    const { error: advanceError } = await supabase.rpc('advance_custom_order', { p_order_id: selected.order.id, p_next_status: next });
    setSaving(false);
    if (advanceError) { toast.error(advanceError.message); return; }
    toast.success(next === 'preparing' ? 'Production started.' : `Order marked ${next}.`);
    await Promise.all([load(true), loadHistory(selected.id, true)]);
  }

  return <div className="seller-requests-workflow">
    <header className="seller-request-page-header">
      <div><span>Custom orders</span><h1>Design Requests</h1><p>Review buyer designs, send quotes, and track approved pieces through production.</p></div>
      <div className="seller-request-summary" aria-label="Request summary">
        <button type="button" onClick={() => setStageFilter('needs_response')}><Inbox /><span><strong>{counts.needs_response || 0}</strong>Needs response</span></button>
        <button type="button" onClick={() => setStageFilter('awaiting_buyer')}><Clock3 /><span><strong>{counts.awaiting_buyer || 0}</strong>Awaiting buyer</span></button>
        <button type="button" onClick={() => setStageFilter('ready_for_production')}><PackageCheck /><span><strong>{counts.ready_for_production || 0}</strong>Ready to make</span></button>
      </div>
    </header>

    <div className="seller-request-toolbar">
      <label><Search aria-hidden="true" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search buyer, design, request, or order" aria-label="Search design requests" /></label>
      <label><SlidersHorizontal aria-hidden="true" /><select value={stageFilter} onChange={event => setStageFilter(event.target.value as StageFilter)} aria-label="Filter request stage">{STAGE_FILTERS.map(item => <option key={item.id} value={item.id}>{item.label}{item.id === 'all' ? '' : ` (${counts[item.id] || 0})`}</option>)}</select></label>
      <label><ArrowDownUp aria-hidden="true" /><select value={sort} onChange={event => setSort(event.target.value as SortOrder)} aria-label="Sort requests"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </div>

    {error ? <div className="seller-message-error seller-request-retry" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div> : null}
    {loading ? <div className="seller-request-loading"><LoaderCircle className="seller-spin" /> Loading design requests…</div> : visible.length ? (
      <div className="seller-request-queue" role="list">
        <div className="seller-request-queue__head" aria-hidden="true"><span>Request</span><span>Buyer</span><span>Stage</span><span>Quote</span><span>Updated</span><span /></div>
        {visible.map(request => <button type="button" role="listitem" className="seller-request-row" key={request.id} onClick={() => openRequest(request)}>
          <span className="seller-request-row__design"><span className="seller-request-row__visual" style={{ background: request.design_snapshot.material.color }}>{request.design_snapshot.model.thumbnail ? <img src={request.design_snapshot.model.thumbnail} alt="" /> : <span>3D</span>}</span><span><strong>{request.design_snapshot.model.name || 'Custom pottery design'}</strong><small>#{request.id.slice(0, 8).toUpperCase()} · Rev {request.current_revision || 1} · Qty {request.quantity}</small></span></span>
          <span className="seller-request-row__buyer"><strong>{request.buyer_name}</strong><small>{request.design_snapshot.model.category || 'Custom design'}</small></span>
          <span><b className={`seller-request-stage is-${request.stage}`}>{DESIGN_REQUEST_STAGE_LABELS[request.stage]}</b><small className="seller-request-next">{requestNextAction(request)}</small></span>
          <span className="seller-request-row__quote">{request.quoted_price ? money(request.quoted_price) : '—'}<small>{request.lead_time_days ? `${request.lead_time_days} days` : 'Not quoted'}</small></span>
          <span className="seller-request-row__age">{formatAge(request.updated_at || request.created_at, now)}<small>{new Date(request.created_at).toLocaleDateString()}</small></span>
          <ChevronRight className="seller-request-row__chevron" aria-hidden="true" />
        </button>)}
      </div>
    ) : <div className="seller-empty-panel seller-empty-panel--large"><div className="seller-empty-panel__icon"><Inbox size={34} /></div><h2>No matching requests</h2><p>{requests.length ? 'Try changing your search or workflow filter.' : 'New buyer freeform submissions will appear here automatically.'}</p>{requests.length ? <button className="seller-button seller-button--secondary" type="button" onClick={() => { setSearch(''); setStageFilter('all'); }}>Clear filters</button> : null}</div>}

    {selected ? <div className="seller-overlay seller-overlay--drawer seller-request-drawer-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeRequest(); }}>
      <div ref={panelRef} className="seller-overlay__panel seller-request-drawer" role="dialog" aria-modal="true" aria-labelledby="request-drawer-title" tabIndex={-1}>
        <header className="seller-request-drawer__header"><div><b className={`seller-request-stage is-${selected.stage}`}>{DESIGN_REQUEST_STAGE_LABELS[selected.stage]}</b><h2 id="request-drawer-title">{selected.design_snapshot.model.name}</h2><p>Request #{selected.id.slice(0, 8).toUpperCase()} · Revision {selected.current_revision || 1}</p></div><button type="button" onClick={closeRequest} disabled={saving} aria-label="Close request"><X /></button></header>
        <div className="seller-request-drawer__content">
          <section className="seller-request-preview-card">
            <div className="seller-request-viewer" aria-label="Interactive 3D design"><Suspense fallback={<div className="seller-request-viewer__loading"><LoaderCircle className="seller-spin" /> Loading 3D preview…</div>}><FreeformViewer modelFile={selected.design_snapshot.model.file} shapeParams={selected.design_snapshot.shape} materialParams={selected.design_snapshot.material} decorationParams={selected.design_snapshot.decoration} attachmentParams={selected.design_snapshot.attachments} showAttachmentSockets={false} onMorphDetected={() => {}} /></Suspense></div>
            <div className="seller-request-preview-card__caption"><span>Submitted by <strong>{selected.buyer_name}</strong></span><span>{new Date(selected.created_at).toLocaleString()}</span></div>
          </section>

          <section className="seller-request-info-card"><h3>Design specifications</h3><dl><div><dt>Quantity</dt><dd>{selected.quantity}</dd></div><div><dt>Finish</dt><dd><i style={{ background: selected.design_snapshot.material.color }} />{getFinishDefinition(selected.design_snapshot.material.finish).label}</dd></div><div><dt>Pattern</dt><dd>{getPattern(selected.design_snapshot.decoration.patternId)?.name || 'None'}</dd></div><div><dt>Attachments</dt><dd>{selected.design_snapshot.attachments.map(item => `${item.name} × ${item.placements.length}`).join(', ') || 'None'}</dd></div><div><dt>Dimensions</dt><dd>H {selected.design_snapshot.dimensions.heightCm} cm · W {selected.design_snapshot.dimensions.widthCm} cm</dd></div><div><dt>Buyer estimate</dt><dd>{money(selected.design_snapshot.estimate.price)} · {selected.design_snapshot.estimate.productionDays} days</dd></div></dl><div className="seller-request-note"><strong>Buyer note</strong><p>{selected.buyer_note || 'No additional note.'}</p></div></section>

          {selected.status === 'approved' && selected.order ? <section className="seller-request-order-card"><div><span>Linked custom order</span><h3>#{selected.order.id.slice(0, 8).toUpperCase()}</h3></div><dl><div><dt>Payment</dt><dd className={`is-${selected.order.payment_status}`}>{selected.order.payment_status}</dd></div><div><dt>Production</dt><dd>{selected.order.delivery_status}</dd></div><div><dt>Total</dt><dd>{money(selected.order.total)}</dd></div></dl>{selected.stage === 'payment_pending' ? <p><Clock3 /> Production unlocks after verified payment.</p> : null}<div className="seller-request-order-card__actions">{['ready_for_production', 'in_production', 'shipped', 'delivered'].includes(selected.stage) ? <button className="seller-button seller-button--primary" type="button" disabled={saving} onClick={() => void advanceOrder()}>{saving ? <LoaderCircle className="seller-spin" /> : <PackageCheck />}{requestNextAction(selected)}</button> : null}<button className="seller-button seller-button--secondary" type="button" onClick={() => navigate(`/artisan-dashboard/orders?orderId=${encodeURIComponent(selected.order!.id)}`)}><Eye /> Open order</button></div></section> : null}

          {selected.status === 'declined' ? <section className="seller-request-final is-declined"><strong><XCircle /> Request declined</strong><p>{selected.shop_response}</p></section> : selected.status === 'approved' ? <section className="seller-request-final"><strong><CheckCircle2 /> Quote approved</strong><p>The approved request is now tracked through its linked custom order.</p></section> : <section className="seller-request-response-card"><h3>Respond to buyer</h3><div className="seller-request-action-tabs">{([{ id: 'quote', label: 'Send Quote' }, { id: 'request_changes', label: 'Request Changes' }, { id: 'decline', label: 'Decline' }] as { id: ResponseAction; label: string }[]).map(item => <button type="button" className={action === item.id ? 'is-active' : ''} onClick={() => setAction(item.id)} key={item.id}>{item.label}</button>)}</div>{action === 'quote' ? <div className="seller-request-quote-fields"><label><span>Total quote</span><div className="seller-money-input"><b>₱</b><input type="number" min="1" step="0.01" value={quote} onChange={event => setQuote(event.target.value)} placeholder="0.00" /></div></label><label><span>Lead time (days)</span><input type="number" min="1" max="365" value={leadDays} onChange={event => setLeadDays(event.target.value)} placeholder="7" /></label></div> : null}<label className="seller-request-response-note"><span>{action === 'quote' ? 'Reply note (optional)' : action === 'decline' ? 'Reason' : 'Changes needed'}</span><textarea rows={4} maxLength={2000} value={response} onChange={event => setResponse(event.target.value)} /><small>{response.length}/2000</small></label><button className={`seller-button ${action === 'decline' ? 'seller-button--danger' : 'seller-button--primary'}`} type="button" disabled={saving} onClick={() => void submitResponse()}>{saving ? <LoaderCircle className="seller-spin" /> : action === 'quote' ? <Send /> : action === 'request_changes' ? <Clock3 /> : <XCircle />}{saving ? 'Saving…' : action === 'quote' ? 'Send quote' : action === 'request_changes' ? 'Request changes' : 'Decline request'}</button></section>}

          <section className="seller-request-history"><h3>Request history</h3>{detailLoading ? <div className="seller-request-history__loading"><LoaderCircle className="seller-spin" /> Loading history…</div> : events.length ? <ol>{events.map(event => <li key={event.id}><span className={`is-${event.event_type}`} /><div><strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong><p>{eventDescription(event)}</p><time>{new Date(event.created_at).toLocaleString()}</time></div></li>)}</ol> : <p>No history is available for this request yet.</p>}{revisions.length > 1 ? <small>{revisions.length} immutable design revisions preserved.</small> : null}</section>
        </div>
        <footer className="seller-request-drawer__footer">{selected.conversation_id ? <button type="button" onClick={() => navigate(`/artisan-dashboard/messages?conversation=${encodeURIComponent(selected.conversation_id!)}`)}><MessageCircle /> Open conversation</button> : null}<span>Last updated {formatAge(selected.updated_at, now)}</span></footer>
      </div>
    </div> : null}
  </div>;
}
