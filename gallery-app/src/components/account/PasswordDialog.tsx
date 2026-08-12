import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

interface PasswordDialogProps {
  email: string;
  onClose: () => void;
}

type PasswordField = 'current' | 'next' | 'confirm';

export default function PasswordDialog({ email, onClose }: PasswordDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const loadingRef = useRef(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loadingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  function toggleVisibility(field: PasswordField) {
    setVisible(current => ({ ...current, [field]: !current[field] }));
  }

  async function submitPassword() {
    setError('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Complete all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Choose a password different from your current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (signInError) throw new Error('Your current password is incorrect.');
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      toast.success('Password updated successfully.');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update your password.');
    } finally {
      setLoading(false);
    }
  }

  const fields: Array<{ id: string; label: string; field: PasswordField; value: string; setValue: (value: string) => void; autoComplete: string }> = [
    { id: 'account-current-password', label: 'Current password', field: 'current', value: currentPassword, setValue: setCurrentPassword, autoComplete: 'current-password' },
    { id: 'account-new-password', label: 'New password', field: 'next', value: newPassword, setValue: setNewPassword, autoComplete: 'new-password' },
    { id: 'account-confirm-password', label: 'Confirm new password', field: 'confirm', value: confirmPassword, setValue: setConfirmPassword, autoComplete: 'new-password' },
  ];

  return (
    <div className="account-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <div ref={dialogRef} className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-password-title">
        <div className="account-dialog__heading">
          <span><KeyRound size={21} aria-hidden="true" /></span>
          <div><h2 id="account-password-title">Change password</h2><p>Confirm your current password before choosing a new one.</p></div>
          <button ref={closeRef} type="button" aria-label="Close password dialog" disabled={loading} onClick={onClose}><X size={19} aria-hidden="true" /></button>
        </div>

        {error ? <div className="account-dialog__error" role="alert">{error}</div> : null}

        <div className="account-password-fields">
          {fields.map(field => (
            <label key={field.id} htmlFor={field.id}>
              <span>{field.label}</span>
              <div>
                <input
                  id={field.id}
                  type={visible[field.field] ? 'text' : 'password'}
                  autoComplete={field.autoComplete}
                  value={field.value}
                  onChange={event => field.setValue(event.target.value)}
                />
                <button type="button" aria-label={`${visible[field.field] ? 'Hide' : 'Show'} ${field.label.toLowerCase()}`} onClick={() => toggleVisibility(field.field)}>
                  {visible[field.field] ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </label>
          ))}
        </div>

        <div className="account-dialog__actions">
          <button type="button" className="account-button account-button--secondary" disabled={loading} onClick={onClose}>Cancel</button>
          <button type="button" className="account-button account-button--primary" disabled={loading} onClick={() => void submitPassword()}>
            {loading ? <><LoaderCircle className="account-spin" size={17} aria-hidden="true" /> Updating…</> : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}
