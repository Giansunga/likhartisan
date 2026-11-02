import AssetImage from '../AssetImage';
import FeaturedArtisanSelect from '../admin/FeaturedArtisanSelect';
import ProductTagsInput from '../admin/ProductTagsInput';
import { resolveProductTags, type ProductTagsDraft } from '../../lib/productTags';
import { useShopArtisans } from '../../hooks/useShopArtisans';
import { validateFeaturedArtisan } from '../../lib/featuredArtisan';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { uploadToR2 } from '../../lib/r2';
import { getErrorMessage } from '../../lib/portalErrors';
import { toast } from '../../lib/popups';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';
import { normalizeCatalogMeasurement } from '../../lib/measurements';
import { kgToGrams } from '../../lib/shipping';
import { PRODUCT_CATEGORIES } from '../../lib/utils';
import '../../pages/admin/product-create.css';
import './product-creation.css';
import { validateProductFile } from '../../lib/productFiles';

interface Shop {
  id: string;
  name: string;
  email: string;
}

interface VariationDraft {
  id: number;
  dimensions: string;
  height: string;
  openingDiameter: string;
  weightKg: string;
  price: string;
  stock: string;
}

interface CreationAttempt {
  id: string;
  variationIds: Map<number, string>;
  uploads: Map<File, string>;
}

function newVariation(id: number): VariationDraft {
  return { id, dimensions: '', height: '', openingDiameter: '', weightKg: '', price: '', stock: '' };
}

function hasValidVariation(variation: VariationDraft): boolean {
  const hasCatalogDimensions = /\d/.test(variation.dimensions) && /\d/.test(variation.height);
  const price = Number(variation.price || 0);
  const stock = Number(variation.stock || 0);
  return (kgToGrams(variation.weightKg) || 0) > 0 && hasCatalogDimensions
    && Number.isFinite(price) && price >= 0 && Number.isInteger(stock) && stock >= 0;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', border: '1.5px solid #E8E0D8', borderRadius: '10px',
  fontSize: '0.88rem', boxSizing: 'border-box', color: '#2C1810', background: '#FAF8F5',
  outline: 'none', transition: 'border-color 0.15s',
};

const inputFocusProps = {
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#823E0B'; },
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#E8E0D8'; },
};

const varInputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
  fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
  outline: 'none', transition: 'border-color 0.15s',
};

const varInputFocusProps = {
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#823E0B'; },
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#E8E0D8'; },
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: '16px', paddingBottom: '10px',
  borderBottom: '1px solid #F0EBE5',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#5A4A3E', marginBottom: '6px',
};

const varLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px',
};

interface Props {
  lockedShop?: { id: string; name: string; email?: string };
  listPath: string;
  onCreated?: () => Promise<void>;
}

export default function ProductCreateForm({ lockedShop, listPath, onCreated }: Props) {
  const navigate = useNavigate();
  const nextVariationId = useRef(1);
  const submitting = useRef(false);
  const creationAttempts = useRef(new Map<string, CreationAttempt>());
  const shopRequest = useRef(0);
  const [shops, setShops] = useState<Shop[]>(lockedShop ? [{ ...lockedShop, email: lockedShop.email || '' }] : []);
  const [form, setForm] = useState({
    name: '', category: '',
    materials: '', technique: '', shopId: lockedShop?.id || '', featuredArtisanId: '',
  });
  const artisanOptions = useShopArtisans(form.shopId);
  const artisanValid = !artisanOptions.loading && !artisanOptions.error && artisanOptions.artisans.some(artisan => artisan.id === form.featuredArtisanId);
  const [variations, setVariations] = useState<VariationDraft[]>([newVariation(0)]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [tagDraft, setTagDraft] = useState<ProductTagsDraft>({ tags: [], input: '' });
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [shopError, setShopError] = useState('');

  const refreshShops = useCallback(async () => {
    if (lockedShop) return;
    const request = ++shopRequest.current;
    setShopError('');
    try {
      const { data, error } = await supabase.from('shops').select('id, name, email').order('name');
      if (error) throw error;
      if (request === shopRequest.current) setShops(data || []);
    } catch (error) {
      if (request === shopRequest.current) setShopError(getErrorMessage(error, 'Shops could not be loaded.'));
    }
  }, [lockedShop]);

  const invalidateShopRequest = useCallback(() => { ++shopRequest.current; }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void refreshShops(); });
    return () => { active = false; invalidateShopRequest(); };
  }, [refreshShops, invalidateShopRequest]);

  usePortalRealtimeRefresh(['shops'], refreshShops);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (lockedShop && e.target.name === 'shopId') return;
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value, ...(e.target.name === 'shopId' ? { featuredArtisanId: '' } : {}) }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const error = validateProductFile(file, 'products');
      if (error) { setSubmitError(error); e.target.value = ''; return; }
      setSubmitError('');
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleGlbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const error = validateProductFile(file, 'models');
      if (error) { setSubmitError(error); e.target.value = ''; return; }
      setSubmitError('');
      setGlbFile(file);
    }
  };

  function addVariation() {
    setVariations(prev => [...prev, newVariation(nextVariationId.current++)]);
  }

  function updateVariation(index: number, field: keyof VariationDraft, value: string) {
    setVariations(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }

  function removeVariation(index: number) {
    setVariations(prev => prev.filter((_, i) => i !== index));
  }

  async function uploadFile(file: File): Promise<string> {
    const normalizedName = file.name.toLowerCase();
    const folder = normalizedName.endsWith('.glb') || normalizedName.endsWith('.gltf') ? 'models' : 'products';
    return lockedShop ? uploadToR2(file, folder, { shopId: lockedShop.id }) : uploadToR2(file, folder);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || submitted) return;
    const shop = shops.find(s => s.id === form.shopId);
    if (!shop) return;

    submitting.current = true;
    setLoading(true);
    setSubmitError('');

    try {
      if (lockedShop && form.shopId !== lockedShop.id) throw new Error('Products must belong to your shop.');
      for (const [file, folder] of [[imageFile, 'products'], [glbFile, 'models']] as const) {
        if (file) { const error = validateProductFile(file, folder); if (error) throw new Error(error); }
      }
      const resolvedTags = resolveProductTags(tagDraft);
      if (resolvedTags.error) throw new Error(resolvedTags.error);
      if (!artisanValid) throw new Error('Select a Featured Artisan for this shop.');
      if (!form.name.trim() || !form.category) throw new Error('Enter a product name and category.');
      await validateFeaturedArtisan(form.shopId, form.featuredArtisanId);
      if (variations.some((variation) => !hasValidVariation(variation))) {
        throw new Error('Every variation needs product weight plus length, width, and height, with a valid price and whole-number stock.');
      }
      // Retain identities across retries: a lost response must not create a
      // second product or a second copy of an already-persisted variation.
      let attempt = creationAttempts.current.get(form.shopId);
      if (!attempt) {
        attempt = { id: crypto.randomUUID(), variationIds: new Map(), uploads: new Map() };
        creationAttempts.current.set(form.shopId, attempt);
      }
      const uploadOnce = async (file: File) => {
        const existing = attempt.uploads.get(file);
        if (existing) return existing;
        const url = await uploadFile(file);
        attempt.uploads.set(file, url);
        return url;
      };
      const imageUrl = imageFile ? await uploadOnce(imageFile) : '/placeholder.svg';
      const model3dUrl = glbFile ? await uploadOnce(glbFile) : null;
      const totalStock = variations.reduce((sum, variation) => sum + Number(variation.stock || 0), 0);

      const { data: productData, error } = await supabase.from('products').upsert({
        id: attempt.id,
        name: form.name.trim(),
        description: '',
        category: form.category,
        tags: resolvedTags.tags,
        price: 0,
        stock: totalStock,
        image: imageUrl,
        model3d: model3dUrl,
        materials: form.materials,
        dimensions: '', height: '', opening_diameter: '', measurement_unit: 'in',
        technique: form.technique || 'Handcrafted & Kiln-Fired',
        shop_id: form.shopId,
        featured_artisan_id: form.featuredArtisanId,
        shop_name: shop.name,
        status: 'draft',
      }, { onConflict: 'id' }).select('id').single();
      if (error) throw error;
      if (productData?.id !== attempt.id) throw new Error('The product draft was not confirmed. Please try again.');

      const variationRows = variations.map((variation, sortOrder) => {
        let id = attempt.variationIds.get(variation.id);
        if (!id) { id = crypto.randomUUID(); attempt.variationIds.set(variation.id, id); }
        return {
          id, product_id: attempt.id,
          dimensions: normalizeCatalogMeasurement(variation.dimensions.trim() || 'N/A', 'in'),
          height: normalizeCatalogMeasurement(variation.height.trim() || 'N/A', 'in'),
          opening_diameter: normalizeCatalogMeasurement(variation.openingDiameter.trim() || 'N/A', 'in'),
          measurement_unit: 'in',
          weight_kg: variation.weightKg === '' ? null : Number(variation.weightKg),
          product_weight_g: kgToGrams(variation.weightKg),
          shipping_weight_g: kgToGrams(variation.weightKg),
          price: variation.price ? Number(variation.price) : null,
          stock: Number(variation.stock || 0), sort_order: sortOrder,
        };
      });
      if (variationRows.length) {
        const { data: savedVariations, error: variationError } = await supabase.from('product_variations')
          .upsert(variationRows, { onConflict: 'id' }).select('id');
        if (variationError) throw variationError;
        if (savedVariations?.length !== variationRows.length || !variationRows.every(row => savedVariations.some(saved => saved.id === row.id))) {
          throw new Error('Product variations were not confirmed. Your product is still a draft. Please try again.');
        }
      }
      const expectedIds = new Set(variationRows.map(row => row.id));
      const removedIds = [...attempt.variationIds.values()].filter(id => !expectedIds.has(id));
      if (removedIds.length) {
        const { error: removeError } = await supabase.from('product_variations').delete().eq('product_id', attempt.id).in('id', removedIds);
        if (removeError) throw removeError;
      }
      const { data: confirmedVariations, error: readError } = await supabase.from('product_variations').select('id,stock').eq('product_id', attempt.id);
      if (readError) throw readError;
      if (confirmedVariations?.length !== expectedIds.size || !confirmedVariations.every(row => expectedIds.has(row.id))) {
        throw new Error('The complete variation list could not be confirmed. Your product is still a draft. Please try again.');
      }
      const confirmedStock = confirmedVariations.reduce((sum, row) => sum + Number(row.stock || 0), 0);
      if (!Number.isSafeInteger(confirmedStock) || confirmedStock < 0) throw new Error('Product inventory could not be confirmed.');
      const { data: published, error: publishError } = await supabase.from('products')
        .update({ status: 'active', stock: confirmedStock }).eq('id', attempt.id).select('id,status,stock').maybeSingle();
      if (publishError) throw publishError;
      if (published?.id !== attempt.id || published.status !== 'active' || Number(published.stock) !== confirmedStock) {
        throw new Error('Publishing the product was not confirmed. Please retry to finish this draft.');
      }

      setSubmitted(true);
      if (onCreated) {
        try { await onCreated(); }
        catch { toast.error('Product created. Refresh listings to see the latest products.'); }
        navigate(listPath);
      } else setTimeout(() => navigate(listPath), 1500);
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Could not upload the product. Please try again.'));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const isValid = Boolean(form.name && form.category && form.shopId && artisanValid && !resolveProductTags(tagDraft).error && variations.every(hasValidVariation));

  return (
    <div className="product-create-page">
      {shopError && <div role="alert">{shopError} <button type="button" onClick={() => void refreshShops()}>Retry shops</button></div>}

      {submitted ? (
        <div style={{
          background: '#fff', borderRadius: '16px', padding: '48px', textAlign: 'center',
          border: '1px solid #E8E0D8', boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2" style={{ width: '48px', height: '48px', margin: '0 auto 16px' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#2E7D32', margin: '0 0 8px' }}>Product Uploaded!</h3>
          <p style={{ fontSize: '0.88rem', color: '#5A7D3A' }}>Redirecting to product list...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <fieldset className="product-create-fields" disabled={loading}>

          {/* Section: Product Information */}
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E8E0D8', padding: '28px 32px', marginBottom: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 style={sectionHeaderStyle}>Product Information</h3>
            <div className="product-create-info-grid">
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Product Name</label>
                <input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Ancient Vase"
                  style={inputStyle} {...inputFocusProps} />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select name="category" value={form.category} onChange={handleChange} required
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}>
                  <option value="">Select category</option>
                  {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Material</label>
                <input name="materials" value={form.materials} onChange={handleChange} placeholder="e.g. Terracotta Clay"
                  style={inputStyle} {...inputFocusProps} />
              </div>
              <div>
                <label style={labelStyle}>Technique</label>
                <input name="technique" value={form.technique} onChange={handleChange} placeholder="e.g. Handcrafted &amp; Kiln-Fired"
                  style={inputStyle} {...inputFocusProps} />
              </div>
              {!lockedShop && <div>
                <label style={labelStyle}>Assign to Shop</label>
                <select name="shopId" aria-label="Assign to Shop" value={form.shopId} onChange={handleChange} required disabled={Boolean(lockedShop)}
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}>
                  <option value="">Select artisan shop</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {shops.length === 0 && (
                  <p style={{ fontSize: '0.78rem', color: '#823E0B', marginTop: '6px' }}>No shops registered yet. Create a shop first.</p>
                )}
              </div>}
              <div style={{ gridColumn: '1 / -1' }}><ProductTagsInput value={tagDraft} onChange={setTagDraft} disabled={loading} /></div>
              <div style={{ gridColumn: '1 / -1' }}><FeaturedArtisanSelect shopId={form.shopId} value={form.featuredArtisanId} onChange={value => setForm(prev => ({ ...prev, featuredArtisanId: value }))} {...artisanOptions} disabled={loading} /></div>
            </div>
          </div>

          {/* Section: Variations */}
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E8E0D8', padding: '28px 32px', marginBottom: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 style={sectionHeaderStyle}>Variations</h3>

            {variations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                {variations.map((v, i) => (
                  <div key={v.id} style={{
                    border: '1.5px solid #E8E0D8', borderRadius: '12px', padding: '16px',
                    background: '#FAF8F5', position: 'relative',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 700, color: '#823E0B', textTransform: 'uppercase',
                        letterSpacing: '0.06em', background: 'rgba(130,62,11,0.08)', padding: '3px 10px',
                        borderRadius: '6px',
                      }}>Variation {i + 1}</span>
                      <button type="button" onClick={() => removeVariation(i)} style={{
                        background: 'none', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                        color: '#d32f2f', cursor: 'pointer', padding: '5px 12px', fontSize: '0.78rem',
                        fontWeight: 600, transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#d32f2f'; e.currentTarget.style.background = '#fdecea'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E0D8'; e.currentTarget.style.background = 'none'; }}
                      >Remove</button>
                    </div>
                    <div className="product-create-variation-grid">
                      <div>
                        <label style={varLabelStyle}>Dimensions</label>
                        <input value={v.dimensions} onChange={e => updateVariation(i, 'dimensions', e.target.value)} placeholder="e.g. 6 in × 4 in"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                      <div>
                        <label style={varLabelStyle}>Height</label>
                        <input value={v.height} onChange={e => updateVariation(i, 'height', e.target.value)} placeholder="e.g. 8 in"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                      <div>
                        <label style={varLabelStyle}>Opening Diameter</label>
                        <input value={v.openingDiameter} onChange={e => updateVariation(i, 'openingDiameter', e.target.value)} placeholder="e.g. 3 in"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                    </div>
                    <div className="product-create-variation-grid product-create-variation-grid--second">
                      <div>
                        <label htmlFor={`product-weight-${v.id}`} style={varLabelStyle}>Product weight (kg) *</label>
                        <input id={`product-weight-${v.id}`} type="number" min="0.001" step="0.001" required value={v.weightKg} onChange={e => updateVariation(i, 'weightKg', e.target.value)} placeholder="e.g. 1.5"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                      <div>
                        <label style={varLabelStyle}>Price</label>
                        <input type="number" value={v.price} onChange={e => updateVariation(i, 'price', e.target.value)} placeholder="0.00"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                      <div>
                        <label style={varLabelStyle}>Stock</label>
                        <input type="number" value={v.stock} onChange={e => updateVariation(i, 'stock', e.target.value)} placeholder="0"
                          style={varInputStyle} {...varInputFocusProps} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: '#B8A89A', marginBottom: '16px' }}>No variations added yet. Add a variation below.</p>
            )}

            <button type="button" onClick={addVariation} style={{
              width: '100%', padding: '12px', border: '2px dashed #D4C8BB', borderRadius: '10px',
              background: 'transparent', color: '#823E0B', fontWeight: 600, fontSize: '0.88rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.background = 'rgba(130,62,11,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add New Variation
            </button>
          </div>

          {/* Section: Media Upload */}
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E8E0D8', padding: '28px 32px', marginBottom: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 style={sectionHeaderStyle}>Media Upload</h3>
            <div className="product-create-media-grid">
              <div>
                <label style={labelStyle}>Product Image</label>
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '24px', border: '2px dashed #D4C8BB', borderRadius: '12px', cursor: 'pointer',
                  background: '#FAF8F5', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.background = 'rgba(130,62,11,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.background = '#FAF8F5'; }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="#8C7B6E" strokeWidth="1.5" style={{ width: '32px', height: '32px', marginBottom: '8px' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#823E0B' }}>
                    {imageFile ? imageFile.name : 'Choose Image'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#B8A89A', marginTop: '4px' }}>JPG, PNG up to 5MB</span>
                  <input type="file" aria-label="Product image" accept=".jpg,.jpeg,.png,.webp,.gif" onChange={handleImageChange} style={{ display: 'none' }} />
                </label>
                {imagePreview && <AssetImage src={imagePreview} alt="Preview" style={{ marginTop: '12px', width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover' }} />}
              </div>
              <div>
                <label style={labelStyle}>3D Model (.glb)</label>
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '24px', border: '2px dashed #D4C8BB', borderRadius: '12px', cursor: 'pointer',
                  background: '#FAF8F5', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.background = 'rgba(130,62,11,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.background = '#FAF8F5'; }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="#8C7B6E" strokeWidth="1.5" style={{ width: '32px', height: '32px', marginBottom: '8px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#823E0B' }}>
                    {glbFile ? glbFile.name : 'Choose 3D Model'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#B8A89A', marginTop: '4px' }}>GLB format only · up to 25 MB</span>
                  <input type="file" aria-label="3D model" accept=".glb" onChange={handleGlbChange} style={{ display: 'none' }} />
                </label>
                {glbFile && (
                  <div style={{
                    marginTop: '12px', padding: '10px 14px', background: 'rgba(130,62,11,0.06)',
                    borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#823E0B" strokeWidth="2" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span style={{ fontSize: '0.78rem', color: '#823E0B', fontWeight: 500 }}>{glbFile.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          {submitError && (
            <div role="alert" style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.85rem' }}>
              {submitError}
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => navigate(listPath)} style={{
              padding: '11px 24px', border: '1.5px solid #D4C8BB', borderRadius: '10px',
              background: '#fff', color: '#5A4A3E', fontSize: '0.88rem', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.color = '#823E0B'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.color = '#5A4A3E'; }}
            >Cancel</button>
            <button type="submit" disabled={!isValid || loading} style={{
              padding: '11px 28px', border: 'none', borderRadius: '10px',
              background: !isValid || loading ? '#B8A89A' : '#823E0B', color: '#fff', fontSize: '0.88rem', fontWeight: 600,
              cursor: !isValid || loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              boxShadow: !isValid || loading ? 'none' : '0 2px 8px rgba(130,62,11,0.25)',
            }}
              onMouseEnter={e => { if (isValid && !loading) e.currentTarget.style.background = '#6B3209'; }}
              onMouseLeave={e => { if (isValid && !loading) e.currentTarget.style.background = '#823E0B'; }}
            >{loading ? 'Uploading...' : 'Upload Product'}</button>
          </div>

          </fieldset>
        </form>
      )}
    </div>
  );
}
