import AssetImage from '../AssetImage';
import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, LoaderCircle, Pencil, WalletCards } from 'lucide-react';
import { toast } from '../../lib/popups';
import { checkoutDesignOrder } from '../../lib/designQuoteCheckout';
import { supabase } from '../../lib/supabase';
import { getPattern } from '../freeform/decor';
import { getFinishDefinition } from '../freeform/materials';
import type { DesignRequest, DesignRequestMessagePayload, DesignRequestOrderSummary, DesignRequestRevision } from '../../types/designRequest';
import { isDesignRequestMessage, normalizeDesignRequestSnapshot, REQUEST_STATUS_LABELS } from '../../types/designRequest';
import { formatInches, normalizeShapeParams } from '../../lib/measurements';
import { useQuoteReview } from './QuoteReviewContext';

type RequestWithOrder = DesignRequest & { order?: DesignRequestOrderSummary | DesignRequestOrderSummary[] | null };
type MessageRevision = Pick<DesignRequestRevision, 'request_id' | 'revision_number' | 'design_snapshot' | 'quantity'>;

type DesignRequestListener = () => void;
type DesignRequestSubscription = {
  channel: ReturnType<typeof supabase.channel>;
  listeners: Set<DesignRequestListener>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
};

const designRequestSubscriptions = new Map<string, DesignRequestSubscription>();

function subscribeToDesignRequest(requestId: string, listener: DesignRequestListener) {
  let subscription = designRequestSubscriptions.get(requestId);
  if (!subscription) {
    const listeners = new Set<DesignRequestListener>();
    const channel = supabase.channel(`design-request-card:${requestId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'design_requests', filter: `id=eq.${requestId}` }, () => {
        listeners.forEach(callback => callback());
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `design_request_id=eq.${requestId}` }, () => {
        listeners.forEach(callback => callback());
      })
      .subscribe();
    subscription = { channel, listeners, cleanupTimer: null };
    designRequestSubscriptions.set(requestId, subscription);
  }
  if (subscription.cleanupTimer) {
    clearTimeout(subscription.cleanupTimer);
    subscription.cleanupTimer = null;
  }
  subscription.listeners.add(listener);

  return () => {
    const current = designRequestSubscriptions.get(requestId);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0 || current.cleanupTimer) return;
    current.cleanupTimer = setTimeout(() => {
      const latest = designRequestSubscriptions.get(requestId);
      if (!latest || latest.listeners.size > 0) return;
      latest.cleanupTimer = null;
      designRequestSubscriptions.delete(requestId);
      void supabase.removeChannel(latest.channel);
    }, 0);
  };
}

function normalizedOrder(request: RequestWithOrder | null) {
  const order = request?.order;
  return Array.isArray(order) ? order[0] ?? null : order ?? null;
}

export default function DesignMessageCard({ data, audience = 'buyer', isLatestForRequest = false }: { data: Record<string, unknown>; audience?: 'buyer' | 'artisan'; isLatestForRequest?: boolean }) {
  const openQuoteReview = useQuoteReview();
  const requestPayload = isDesignRequestMessage(data) ? data as DesignRequestMessagePayload : null;
  const requestId = requestPayload?.request_id;
  const revisionNumber = requestPayload?.revision_number;
  const revisionKey = JSON.stringify([requestId, revisionNumber]);
  const actionKey = JSON.stringify([requestId, revisionNumber, requestPayload?.event_type, requestPayload?.status, requestPayload?.summary?.status, requestPayload?.quoted_price, requestPayload?.lead_time_days, requestPayload?.shop_response, requestPayload?.order_id]);
  const [history, setHistory] = useState<{ key: string; revision: MessageRevision | null } | null>(null);
  const [live, setLive] = useState<{ key: string; request: RequestWithOrder | null } | null>(null);
  const [paying, setPaying] = useState(false);
  const validRevision = typeof revisionNumber === 'number' && Number.isInteger(revisionNumber) && revisionNumber > 0;
  const revision = history?.key === revisionKey ? history.revision : null;
  const request = isLatestForRequest && live?.key === actionKey ? live.request : null;
  const loading = Boolean(requestId && validRevision && history?.key !== revisionKey);

  useEffect(() => {
    if (!requestId || !validRevision) return;
    let active = true;
    async function loadRevision() {
      try {
        const { data: row, error } = await supabase.from('design_request_revisions')
          .select('request_id, revision_number, design_snapshot, quantity')
          .eq('request_id', requestId).eq('revision_number', revisionNumber).maybeSingle();
        if (active) setHistory({ key: revisionKey, revision: error ? null : row as MessageRevision | null });
      } catch {
        if (active) setHistory({ key: revisionKey, revision: null });
      }
    }
    void loadRevision();
    return () => { active = false; };
  }, [requestId, revisionNumber, revisionKey, validRevision]);

  // Current state controls eligibility only; it never replaces the sent content.
  useEffect(() => {
    if (!requestId || !isLatestForRequest) return;
    let active = true;
    let sequence = 0;
    async function load() {
      const attempt = ++sequence;
      try {
        const { data: row, error } = await supabase.from('design_requests')
          .select('*, order:orders!design_request_id(id,status,payment_status,delivery_status,total,checkout_session_id,order_type)')
          .eq('id', requestId).maybeSingle();
        if (active && attempt === sequence) setLive({ key: actionKey, request: error ? null : row as RequestWithOrder | null });
      } catch {
        if (active && attempt === sequence) setLive({ key: actionKey, request: null });
      }
    }
    queueMicrotask(() => { if (active) void load(); });
    const unsubscribe = subscribeToDesignRequest(requestId, () => {
      if (!active) return;
      setLive(null);
      void load();
    });
    return () => { active = false; unsubscribe(); };
  }, [actionKey, requestId, isLatestForRequest]);

  async function checkout(orderId: string) {
    if (paying) return;
    setPaying(true);
    try {
      await checkoutDesignOrder(orderId);
    } finally {
      setPaying(false);
    }
  }

  if (requestPayload) {
    const summary = revision?.design_snapshot ? normalizeDesignRequestSnapshot(revision.design_snapshot) : null;
    const sentStatus = requestPayload.status || requestPayload.summary?.status || (requestPayload.event_type === 'revised' || requestPayload.event_type === 'submitted' ? 'pending' : undefined);
    const status = sentStatus && Object.hasOwn(REQUEST_STATUS_LABELS, sentStatus) ? sentStatus : null;
    const response = requestPayload.shop_response || '';
    const quantity = revision?.quantity ?? requestPayload.summary?.quantity;
    const finish = summary?.material.finish ?? requestPayload.summary?.finish;
    const quote = requestPayload.quoted_price;
    const leadTime = requestPayload.lead_time_days;
    const matchesCurrent = Boolean(revision && request && status && requestPayload.event_type === status && request.current_revision === revisionNumber && request.status === status
      && (status !== 'quoted' && status !== 'changes_requested' || (request.shop_response || '') === response)
      && (status !== 'quoted' || (quote != null && leadTime != null && Number(request.quoted_price) === Number(quote) && request.lead_time_days === leadTime))
      && (status !== 'approved' || requestPayload.order_id === request.order_id));
    const order = normalizedOrder(request);
    const unpaidApproved = matchesCurrent && status === 'approved' && request?.order_id && order && order.payment_status !== 'paid';
    return <div className="chat-design-request-card">
      <div className="chat-design-request-card__head"><span style={{ background: summary?.material.color || requestPayload.summary?.color || '#BE734F' }}>{summary?.model.thumbnail ? <AssetImage src={summary.model.thumbnail} alt="" /> : <span>3D</span>}</span><div><small>CUSTOM DESIGN REQUEST</small><strong>{summary?.model.name || requestPayload.summary?.model || 'Custom pottery'}</strong>{status ? <b className={`is-${status}`}>{REQUEST_STATUS_LABELS[status]}</b> : null}</div></div>
      {loading ? <div className="chat-design-request-loading"><LoaderCircle className="seller-spin" /> Loading original design…</div> : <>
        <dl>{finish ? <div><dt>Finish</dt><dd>{getFinishDefinition(finish).label}</dd></div> : null}{summary ? <div><dt>Pattern</dt><dd>{getPattern(summary.decoration.patternId)?.name || 'None'}</dd></div> : null}{quantity != null ? <div><dt>Quantity</dt><dd>{quantity}</dd></div> : null}{summary ? <div><dt>Dimensions</dt><dd>H {formatInches(summary.dimensions.heightIn)} · W {formatInches(summary.dimensions.widthIn)}</dd></div> : null}</dl>
        {!summary ? <p className="chat-design-response">Original design details unavailable</p> : null}
      </>}
        {status === 'quoted' ? <div className="chat-design-quote"><span><small>TOTAL QUOTE</small><strong>{quote != null && Number.isFinite(Number(quote)) ? `₱${Number(quote).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Unavailable'}</strong></span><span><small>LEAD TIME</small><strong>{leadTime != null ? `${leadTime} days` : 'Unavailable'}</strong></span>{response ? <p>{response}</p> : null}</div> : response ? <p className="chat-design-response">{response}</p> : null}
        {audience === 'buyer' && matchesCurrent && status === 'quoted' ? <button type="button" className="chat-design-approve" onClick={() => openQuoteReview(requestId!)}><CheckCircle2 /> Review Shop Quote</button> : null}
        {audience === 'buyer' && matchesCurrent && status === 'changes_requested' ? <a className="chat-design-open" href={`/freeform?revise=1&requestId=${encodeURIComponent(requestId!)}`}><Pencil size={14} /> Revise Design</a> : null}
        {audience === 'buyer' && unpaidApproved ? <button type="button" className="chat-design-approve" disabled={paying} onClick={() => { void checkout(requestPayload.order_id!).catch(error => toast.error((error as Error).message)); }}>{paying ? <LoaderCircle className="seller-spin" /> : <WalletCards />} {paying ? 'Opening payment…' : 'Pay now'}</button> : null}
        {audience === 'artisan' ? <a className="chat-design-open" href={`/artisan-dashboard/requests?requestId=${encodeURIComponent(requestId!)}`}><ExternalLink size={14} /> Open in Requests</a> : null}
        {status === 'approved' && requestPayload.order_id ? <a className="chat-design-open" href={audience === 'artisan' ? `/artisan-dashboard/orders?orderId=${encodeURIComponent(requestPayload.order_id)}` : `/dashboard?tab=purchases&order=${encodeURIComponent(requestPayload.order_id)}`}><CheckCircle2 size={14} /> View approved order</a> : null}
    </div>;
  }

  const design = data.design as { model?: string; shape?: Record<string, unknown>; material?: Record<string, unknown>; decor?: Record<string, unknown> } | undefined;
  if (!design) return null;
  const shape = design.shape || {}; const material = design.material || {}; const decor = design.decor || {};
  const color = typeof material.color === 'string' ? material.color : '#BE734F';
  const normalizedShape = normalizeShapeParams(shape as Parameters<typeof normalizeShapeParams>[0]);
  const height = typeof shape.height === 'number' || typeof shape.height === 'string' ? formatInches(normalizedShape.height) : '—';
  const width = typeof shape.bodyWidth === 'number' || typeof shape.bodyWidth === 'string' ? formatInches(normalizedShape.bodyWidth) : '—';
  const patternId = typeof decor.patternId === 'string' ? decor.patternId : '';
  return <div className="chat-product-card chat-design-legacy-card"><div className="chat-product-img" style={{ background: color }}><span>3D</span></div><div className="chat-product-info"><span className="chat-product-name">{design.model || 'Custom Design'}</span><span className="chat-product-variant">{getFinishDefinition(material.finish).label} · H {height} · W {width}</span><span className="chat-product-variant">Pattern: {getPattern(patternId)?.name || 'None'}</span></div></div>;
}
