import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertCircle, FileBox, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Product } from '../../types';
import type { ProductEditorErrors, ProductVariationDraft } from '../../types/adminProducts';

const CATEGORIES = ['Vases', 'Bowls', 'Jars', 'Teapots', 'Planters', 'Amphoras', 'Plates'];

export interface ProductEditorSave {
  name: string;
  category: string;
  materials: string;
  technique: string;
  variations: ProductVariationDraft[];
  imageFile: File | null;
  modelFile: File | null;
}

interface ProductEditorDialogProps {
  product: Product | null;
  onClose: () => void;
  onSave: (product: Product, data: ProductEditorSave) => Promise<void>;
}

function emptyDraft(): ProductVariationDraft { return { dimensions: '', height: '', openingDiameter: '', price: '', stock: '' }; }
function totalStock(variations: ProductVariationDraft[]) { return variations.reduce((sum, item) => sum + (Number(item.stock) || 0), 0); }

function trapFocus(event: KeyboardEvent<HTMLElement>, onDismiss: () => void) {
  if (event.key === 'Escape') { event.preventDefault(); onDismiss(); return; }
  if (event.key !== 'Tab') return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (!items.length) return;
  const first = items[0]; const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export default function ProductEditorDialog({ product, onClose, onSave }: ProductEditorDialogProps) {
  const [form, setForm] = useState({ name: '', category: '', materials: '', technique: '' });
  const [variations, setVariations] = useState<ProductVariationDraft[]>([]);
  const [variationLoading, setVariationLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<ProductEditorErrors>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (!product) return;
    const request = ++sequence.current;
    setForm({ name: product.name || '', category: product.category || '', materials: product.materials || '', technique: product.technique || '' });
    setVariations([]); setImageFile(null); setImagePreview(product.image || ''); setModelFile(null); setErrors({}); setDirty(false); setConfirmDiscard(false); setVariationLoading(true);
    void supabase.from('product_variations').select('*').eq('product_id', product.id).order('sort_order').then(({ data, error }) => {
      if (request !== sequence.current) return;
      if (error) setErrors({ save: error.message || 'Could not load product variations.' });
      else setVariations((data ?? []).map((item: any) => ({ id: item.id, dimensions: item.dimensions ?? '', height: item.height ?? '', openingDiameter: item.opening_diameter ?? '', price: item.price == null ? '' : String(item.price), stock: String(item.stock ?? 0) })));
      setVariationLoading(false);
    });
  }, [product]);

  useEffect(() => () => { if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  useEffect(() => { if (!product) return; const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 0); return () => window.clearTimeout(timer); }, [product]);

  if (!product) return null;

  const requestClose = () => { if (saving) return; if (dirty) setConfirmDiscard(true); else onClose(); };
  const change = (key: keyof typeof form, value: string) => { setDirty(true); setForm((current) => ({ ...current, [key]: value })); };
  const updateVariation = (index: number, key: keyof ProductVariationDraft, value: string) => { setDirty(true); setVariations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)); };

  const chooseImage = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) { setErrors((current) => ({ ...current, image: 'Choose a JPG or PNG image up to 5 MB.' })); return; }
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImageFile(file); setImagePreview(URL.createObjectURL(file)); setErrors((current) => ({ ...current, image: undefined })); setDirty(true);
  };
  const chooseModel = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.glb')) { setErrors((current) => ({ ...current, model: 'Choose a GLB model file.' })); return; }
    setModelFile(file); setErrors((current) => ({ ...current, model: undefined })); setDirty(true);
  };

  const submit = async () => {
    const nextErrors: ProductEditorErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Product name is required.';
    if (!form.category) nextErrors.category = 'Select a category.';
    const meaningful = variations.filter((item) => item.dimensions.trim() || item.height.trim() || item.openingDiameter.trim() || item.price || item.stock);
    const invalidVariation = meaningful.some((item) => !(item.dimensions.trim() || item.height.trim() || item.openingDiameter.trim()) || (item.price !== '' && Number(item.price) < 0) || Number(item.stock || 0) < 0 || !Number.isInteger(Number(item.stock || 0)));
    if (invalidVariation) nextErrors.variations = 'Each variation needs a dimension, height, or opening diameter. Price and stock cannot be negative, and stock must be a whole number.';
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setSaving(true); setErrors({});
    try {
      await onSave(product, { ...form, name: form.name.trim(), materials: form.materials.trim(), technique: form.technique.trim(), variations: meaningful, imageFile, modelFile });
      onClose();
    } catch (cause) {
      setErrors({ save: cause instanceof Error ? cause.message : 'Could not save product changes.' });
    } finally { setSaving(false); }
  };

  return <div className="product-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={dialogRef} className="product-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title" tabIndex={-1} onKeyDown={(event) => trapFocus(event, requestClose)}>
      <header className="product-editor__header"><div><h2 id="product-editor-title">Edit product</h2><p>Update {product.name}’s catalog details, media, and variations.</p></div><button className="product-editor__close" data-autofocus type="button" aria-label="Close product editor" onClick={requestClose} disabled={saving}><X aria-hidden="true" /></button></header>
      <div className="product-editor__body">
        <section className="product-editor__section product-editor__details"><h3>Product details</h3><div className="product-editor__fields"><label className="product-editor__wide"><span>Name</span><input value={form.name} onChange={(event) => change('name', event.target.value)} aria-invalid={Boolean(errors.name)} />{errors.name && <em>{errors.name}</em>}</label><label><span>Category</span><select value={form.category} onChange={(event) => change('category', event.target.value)} aria-invalid={Boolean(errors.category)}><option value="">Select category</option>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>{errors.category && <em>{errors.category}</em>}</label><label><span>Material</span><input value={form.materials} placeholder="e.g. Terracotta clay" onChange={(event) => change('materials', event.target.value)} /></label><label className="product-editor__wide"><span>Technique</span><input value={form.technique} placeholder="e.g. Handcrafted & kiln-fired" onChange={(event) => change('technique', event.target.value)} /></label></div></section>
        <section className="product-editor__section product-editor__media"><h3>Media</h3><label className="product-upload"><ImagePlus aria-hidden="true" /><strong>{imageFile ? imageFile.name : 'Replace product image'}</strong><small>JPG or PNG · up to 5 MB</small><input type="file" accept="image/jpeg,image/png" onChange={(event) => chooseImage(event.target.files?.[0])} /></label>{errors.image && <em>{errors.image}</em>}{imagePreview && <img className="product-editor__preview" src={imagePreview} alt="Product preview" />}<label className="product-upload"><FileBox aria-hidden="true" /><strong>{modelFile ? modelFile.name : product.model3d ? 'Replace 3D model' : 'Add 3D model'}</strong><small>GLB format</small><input type="file" accept=".glb,model/gltf-binary" onChange={(event) => chooseModel(event.target.files?.[0])} /></label>{errors.model && <em>{errors.model}</em>}</section>
        <section className="product-editor__section product-editor__variations"><div className="product-editor__section-heading"><div><h3>Variations</h3><p>Stock is totalled across every saved variation.</p></div><b>Total stock: {totalStock(variations)}</b></div>{variationLoading ? <div className="product-editor__loading">Loading variations…</div> : <><div className="product-editor__variation-list">{variations.map((variation, index) => <article className="product-variation" key={variation.id ?? index}><header><strong>Variation {index + 1}</strong><button type="button" aria-label={`Remove variation ${index + 1}`} onClick={() => { setDirty(true); setVariations((current) => current.filter((_, itemIndex) => itemIndex !== index)); }}><Trash2 aria-hidden="true" /></button></header><div className="product-variation__fields"><label><span>Dimensions</span><input value={variation.dimensions} onChange={(event) => updateVariation(index, 'dimensions', event.target.value)} placeholder="e.g. 10 × 10 cm" /></label><label><span>Height</span><input value={variation.height} onChange={(event) => updateVariation(index, 'height', event.target.value)} placeholder="e.g. 12 cm" /></label><label><span>Opening</span><input value={variation.openingDiameter} onChange={(event) => updateVariation(index, 'openingDiameter', event.target.value)} placeholder="e.g. 5 cm" /></label><label><span>Price</span><input type="number" min="0" step="0.01" value={variation.price} onChange={(event) => updateVariation(index, 'price', event.target.value)} /></label><label><span>Stock</span><input type="number" min="0" step="1" value={variation.stock} onChange={(event) => updateVariation(index, 'stock', event.target.value)} /></label></div></article>)}</div>{errors.variations && <em>{errors.variations}</em>}<button className="product-editor__add" type="button" onClick={() => { setDirty(true); setVariations((current) => [...current, emptyDraft()]); }}><Plus aria-hidden="true" />Add variation</button></>}</section>
      </div>
      {errors.save && <div className="product-editor__error" role="alert"><AlertCircle aria-hidden="true" />{errors.save}</div>}
      <footer className="product-editor__footer"><button type="button" className="product-editor__cancel" onClick={requestClose} disabled={saving}>Cancel</button><button type="button" className="product-editor__save" onClick={() => void submit()} disabled={saving || variationLoading}>{saving ? 'Saving changes…' : 'Save changes'}</button></footer>
    </section>
    {confirmDiscard && <div className="product-discard-backdrop"><section className="product-discard" role="dialog" aria-modal="true" aria-labelledby="product-discard-title"><h2 id="product-discard-title">Discard unsaved changes?</h2><p>Your product edits have not been saved.</p><div><button type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button type="button" onClick={onClose}>Discard changes</button></div></section></div>}
  </div>;
}
