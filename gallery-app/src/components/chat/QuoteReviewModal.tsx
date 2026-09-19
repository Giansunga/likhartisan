import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { checkoutDesignOrder } from '../../lib/designQuoteCheckout';
import { formatInches } from '../../lib/measurements';
import { normalizeDesignRequestSnapshot, type DesignRequest } from '../../types/designRequest';
import { getFinishDefinition } from '../freeform/materials';
import { getPattern } from '../freeform/decor';
import './quoteReview.css';

export default function QuoteReviewModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const [request, setRequest] = useState<DesignRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('design_requests').select('*').eq('id', requestId).maybeSingle();
    setRequest(data as DesignRequest | null);
    if (loadError) setError('Unable to load this quote. Please try again.');
    setLoading(false);
  }

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    queueMicrotask(() => { void load(); });
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
    // A new request remounts the modal through its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && !busyRef.current) onClose();
    if (event.key !== 'Tab') return;
    const controls = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function pay(orderId: string) {
    try {
      await checkoutDesignOrder(orderId);
    } catch (cause) {
      setError(`${(cause as Error).message} Your approval is saved. Use Pay now when ready.`);
      await load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function approve() {
    if (!request || busyRef.current || request.status !== 'quoted') return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const { data, error: approvalError } = await supabase.rpc('approve_design_request', { p_request_id: request.id });
    if (approvalError) {
      setError(approvalError.message);
      busyRef.current = false;
      setBusy(false);
      await load();
      return;
    }
    const approved = data as DesignRequest;
    setRequest(approved);
    if (approved.order_id) await pay(approved.order_id);
    else {
      setError('Quote approved, but the order could not be found. Reopen this quote to check its status.');
      busyRef.current = false;
      setBusy(false);
    }
  }

  function resumePayment() {
    if (!request?.order_id || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    void pay(request.order_id);
  }

  const snapshot = request?.design_snapshot ? normalizeDesignRequestSnapshot(request.design_snapshot) : null;
  const conversationUrl = request?.conversation_id ? `/chat?conversation=${encodeURIComponent(request.conversation_id)}` : '/chat';
  return createPortal(<div className="quote-review-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busyRef.current) onClose(); }}>
    <section className="quote-review" role="dialog" aria-modal="true" aria-labelledby="quote-review-title" onKeyDown={onKeyDown}>
      <header><div><span className="quote-review-eyebrow">CUSTOM DESIGN REQUEST</span><h2 id="quote-review-title">Review shop quote</h2></div><button ref={closeRef} type="button" className="quote-review-close" aria-label="Close quote review" disabled={busy} onClick={onClose}><X size={20} /></button></header>
      <div className="quote-review-body">
        {loading ? <p role="status" className="quote-review-state"><LoaderCircle className="seller-spin" /> Loading quote…</p> : !request ? <p className="quote-review-state">This design request is no longer available.</p> : <>
          {snapshot ? <div className="quote-review-design"><div className="quote-review-image" style={{ background: snapshot.material.color || '#be734f' }}>{snapshot.model.thumbnail ? <img src={snapshot.model.thumbnail} alt="" /> : <span>3D</span>}</div><div><strong>{snapshot.model.name || 'Custom pottery'}</strong><span>{getFinishDefinition(snapshot.material.finish).label} · {getPattern(snapshot.decoration.patternId)?.name || 'No pattern'}</span><span>H {formatInches(snapshot.dimensions.heightIn)} · W {formatInches(snapshot.dimensions.widthIn)}</span></div></div> : null}
          <div className="quote-review-details"><div><span>Quantity</span><strong>{request.quantity}</strong></div><div><span>Quoted total</span><strong>₱{Number(request.quoted_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div><div><span>Lead time</span><strong>{request.lead_time_days ? `${request.lead_time_days} days` : '—'}</strong></div></div>
          {request.shop_response ? <div className="quote-review-response"><span>Shop response</span><p>{request.shop_response}</p></div> : null}
          {request.status === 'changes_requested' || request.status === 'pending' ? <p className="quote-review-state">This quote has changed and is no longer ready for approval. Check Messages for the latest update.</p> : null}
          {request.status === 'declined' ? <p className="quote-review-state">This design request was declined.</p> : null}
          {request.status === 'approved' ? <p className="quote-review-state"><CheckCircle2 size={18} /> This quote has been approved.</p> : null}
        </>}
        {error ? <p className="quote-review-error" role="alert">{error}</p> : null}
      </div>
      <footer><Link to={conversationUrl} onClick={onClose}>Open conversation</Link>{request?.status === 'quoted' ? <button type="button" disabled={busy || loading} onClick={() => void approve()}>{busy ? 'Opening payment…' : 'Approve Quote & Pay'}</button> : request?.status === 'approved' && request.order_id ? <button type="button" disabled={busy} onClick={resumePayment}>{busy ? 'Opening payment…' : 'Pay now'}</button> : null}</footer>
    </section>
  </div>, document.body);
}
