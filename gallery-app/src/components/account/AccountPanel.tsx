import { useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Camera,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { geocodeAddress } from '../../lib/geocoder';
import PasswordDialog from './PasswordDialog';
import {
  accountProfileFromUser,
  isAccountDraftDirty,
  maskEmail,
  normalizeAccountDraft,
  profileToDraft,
  validateAccountDraft,
  validateAvatarFile,
  type AccountFieldErrors,
  type AccountProfile,
  type AccountProfileDraft,
} from './accountProfile';
import './AccountPanel.css';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type AvatarStatus = 'idle' | 'uploading' | 'saved' | 'error';

function AccountPanelContent({ user }: { user: User }) {
  const initialProfile = useMemo(() => accountProfileFromUser(user), [user]);
  const [savedProfile, setSavedProfile] = useState<AccountProfile>(initialProfile);
  const [draft, setDraft] = useState<AccountProfileDraft>(() => profileToDraft(initialProfile));
  const [errors, setErrors] = useState<AccountFieldErrors>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>('idle');
  const [avatarMessage, setAvatarMessage] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = isAccountDraftDirty(draft, savedProfile);
  const completedFields = [draft.fullName, draft.phone, draft.address].filter(value => value.trim()).length;

  function updateField(field: keyof AccountProfileDraft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
    setSaveStatus('idle');
    setSaveMessage('');
  }

  async function saveProfile() {
    const normalized = normalizeAccountDraft(draft);
    const nextErrors = validateAccountDraft(normalized);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSaveStatus('error');
      setSaveMessage('Review the highlighted fields.');
      return;
    }

    setSaveStatus('saving');
    setSaveMessage('Saving your account details…');
    const addressChanged = normalized.address !== savedProfile.address;
    let addressLat = savedProfile.addressLat;
    let addressLng = savedProfile.addressLng;

    if (addressChanged) {
      addressLat = null;
      addressLng = null;
      if (normalized.address) {
        try {
          const coordinates = await geocodeAddress(normalized.address);
          if (coordinates) {
            addressLat = coordinates.lat;
            addressLng = coordinates.lng;
          }
        } catch (error) {
          console.warn('Account address geocoding failed; checkout will retry.', error);
        }
      }
    }

    const { data, error } = await supabase.auth.updateUser({
      data: {
        name: normalized.fullName,
        phone: normalized.phone,
        address: normalized.address,
        address_lat: addressLat,
        address_lng: addressLng,
        avatar_url: savedProfile.avatarUrl,
      },
    });

    if (error) {
      setSaveStatus('error');
      setSaveMessage(error.message || 'Could not save your changes.');
      return;
    }

    const nextProfile = data.user
      ? accountProfileFromUser(data.user)
      : { ...savedProfile, ...normalized, addressLat, addressLng };
    setSavedProfile(nextProfile);
    setDraft(profileToDraft(nextProfile));
    setErrors({});
    setSaveStatus('saved');
    setSaveMessage(addressChanged && normalized.address && addressLat === null
      ? 'Saved. Your address pin will be confirmed again during checkout.'
      : 'Your account details are up to date.');
    toast.success('Account details saved.');
  }

  function discardChanges() {
    setDraft(profileToDraft(savedProfile));
    setErrors({});
    setSaveStatus('idle');
    setSaveMessage('');
    setShowDiscardDialog(false);
  }

  async function uploadAvatar(file: File) {
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setAvatarStatus('error');
      setAvatarMessage(validationError);
      return;
    }

    setAvatarStatus('uploading');
    setAvatarMessage('Uploading your new profile photo…');
    try {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `avatars/${user.id}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('products').getPublicUrl(path);
      const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;
      const { data, error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
      if (updateError) throw updateError;

      const nextProfile = data.user
        ? accountProfileFromUser(data.user)
        : { ...savedProfile, avatarUrl };
      setSavedProfile(nextProfile);
      setAvatarStatus('saved');
      setAvatarMessage('Profile photo updated.');
      toast.success('Profile photo updated.');
    } catch (error) {
      setAvatarStatus('error');
      setAvatarMessage(error instanceof Error ? error.message : 'Could not upload your profile photo.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <section className="account-panel" aria-labelledby="account-page-title">
      <header className="account-panel__header">
        <div><h1 id="account-page-title">My Account</h1><p>Keep your profile and delivery details accurate for a smoother checkout.</p></div>
        <span className="account-profile-completion"><Check size={14} aria-hidden="true" /> {completedFields} of 3 details complete</span>
      </header>

      <section className="account-hero" aria-label="Profile overview">
        <div className="account-avatar-wrap">
          <button
            type="button"
            className="account-avatar-button"
            aria-label="Change profile photo"
            disabled={avatarStatus === 'uploading'}
            onClick={() => fileInputRef.current?.click()}
          >
            {savedProfile.avatarUrl ? <img src={savedProfile.avatarUrl} alt="" /> : <span>{draft.fullName.charAt(0).toUpperCase() || 'U'}</span>}
            <i>{avatarStatus === 'uploading' ? <LoaderCircle className="account-spin" size={19} aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}</i>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="account-visually-hidden"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose profile photo"
            onChange={event => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); }}
          />
        </div>
        <div className="account-hero__identity">
          <h2>{draft.fullName || 'Add your name'}</h2>
          <div><Mail size={14} aria-hidden="true" /><span>{showEmail ? savedProfile.email : maskEmail(savedProfile.email)}</span><button type="button" onClick={() => setShowEmail(current => !current)}>{showEmail ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />} {showEmail ? 'Hide' : 'Show'}</button></div>
          <p>JPG, PNG, or WebP · 5 MB maximum</p>
          {avatarMessage ? <span className={`account-status account-status--${avatarStatus}`} aria-live="polite">{avatarMessage}</span> : null}
        </div>
      </section>

      <div className="account-settings-grid">
        <section className="account-card" aria-labelledby="account-personal-title">
          <div className="account-card__heading">
            <span><UserRound size={20} aria-hidden="true" /></span>
            <div><h2 id="account-personal-title">Personal details</h2><p>Used for order updates and courier coordination.</p></div>
          </div>
          <div className="account-fields">
            <label htmlFor="account-full-name">
              <span>Full name</span>
              <input id="account-full-name" autoComplete="name" value={draft.fullName} aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? 'account-full-name-error' : undefined} onChange={event => updateField('fullName', event.target.value)} />
              {errors.fullName ? <small id="account-full-name-error" role="alert">{errors.fullName}</small> : null}
            </label>
            <label htmlFor="account-phone">
              <span>Phone number <em>Optional</em></span>
              <div className="account-input-with-icon"><Phone size={16} aria-hidden="true" /><input id="account-phone" type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'account-phone-error' : undefined} onChange={event => updateField('phone', event.target.value)} /></div>
              {errors.phone ? <small id="account-phone-error" role="alert">{errors.phone}</small> : null}
            </label>
            <label htmlFor="account-email">
              <span>Email address <em>Read only</em></span>
              <div className="account-input-with-icon"><Mail size={16} aria-hidden="true" /><input id="account-email" value={showEmail ? savedProfile.email : maskEmail(savedProfile.email)} readOnly aria-readonly="true" /></div>
            </label>
          </div>
        </section>

        <section className="account-card" aria-labelledby="account-address-title">
          <div className="account-card__heading">
            <span><MapPin size={20} aria-hidden="true" /></span>
            <div><h2 id="account-address-title">Default delivery address</h2><p>Pre-filled when you request courier delivery.</p></div>
          </div>
          <div className="account-fields">
            <label htmlFor="account-address">
              <span>Full address <em>Optional</em></span>
              <textarea id="account-address" rows={5} autoComplete="street-address" placeholder="Street, barangay, municipality, province" value={draft.address} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'account-address-error' : 'account-address-help'} onChange={event => updateField('address', event.target.value)} />
              {errors.address ? <small id="account-address-error" role="alert">{errors.address}</small> : <small id="account-address-help">Checkout will confirm the exact delivery pin and courier fee.</small>}
            </label>
          </div>
        </section>
      </div>

      <section className="account-card account-security" aria-labelledby="account-security-title">
        <div className="account-card__heading">
          <span><ShieldCheck size={20} aria-hidden="true" /></span>
          <div><h2 id="account-security-title">Password and security</h2><p>Your current password is required before it can be changed.</p></div>
        </div>
        <div className="account-security__action"><div><LockKeyhole size={18} aria-hidden="true" /><span><strong>Password</strong><small>Use at least 8 characters and avoid reusing passwords.</small></span></div><button type="button" className="account-button account-button--secondary" onClick={() => setShowPasswordDialog(true)}><KeyRound size={16} aria-hidden="true" /> Change password</button></div>
      </section>

      <footer className="account-savebar">
        <div className={`account-savebar__status account-savebar__status--${saveStatus}`} aria-live="polite">
          {saveStatus === 'saving' ? <LoaderCircle className="account-spin" size={17} aria-hidden="true" /> : saveStatus === 'saved' ? <Check size={17} aria-hidden="true" /> : saveStatus === 'error' ? <CircleAlert size={17} aria-hidden="true" /> : null}
          <span>{saveMessage || (dirty ? 'You have unsaved changes.' : 'Your saved details are shown above.')}</span>
        </div>
        <div><button type="button" className="account-button account-button--secondary" disabled={!dirty || saveStatus === 'saving'} onClick={() => setShowDiscardDialog(true)}>Discard</button><button type="button" className="account-button account-button--primary" disabled={!dirty || saveStatus === 'saving'} onClick={() => void saveProfile()}><Save size={16} aria-hidden="true" /> {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}</button></div>
      </footer>

      {showPasswordDialog ? <PasswordDialog email={savedProfile.email} onClose={() => setShowPasswordDialog(false)} /> : null}
      {showDiscardDialog ? (
        <div className="account-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowDiscardDialog(false); }}>
          <div className="account-dialog account-dialog--compact" role="alertdialog" aria-modal="true" aria-labelledby="account-discard-title" aria-describedby="account-discard-description">
            <h2 id="account-discard-title">Discard unsaved changes?</h2>
            <p id="account-discard-description">Your profile will return to the last saved details.</p>
            <div className="account-dialog__actions"><button type="button" className="account-button account-button--secondary" onClick={() => setShowDiscardDialog(false)}>Keep editing</button><button type="button" className="account-button account-button--danger" onClick={discardChanges}>Discard changes</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function AccountPanel() {
  const { user, loading } = useAuth();

  if (loading) {
    return <section className="account-panel account-panel--loading" aria-busy="true" aria-label="Loading account"><div className="account-skeleton account-skeleton--title" /><div className="account-skeleton account-skeleton--hero" /><div className="account-skeleton account-skeleton--card" /></section>;
  }

  if (!user) {
    return (
      <section className="account-panel account-panel--signed-out">
        <span><UserRound size={28} aria-hidden="true" /></span><h1>Sign in to manage your account</h1><p>Your profile, saved address, and security settings are available after signing in.</p><button type="button" className="account-button account-button--primary" onClick={() => window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }))}>Sign in</button>
      </section>
    );
  }

  return <AccountPanelContent key={`${user.id}:${user.updated_at || ''}`} user={user as User} />;
}
