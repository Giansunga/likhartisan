import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Eye, Inbox, LoaderCircle, MessageCircle, Palette, Send, X, XCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { getPattern } from '../freeform/decor';
import { getFinishDefinition } from '../freeform/materials';
import FreeformViewer from '../freeform/FreeformViewer';
import type { DesignRequest, DesignRequestStatus } from '../../types/designRequest';
import { REQUEST_STATUS_LABELS } from '../../types/designRequest';
import { useArtisanPortal } from './artisanContextValue';
import { useOverlayA11y } from './useOverlayA11y';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';

type Filter = 'all' | Exclude<DesignRequestStatus, 'approved'>;
type ResponseAction = 'quote' | 'request_changes' | 'decline';
type RequestRow = DesignRequest & { conversations?: { buyer_name?: string } | null };

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Pending' }, { id: 'quoted', label: 'Quoted' },
  { id: 'changes_requested', label: 'Changes Requested' }, { id: 'declined', label: 'Declined' }, { id: 'all', label: 'All' },
];

function money(value: number | null | undefined) { return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function SellerRequests() {
  const { shop } = useArtisanPortal();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [action, setAction] = useState<ResponseAction>('quote');
  const [response, setResponse] = useState('');
  const [quote, setQuote] = useState('');
  const [leadDays, setLeadDays] = useState('');
  const [saving, setSaving] = useState(false);
  const panelRef = useOverlayA11y(Boolean(selected), () => setSelected(null), saving);
  const requestedRequestId = searchParams.get('requestId');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    const { data, error: requestError } = await supabase.from('design_requests')
      .select('*, conversations(buyer_name)').eq('shop_id', shop.id).order('created_at', { ascending: false });
    if (requestError) setError(requestError.message);
    else {
      const rows = (data || []) as unknown as RequestRow[];
      setRequests(rows);
      if (requestedRequestId) setSelected(rows.find(item => item.id === requestedRequestId) || null);
    }
    if (!silent) setLoading(false);
  }, [requestedRequestId, shop.id]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  usePortalRealtimeRefresh(['design_requests'], () => load(true));
  const visible = useMemo(() => filter === 'all' ? requests : requests.filter(item => item.status === filter), [filter, requests]);

  function openRequest(request: RequestRow) {
    setSelected(request); setAction('quote'); setResponse(request.shop_response || ''); setQuote(request.quoted_price?.toString() || ''); setLeadDays(request.lead_time_days?.toString() || '');
    const params = new URLSearchParams(searchParams); params.set('requestId', request.id); setSearchParams(params, { replace: true });
  }
  function closeRequest() {
    if (saving) return;
    setSelected(null); const params = new URLSearchParams(searchParams); params.delete('requestId'); setSearchParams(params, { replace: true });
  }
  async function submitResponse() {
    if (!selected || saving) return;
    if (action === 'quote' && (!(Number(quote) > 0) || !(Number(leadDays) >= 1))) { toast.error('Enter a valid total quote and lead time.'); return; }
    if (action !== 'quote' && !response.trim()) { toast.error(action === 'decline' ? 'Enter a decline reason.' : 'Describe the requested changes.'); return; }
    setSaving(true);
    const { data, error: responseError } = await supabase.rpc('respond_to_design_request', {
      p_request_id: selected.id, p_action: action, p_response: response.trim(),
      p_quoted_price: action === 'quote' ? Number(quote) : null, p_lead_time_days: action === 'quote' ? Number(leadDays) : null,
    });
    setSaving(false);
    if (responseError) { toast.error(responseError.message); return; }
    const updated = { ...selected, ...(data as DesignRequest) };
    setSelected(updated); setRequests(current => current.map(item => item.id === updated.id ? updated : item));
    toast.success(action === 'quote' ? 'Quote sent to the buyer.' : action === 'request_changes' ? 'Change request sent.' : 'Request declined.');
  }

  return <div className="seller-requests-page seller-requests-workflow">
    <div className="seller-request-filters" role="tablist" aria-label="Request status filters">{FILTERS.map(item => <button role="tab" aria-selected={filter === item.id} className={filter === item.id ? 'is-active' : ''} type="button" key={item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{item.id === 'all' ? requests.length : requests.filter(request => request.status === item.id).length}</span></button>)}</div>
    {error ? <div className="seller-message-error" role="alert">{error}</div> : null}
    {loading ? <div className="seller-request-loading"><LoaderCircle className="seller-spin" /> Loading design requests…</div> : visible.length ? <div className="seller-request-grid">{visible.map(request => {
      const snapshot = request.design_snapshot;
      return <article className="seller-request-card" key={request.id}>
        <div className="seller-request-card__visual" style={{ background: snapshot.material.color }}>{snapshot.model.thumbnail ? <img src={snapshot.model.thumbnail} alt="" /> : <Palette size={31} />}</div>
        <div className="seller-request-card__copy"><div><span className={`seller-request-status is-${request.status}`}>{REQUEST_STATUS_LABELS[request.status]}</span><time>{new Date(request.created_at).toLocaleDateString()}</time></div><h2>{snapshot.model.name || 'Custom pottery design'}</h2><p>{request.conversations?.buyer_name || 'Customer'} · Qty {request.quantity}</p><small>{getFinishDefinition(snapshot.material.finish).label} · {snapshot.dimensions.heightCm} × {snapshot.dimensions.widthCm} cm</small>{request.quoted_price ? <strong>{money(request.quoted_price)}</strong> : null}</div>
        <button className="seller-request-card__open" type="button" onClick={() => openRequest(request)}><Eye size={16} /> View request</button>
      </article>;
    })}</div> : <div className="seller-empty-panel seller-empty-panel--large"><div className="seller-empty-panel__icon"><Inbox size={34} /></div><h2>No {filter === 'all' ? '' : FILTERS.find(item => item.id === filter)?.label.toLowerCase()} requests</h2><p>New buyer freeform submissions will appear here automatically.</p></div>}

    {selected ? <div className="seller-overlay seller-request-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeRequest(); }}><div ref={panelRef} className="seller-overlay__panel seller-request-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title" tabIndex={-1}>
      <header className="seller-overlay__header"><div><span className={`seller-request-status is-${selected.status}`}>{REQUEST_STATUS_LABELS[selected.status]}</span><h2 id="request-modal-title">{selected.design_snapshot.model.name}</h2><p>Submitted by {selected.conversations?.buyer_name || 'Customer'} on {new Date(selected.created_at).toLocaleDateString()}</p></div><button type="button" onClick={closeRequest} disabled={saving} aria-label="Close request"><X size={20} /></button></header>
      <div className="seller-request-modal__body">
        <section className="seller-request-viewer" aria-label="Interactive 3D design"><FreeformViewer modelFile={selected.design_snapshot.model.file} shapeParams={selected.design_snapshot.shape} materialParams={selected.design_snapshot.material} decorationParams={selected.design_snapshot.decoration} attachmentParams={selected.design_snapshot.attachments} showAttachmentSockets={false} onMorphDetected={() => {}} /></section>
        <aside className="seller-request-details">
          <div className="seller-request-details__scroll"><h3>Design details</h3><dl><div><dt>Quantity</dt><dd>{selected.quantity}</dd></div><div><dt>Finish</dt><dd><i style={{ background: selected.design_snapshot.material.color }} />{getFinishDefinition(selected.design_snapshot.material.finish).label}</dd></div><div><dt>Color</dt><dd>{selected.design_snapshot.material.color}</dd></div><div><dt>Pattern</dt><dd>{getPattern(selected.design_snapshot.decoration.patternId)?.name || 'None'}</dd></div><div><dt>Placement</dt><dd>{selected.design_snapshot.decoration.patternId ? selected.design_snapshot.decoration.placement : '—'}</dd></div><div><dt>Attachments</dt><dd>{selected.design_snapshot.attachments.map(item => `${item.name} × ${item.placements.length}`).join(', ') || 'None'}</dd></div><div><dt>Dimensions</dt><dd>H {selected.design_snapshot.dimensions.heightCm} cm · W {selected.design_snapshot.dimensions.widthCm} cm</dd></div><div><dt>Buyer estimate</dt><dd>{money(selected.design_snapshot.estimate.price)} · {selected.design_snapshot.estimate.productionDays} days</dd></div></dl><div className="seller-request-note"><strong>Buyer note</strong><p>{selected.buyer_note || 'No additional note.'}</p></div></div>
          {selected.status === 'approved' || selected.status === 'declined' ? <div className="seller-request-final"><strong>{selected.status === 'approved' ? <><CheckCircle2 /> Quote approved</> : <><XCircle /> Request declined</>}</strong>{selected.shop_response ? <p>{selected.shop_response}</p> : null}</div> : <div className="seller-request-response"><div className="seller-request-action-tabs">{([{ id: 'quote', label: 'Send Quote' }, { id: 'request_changes', label: 'Request Changes' }, { id: 'decline', label: 'Decline' }] as { id: ResponseAction; label: string }[]).map(item => <button type="button" className={action === item.id ? 'is-active' : ''} onClick={() => setAction(item.id)} key={item.id}>{item.label}</button>)}</div>{action === 'quote' ? <div className="seller-request-quote-fields"><label><span>Total quote</span><input type="number" min="1" step="0.01" value={quote} onChange={event => setQuote(event.target.value)} placeholder="0.00" /></label><label><span>Lead time (days)</span><input type="number" min="1" max="365" value={leadDays} onChange={event => setLeadDays(event.target.value)} placeholder="7" /></label></div> : null}<label className="seller-request-response-note"><span>{action === 'quote' ? 'Reply note (optional)' : action === 'decline' ? 'Reason' : 'Changes needed'}</span><textarea rows={3} maxLength={2000} value={response} onChange={event => setResponse(event.target.value)} /></label><button className={`seller-button ${action === 'decline' ? 'seller-button--danger' : 'seller-button--primary'}`} type="button" disabled={saving} onClick={() => void submitResponse()}>{saving ? <LoaderCircle className="seller-spin" /> : action === 'quote' ? <Send /> : action === 'request_changes' ? <Clock3 /> : <XCircle />}{saving ? 'Saving…' : action === 'quote' ? 'Send quote' : action === 'request_changes' ? 'Request changes' : 'Decline request'}</button></div>}
          {selected.conversation_id ? <button className="seller-request-message-link" type="button" onClick={() => navigate(`/artisan-dashboard/messages?conversation=${encodeURIComponent(selected.conversation_id!)}`)}><MessageCircle size={16} /> Open conversation</button> : null}
        </aside>
      </div>
    </div></div> : null}
  </div>;
}
