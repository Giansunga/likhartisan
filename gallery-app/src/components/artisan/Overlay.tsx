import { Popup } from '../Popup';
import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useOverlayA11y } from './useOverlayA11y';

interface OverlayProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  variant?: 'dialog' | 'drawer' | 'confirm';
}

export function SellerOverlay({ open, title, description, onClose, children, footer, busy = false, variant = 'dialog' }: OverlayProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useOverlayA11y(open, onClose, busy);

  if (!open) return null;
  return (
    <div className={`seller-overlay seller-overlay--${variant}`} onMouseDown={() => { if (!busy) onClose(); }}>
      <div
        ref={panelRef}
        className="seller-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="seller-overlay__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button type="button" className="seller-icon-button" onClick={onClose} disabled={busy} aria-label={`Close ${title}`}><X size={19} /></button>
        </header>
        <div className="seller-overlay__body">{children}</div>
        {footer ? <footer className="seller-overlay__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  danger?: boolean;
}

export function SellerConfirmDialog({ open, title, description, confirmLabel, onConfirm, onClose, busy, danger = true }: ConfirmDialogProps) {
  return <Popup open={open} title={title} message={description} confirmLabel={confirmLabel} danger={danger} busy={busy} onConfirm={onConfirm} onCancel={onClose} />;
}
