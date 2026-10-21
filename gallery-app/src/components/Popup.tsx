import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { dismissPopup, nextPopupId, registerPopupSlot, usePopupRequests, usePopupSlot, type PopupKind } from '../lib/popups';
import './popup.css';
interface Props { icon?: ReactNode; showClose?: boolean; className?: string; open?: boolean; title: string; message?: ReactNode; children?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean; confirmDisabled?: boolean; kind?: PopupKind; onConfirm: () => void | Promise<void>; onCancel?: () => void }
export function Popup({ open = true, ...props }: Props) { return open ? <OpenPopup {...props} /> : null; }
function OpenPopup({ icon, showClose = false, className = '', title, message, children, confirmLabel = 'Continue', cancelLabel = 'Cancel', danger = false, busy = false, confirmDisabled = false, kind = 'confirm', onConfirm, onCancel }: Omit<Props, 'open'>) {
  const [id] = useState(nextPopupId);
  const active = usePopupSlot() === id;
  const titleId = useId(); const descriptionId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [working, setWorking] = useState(false);
  const blocked = busy || working;
  useEffect(() => registerPopupSlot(id), [id]);
  useEffect(() => {
    if (!active || !ref.current) return;
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus();
    return () => { dialog.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, [active]);
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? CircleAlert : kind === 'info' ? Info : TriangleAlert;
  return <dialog ref={ref} className={`system-popup system-popup--${danger ? 'danger' : kind} ${className}`} aria-labelledby={titleId} aria-describedby={message ? descriptionId : undefined} aria-busy={blocked} onCancel={event => { event.preventDefault(); if (!blocked) (onCancel ?? onConfirm)(); }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex="0"]')];
    const first = buttons[0], last = buttons.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <header className="system-popup__heading">
      <div className="system-popup__icon" aria-hidden="true">{icon ?? <Icon size={27} aria-hidden="true" />}</div>
      <h2 id={titleId}>{title}</h2>
      {showClose && onCancel && <button type="button" className="system-popup__close" aria-label="Close popup" disabled={blocked} onClick={onCancel}>×</button>}
    </header>
    {message && <div id={descriptionId} className="system-popup__message">{message}</div>}
    {children && <fieldset className="system-popup__fields" disabled={blocked}>{children}</fieldset>}
    <div className="system-popup__actions">
      {onCancel && <button type="button" data-initial-focus disabled={blocked} onClick={onCancel}>{cancelLabel}</button>}
      <button type="button" data-initial-focus={onCancel ? undefined : true} className="system-popup__primary" disabled={blocked || confirmDisabled} onClick={async () => {
        if (submitting.current || blocked || confirmDisabled) return;
        submitting.current = true; setWorking(true);
        try { await onConfirm(); } finally { submitting.current = false; setWorking(false); }
      }}>{blocked ? 'Please wait…' : confirmLabel}</button>
    </div>
  </dialog>;
}
export default function PopupHost() {
  const requests = usePopupRequests();
  const item = requests[0];
  return item ? <Popup key={item.id} title={item.title} message={item.message} kind={item.kind} danger={item.danger} confirmLabel={item.kind === 'confirm' ? item.confirmLabel : 'Done'} onConfirm={() => dismissPopup(item.id, true)} onCancel={item.kind === 'confirm' ? () => dismissPopup(item.id) : undefined} /> : null;
}
