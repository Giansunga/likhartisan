import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { getPattern } from '../freeform/decor';
import { getFinishDefinition } from '../freeform/materials';
import type { DesignRequest, DesignRequestMessagePayload } from '../../types/designRequest';
import { isDesignRequestMessage, REQUEST_STATUS_LABELS } from '../../types/designRequest';

export default function DesignMessageCard({ data, audience = 'buyer' }: { data: Record<string, unknown>; audience?: 'buyer' | 'artisan' }) {
  const requestPayload = isDesignRequestMessage(data) ? data as DesignRequestMessagePayload : null;
  const requestId = requestPayload?.request_id;
  const [request, setRequest] = useState<DesignRequest | null>(null);
  const [loading, setLoading] = useState(Boolean(requestPayload));
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!requestId) return;
    let active = true;
    const load = async () => {
      const { data: row } = await supabase.from('design_requests').select('*').eq('id', requestId).maybeSingle();
      if (active) { setRequest(row as DesignRequest | null); setLoading(false); }
    };
    void load();
    const channel = supabase.channel(`design-request-card:${requestId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'design_requests', filter: `id=eq.${requestId}` }, payload => { if (active) setRequest(payload.new as DesignRequest); }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [requestId]);

  async function approveQuote() {
    if (!request || approving) return;
    setApproving(true);
    const { data: updated, error } = await supabase.rpc('approve_design_request', { p_request_id: request.id });
    setApproving(false);
    if (error) { toast.error(error.message); return; }
    setRequest(updated as DesignRequest); toast.success('Quote approved. Your custom order was created.');
  }

  if (requestPayload) {
    const summary = request?.design_snapshot || null;
    const status = request?.status || requestPayload.status || requestPayload.summary?.status || 'pending';
    return <div className="chat-design-request-card">
      <div className="chat-design-request-card__head"><span style={{ background: summary?.material.color || requestPayload.summary?.color || '#BE734F' }}>{summary?.model.thumbnail ? <img src={summary.model.thumbnail} alt="" /> : <span>3D</span>}</span><div><small>CUSTOM DESIGN REQUEST</small><strong>{summary?.model.name || requestPayload.summary?.model || 'Custom pottery'}</strong><b className={`is-${status}`}>{REQUEST_STATUS_LABELS[status]}</b></div></div>
      {loading ? <div className="chat-design-request-loading"><LoaderCircle className="seller-spin" /> Loading request…</div> : request && summary ? <>
        <dl><div><dt>Finish</dt><dd>{getFinishDefinition(summary.material.finish).label}</dd></div><div><dt>Pattern</dt><dd>{getPattern(summary.decoration.patternId)?.name || 'None'}</dd></div><div><dt>Quantity</dt><dd>{request.quantity}</dd></div><div><dt>Dimensions</dt><dd>H {summary.dimensions.heightCm} · W {summary.dimensions.widthCm} cm</dd></div></dl>
        {request.status === 'quoted' ? <div className="chat-design-quote"><span><small>TOTAL QUOTE</small><strong>₱{Number(request.quoted_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span><span><small>LEAD TIME</small><strong>{request.lead_time_days} days</strong></span>{request.shop_response ? <p>{request.shop_response}</p> : null}</div> : request.shop_response ? <p className="chat-design-response">{request.shop_response}</p> : null}
        {audience === 'buyer' && request.status === 'quoted' ? <button type="button" className="chat-design-approve" disabled={approving} onClick={() => void approveQuote()}>{approving ? <LoaderCircle className="seller-spin" /> : <CheckCircle2 />} {approving ? 'Approving…' : 'Approve Quote'}</button> : null}
        {audience === 'artisan' ? <a className="chat-design-open" href={`/artisan-dashboard/requests?requestId=${encodeURIComponent(request.id)}`}><ExternalLink size={14} /> Open in Requests</a> : null}
        {request.status === 'approved' && request.order_id ? <a className="chat-design-open" href={audience === 'artisan' ? `/artisan-dashboard/orders?orderId=${encodeURIComponent(request.order_id)}` : '/dashboard'}><CheckCircle2 size={14} /> View approved order</a> : null}
      </> : <p className="chat-design-response">This request is no longer available.</p>}
    </div>;
  }

  const design = data.design as { model?: string; shape?: Record<string, unknown>; material?: Record<string, unknown>; decor?: Record<string, unknown> } | undefined;
  if (!design) return null;
  const shape = design.shape || {}; const material = design.material || {}; const decor = design.decor || {};
  const color = typeof material.color === 'string' ? material.color : '#BE734F';
  const height = typeof shape.height === 'number' || typeof shape.height === 'string' ? shape.height : '—';
  const width = typeof shape.bodyWidth === 'number' || typeof shape.bodyWidth === 'string' ? shape.bodyWidth : '—';
  const patternId = typeof decor.patternId === 'string' ? decor.patternId : '';
  return <div className="chat-product-card chat-design-legacy-card"><div className="chat-product-img" style={{ background: color }}><span>3D</span></div><div className="chat-product-info"><span className="chat-product-name">{design.model || 'Custom Design'}</span><span className="chat-product-variant">{getFinishDefinition(material.finish).label} · H {height}cm · W {width}cm</span><span className="chat-product-variant">Pattern: {getPattern(patternId)?.name || 'None'}</span></div></div>;
}
