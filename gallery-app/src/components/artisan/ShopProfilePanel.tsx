import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Camera,
  Check,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  Mail,
  MapPin,
  Store,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ArtisanShop } from '../../types/artisan';
import { useArtisanPortal } from './artisanContextValue';
import { getShopProfileCompletion, makeShopProfileDraft, SHOP_PROFILE_LIMITS, validateShopProfile, type ShopProfileDraft } from './shopProfile';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';

type Feedback = { tone: 'success' | 'error'; text: string } | null;
type MediaKind = 'profile' | 'cover';

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export default function ShopProfilePanel() {
  const { shop, setShop } = useArtisanPortal();
  const [saved, setSaved] = useState<ShopProfileDraft>(() => makeShopProfileDraft(shop));
  const [draft, setDraft] = useState<ShopProfileDraft>(() => makeShopProfileDraft(shop));
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const objectUrls = useRef<string[]>([]);

  const validation = validateShopProfile(draft);
  const completion = getShopProfileCompletion(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved) || Boolean(profileFile || coverFile);
  const hasErrors = Object.keys(validation).length > 0;

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [isDirty]);

  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  const refreshShop = useCallback(async () => {
    const { data, error } = await supabase.from('shops').select('*').eq('id', shop.id).single();
    if (error || !data) return;
    const updatedShop = data as ArtisanShop;
    setShop(updatedShop);
    if (!isDirty) {
      const nextDraft = makeShopProfileDraft(updatedShop);
      setSaved(nextDraft);
      setDraft(nextDraft);
    }
  }, [isDirty, setShop, shop.id]);
  usePortalRealtimeRefresh(['shops'], refreshShop);

  function updateField(field: 'name' | 'description' | 'about' | 'location', value: string) {
    setDraft(current => ({ ...current, [field]: value }));
    setFeedback(null);
  }

  function selectImage(kind: MediaKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) {
      setFeedback({ tone: 'error', text: 'Choose a JPG, PNG, or WebP image no larger than 5 MB.' });
      return;
    }
    const preview = URL.createObjectURL(file);
    objectUrls.current.push(preview);
    if (kind === 'profile') {
      setProfileFile(file);
      setDraft(current => ({ ...current, image: preview }));
    } else {
      setCoverFile(file);
      setDraft(current => ({ ...current, banner: preview }));
    }
    setFeedback(null);
  }

  function removeImage(kind: MediaKind) {
    if (kind === 'profile') {
      setProfileFile(null);
      setDraft(current => ({ ...current, image: '' }));
    } else {
      setCoverFile(null);
      setDraft(current => ({ ...current, banner: '' }));
    }
    setFeedback(null);
  }

  function discardChanges() {
    setDraft(saved);
    setProfileFile(null);
    setCoverFile(null);
    setFeedback(null);
  }

  async function uploadImage(file: File, kind: MediaKind) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `shop/${shop.id}/${kind}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('products').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return supabase.storage.from('products').getPublicUrl(path).data.publicUrl;
  }

  async function saveProfile() {
    if (hasErrors || !isDirty || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const [uploadedProfile, uploadedCover] = await Promise.all([
        profileFile ? uploadImage(profileFile, 'profile') : Promise.resolve(null),
        coverFile ? uploadImage(coverFile, 'cover') : Promise.resolve(null),
      ]);
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        about: draft.about.trim(),
        location: draft.location.trim(),
        image: uploadedProfile ?? (draft.image.startsWith('blob:') ? saved.image : draft.image),
        banner: uploadedCover ?? (draft.banner.startsWith('blob:') ? saved.banner : draft.banner),
      };
      const { data, error } = await supabase.from('shops').update(payload).eq('id', shop.id).select('*').single();
      if (error) throw error;
      const updatedShop = data as ArtisanShop;
      const nextDraft = makeShopProfileDraft(updatedShop);
      setShop(updatedShop);
      setSaved(nextDraft);
      setDraft(nextDraft);
      setProfileFile(null);
      setCoverFile(null);
      setFeedback({ tone: 'success', text: 'Your shop profile is live and up to date.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The profile could not be saved.';
      setFeedback({ tone: 'error', text: `${message} Your entered changes are still here.` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seller-profile">
      <div className="portal-action-bar">
        <Link className="seller-button seller-button--outline" to={`/shop/${shop.id}`} target="_blank" rel="noreferrer">
          <ExternalLink size={16} aria-hidden="true" /> View public shop
        </Link>
      </div>

      {feedback ? (
        <div className={`seller-profile__feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
          {feedback.tone === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{feedback.text}</span>
        </div>
      ) : null}

      <div className="seller-profile__grid">
        <aside className="seller-profile__aside">
          <section className="seller-card seller-profile-preview" aria-labelledby="profile-preview-title">
            <div className="seller-card__header">
              <div><h2 id="profile-preview-title">Storefront preview</h2><span className="seller-card__meta">Updates as you type</span></div>
            </div>
            <div className="seller-profile-preview__cover">
              {draft.banner ? <img src={draft.banner} alt="Shop cover preview" /> : <ImageIcon aria-hidden="true" />}
            </div>
            <div className="seller-profile-preview__body">
              <div className="seller-profile-preview__avatar">
                {draft.image ? <img src={draft.image} alt="Shop profile preview" /> : <Store aria-hidden="true" />}
              </div>
              <h3>{draft.name.trim() || 'Your shop name'}</h3>
              <p>{draft.description.trim() || 'Add a short tagline that tells shoppers what makes your work special.'}</p>
              <span><MapPin size={14} aria-hidden="true" /> {draft.location.trim() || 'Location not added'}</span>
            </div>
          </section>

          <section className="seller-card seller-profile-completion">
            <div className="seller-profile-completion__heading">
              <div><h2>Profile strength</h2><p>{completion.completed} of {completion.checks.length} essentials complete</p></div>
              <strong>{completion.percent}%</strong>
            </div>
            <div className="seller-profile-completion__track" aria-label={`${completion.percent}% profile complete`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion.percent}>
              <span style={{ width: `${completion.percent}%` }} />
            </div>
            <ul>
              {completion.checks.map(check => <li className={check.complete ? 'is-complete' : ''} key={check.label}><Check size={14} aria-hidden="true" /> {check.label}</li>)}
            </ul>
          </section>
        </aside>

        <main className="seller-profile__forms">
          <section className="seller-card seller-profile-section">
            <div className="seller-profile-section__heading"><div className="seller-profile-section__icon"><Camera aria-hidden="true" /></div><div><h2>Shop branding</h2><p>Use clear, high-quality images. JPG, PNG, or WebP up to 5 MB.</p></div></div>
            <div className="seller-profile-media seller-profile-media--cover">
              <div className="seller-profile-media__preview">{draft.banner ? <img src={draft.banner} alt="Current cover" /> : <ImageIcon aria-hidden="true" />}</div>
              <div><h3>Cover photo</h3><p>Recommended landscape image, at least 1400 × 420 pixels.</p><div className="seller-profile-media__actions"><label className="seller-button seller-button--secondary"><Upload size={15} /> {draft.banner ? 'Replace' : 'Upload'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => selectImage('cover', event)} /></label>{draft.banner ? <button className="seller-button seller-button--ghost-danger" type="button" onClick={() => removeImage('cover')}><Trash2 size={15} /> Remove</button> : null}</div></div>
            </div>
            <div className="seller-profile-media">
              <div className="seller-profile-media__preview seller-profile-media__preview--avatar">{draft.image ? <img src={draft.image} alt="Current profile" /> : <Store aria-hidden="true" />}</div>
              <div><h3>Profile photo</h3><p>A square logo or product image works best.</p><div className="seller-profile-media__actions"><label className="seller-button seller-button--secondary"><Upload size={15} /> {draft.image ? 'Replace' : 'Upload'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => selectImage('profile', event)} /></label>{draft.image ? <button className="seller-button seller-button--ghost-danger" type="button" onClick={() => removeImage('profile')}><Trash2 size={15} /> Remove</button> : null}</div></div>
            </div>
          </section>

          <section className="seller-card seller-profile-section">
            <div className="seller-profile-section__heading"><div className="seller-profile-section__icon"><Store aria-hidden="true" /></div><div><h2>Shop identity</h2><p>The essentials customers see across your storefront and listings.</p></div></div>
            <div className="seller-profile-fields">
              <label><span>Shop name <b>*</b><small>{draft.name.length}/{SHOP_PROFILE_LIMITS.name}</small></span><input value={draft.name} maxLength={SHOP_PROFILE_LIMITS.name + 1} onChange={event => updateField('name', event.target.value)} aria-invalid={Boolean(validation.name)} aria-describedby={validation.name ? 'shop-name-error' : undefined} />{validation.name ? <em id="shop-name-error">{validation.name}</em> : null}</label>
              <label><span>Storefront tagline <small>{draft.description.length}/{SHOP_PROFILE_LIMITS.description}</small></span><textarea rows={3} value={draft.description} maxLength={SHOP_PROFILE_LIMITS.description + 1} placeholder="Describe your craft in one compelling sentence." onChange={event => updateField('description', event.target.value)} aria-invalid={Boolean(validation.description)} />{validation.description ? <em>{validation.description}</em> : <small className="seller-profile-field-help">Appears below your shop name and in the profile preview.</small>}</label>
              <label className="seller-profile-readonly"><span>Contact email</span><div><Mail size={16} aria-hidden="true" /> {shop.email || 'No contact email available'}</div><small className="seller-profile-field-help">Linked to your seller account and shown as your contact address.</small></label>
            </div>
          </section>

          <section className="seller-card seller-profile-section">
            <div className="seller-profile-section__heading"><div className="seller-profile-section__icon"><ImageIcon aria-hidden="true" /></div><div><h2>Your story</h2><p>Help buyers connect with your process, materials, and purpose.</p></div></div>
            <div className="seller-profile-fields"><label><span>About the shop <small>{draft.about.length}/{SHOP_PROFILE_LIMITS.about}</small></span><textarea rows={8} value={draft.about} maxLength={SHOP_PROFILE_LIMITS.about + 1} placeholder="Share how the shop began, what inspires you, and how your pieces are made." onChange={event => updateField('about', event.target.value)} aria-invalid={Boolean(validation.about)} />{validation.about ? <em>{validation.about}</em> : <small className="seller-profile-field-help">Aim for at least 80 characters for a more complete profile.</small>}</label></div>
          </section>

          <section className="seller-card seller-profile-section">
            <div className="seller-profile-section__heading"><div className="seller-profile-section__icon"><MapPin aria-hidden="true" /></div><div><h2>Location</h2><p>Show customers where your craft comes from.</p></div></div>
            <div className="seller-profile-fields"><label><span>City, region, and country <small>{draft.location.length}/{SHOP_PROFILE_LIMITS.location}</small></span><input value={draft.location} maxLength={SHOP_PROFILE_LIMITS.location + 1} placeholder="e.g. Manila, Philippines" onChange={event => updateField('location', event.target.value)} aria-invalid={Boolean(validation.location)} />{validation.location ? <em>{validation.location}</em> : null}</label></div>
            {draft.location.trim() ? <button className="seller-profile-map-toggle" type="button" onClick={() => setShowMap(current => !current)}>{showMap ? 'Hide map preview' : 'Preview on map'}</button> : null}
            {showMap && draft.location.trim() ? <div className="seller-profile-map"><iframe title="Shop location preview" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://maps.google.com/maps?q=${encodeURIComponent(draft.location)}&output=embed`} /></div> : null}
          </section>
        </main>
      </div>

      <div className="seller-profile-savebar" aria-live="polite">
        <div><strong>{isDirty ? 'You have unsaved changes' : 'All changes saved'}</strong><span>{hasErrors ? 'Fix the highlighted field before saving.' : isDirty ? 'Review the preview, then publish your updates.' : 'Your public shop matches this profile.'}</span></div>
        <div>{isDirty ? <button className="seller-button seller-button--secondary" type="button" disabled={saving} onClick={discardChanges}><Undo2 size={16} /> Discard</button> : null}<button className="seller-button seller-button--primary" type="button" disabled={!isDirty || hasErrors || saving} onClick={saveProfile}>{saving ? <LoaderCircle className="seller-spin" size={17} /> : <Check size={17} />} {saving ? 'Saving…' : 'Save profile'}</button></div>
      </div>
    </div>
  );
}
