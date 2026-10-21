import { Popup } from '../Popup';
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmDanger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmDanger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return <Popup open={open} title={title} message={message} confirmLabel={confirmLabel} danger={confirmDanger} onConfirm={onConfirm} onCancel={onCancel} />;
}
