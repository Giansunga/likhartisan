import { useState } from 'react';
import { CheckCircle2, ChevronLeft, LoaderCircle, Send, Store, X } from 'lucide-react';
import { getPattern } from './decor';
import { getFinishDefinition } from './materials';
import FreeformViewer from './FreeformViewer';
import type { DesignRequestSnapshotV1 } from '../../types/designRequest';
import { useOverlayA11y } from '../artisan/useOverlayA11y';

export type RequestShop = { id: string; name: string; image?: string; location?: string };

export default function SendDesignRequestModal({
  open, shops, selectedShopId, snapshot, submitting, successConversationId,
  revisionMode = false, initialQuantity = 1, initialNote = '',
  onSelectShop, onSubmit, onClose, onOpenMessages,
}: {
  open: boolean;
  shops: RequestShop[];
  selectedShopId: string | null;
  snapshot: DesignRequestSnapshotV1 | null;
  submitting: boolean;
  successConversationId: string | null;
  revisionMode?: boolean;
  initialQuantity?: number;
  initialNote?: string;
  onSelectShop: (shop: RequestShop) => void;
  onSubmit: (quantity: number, note: string) => void;
  onClose: () => void;
  onOpenMessages: () => void;
}) {
  const [changingShop, setChangingShop] = useState(!selectedShopId && !revisionMode);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [note, setNote] = useState(initialNote);
  const panelRef = useOverlayA11y(open, onClose, submitting);
  if (!open || !snapshot) return null;
  const shop = shops.find(item => item.id === selectedShopId) || null;
  const pattern = getPattern(snapshot.decoration.patternId)?.name || 'None';

  return (
    <div className="freeform-modal-overlay freeform-request-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <div ref={panelRef} className="freeform-request-modal" role="dialog" aria-modal="true" aria-labelledby="send-request-title" tabIndex={-1}>
        <button type="button" className="freeform-request-close" onClick={onClose} disabled={submitting} aria-label="Close send to shop"><X size={19} /></button>
        {successConversationId ? (
          <div className="freeform-request-success">
            <CheckCircle2 size={54} aria-hidden="true" />
            <h2 id="send-request-title">{revisionMode ? 'Revision sent successfully' : 'Design sent successfully'}</h2>
            <p>{shop?.name || 'The shop'} received your {revisionMode ? 'revised' : 'interactive'} design.</p>
            <div><button type="button" className="freeform-tab-btn-outline" onClick={onClose}>Continue designing</button><button type="button" className="freeform-save-btn" onClick={onOpenMessages}>Open Messages</button></div>
          </div>
        ) : (changingShop || !shop) && !revisionMode ? (
          <div className="freeform-request-shop-step">
            <div className="freeform-request-heading"><Store size={25} /><div><h2 id="send-request-title">Choose a shop</h2><p>Select the artisan shop that should quote this design.</p></div></div>
            <div className="freeform-request-shop-list">
              {shops.map(item => <button type="button" key={item.id} onClick={() => { onSelectShop(item); setChangingShop(false); }}>
                <span className="freeform-request-shop-avatar">{item.image ? <img src={item.image} alt="" /> : item.name.slice(0, 1)}</span>
                <span><strong>{item.name}</strong><small>{item.location || 'Pottery artisan shop'}</small></span>
              </button>)}
            </div>
            {shop ? <button type="button" className="freeform-request-back" onClick={() => setChangingShop(false)}><ChevronLeft size={16} /> Back to review</button> : null}
          </div>
        ) : shop ? (
          <>
            <header className="freeform-request-heading"><Send size={24} /><div><h2 id="send-request-title">{revisionMode ? 'Send revised design' : 'Send design to shop'}</h2><p>Review the immutable design snapshot before {revisionMode ? 'submitting this revision' : 'requesting a quote'}.</p></div></header>
            <div className="freeform-request-layout">
              <div className="freeform-request-preview" aria-label="3D design preview">
                <FreeformViewer modelFile={snapshot.model.file} shapeParams={snapshot.shape} materialParams={snapshot.material} decorationParams={snapshot.decoration} attachmentParams={snapshot.attachments} showAttachmentSockets={false} onMorphDetected={() => {}} preview />
              </div>
              <div className="freeform-request-form">
                <div className="freeform-request-selected-shop"><span className="freeform-request-shop-avatar">{shop.image ? <img src={shop.image} alt="" /> : shop.name.slice(0, 1)}</span><span><small>{revisionMode ? 'REVISION FOR' : 'SENDING TO'}</small><strong>{shop.name}</strong></span>{revisionMode ? null : <button type="button" onClick={() => setChangingShop(true)}>Change</button>}</div>
                <dl className="freeform-request-specs">
                  <div><dt>Model</dt><dd>{snapshot.model.name}</dd></div>
                  <div><dt>Finish</dt><dd><i style={{ background: snapshot.material.color }} />{getFinishDefinition(snapshot.material.finish).label}</dd></div>
                  <div><dt>Pattern</dt><dd>{pattern}</dd></div>
                  <div><dt>Attachments</dt><dd>{snapshot.attachments.length || 'None'}</dd></div>
                  <div><dt>Dimensions</dt><dd>H {snapshot.dimensions.heightCm} cm · W {snapshot.dimensions.widthCm} cm</dd></div>
                </dl>
                <div className="freeform-request-estimate"><span><small>ESTIMATED PRICE</small><strong>₱{snapshot.estimate.price.toLocaleString()}</strong></span><span><small>EST. PRODUCTION</small><strong>{snapshot.estimate.productionDays} days</strong></span><p>Final price and timing are set by the shop.</p></div>
                <label className="freeform-request-field"><span>Quantity</span><input type="number" min={1} max={100} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
                <label className="freeform-request-field"><span>Note <small>(optional)</small></span><textarea rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder="Tell the shop anything important about this piece…" /><small>{note.length}/2000</small></label>
              </div>
            </div>
            <footer className="freeform-request-actions"><button type="button" className="freeform-tab-btn-outline" onClick={onClose} disabled={submitting}>Cancel</button><button type="button" className="freeform-save-btn" disabled={submitting} onClick={() => onSubmit(quantity, note)}>{submitting ? <><LoaderCircle className="seller-spin" size={17} /> Sending…</> : <><Send size={17} /> {revisionMode ? 'Send Revision' : 'Send Request'}</>}</button></footer>
          </>
        ) : null}
      </div>
    </div>
  );
}
