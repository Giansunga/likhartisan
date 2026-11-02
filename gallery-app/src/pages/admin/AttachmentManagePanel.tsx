import { getErrorMessage } from '../../lib/portalErrors';
import AssetImage from '../../components/AssetImage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FreeformViewer from '../../components/freeform/FreeformViewer';
import {
  createAttachmentSelection,
  recipeFitsSocket,
  type CatalogSettingsRecord,
  type GeneratedAttachmentSocket,
  type ShopOverrideRecord,
} from '../../components/freeform/attachments';
import { GENERATED_ATTACHMENT_RECIPES } from '../../components/freeform/generatedAttachmentCatalog';
import { supabase } from '../../lib/supabase';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';
import { DEFAULT_SHAPE_PARAMS_IN } from '../../lib/measurements';

type Shop = { id: string; name: string };
type Model = { id: string; name: string; file_url: string; status: string; thumbnail?: string };
type GlobalDraft = { active: boolean; price: number; days: number };
type OverrideDraft = { mode: 'inherit' | 'enabled' | 'disabled'; price: string; days: string };

const DEFAULT_SHAPE = DEFAULT_SHAPE_PARAMS_IN;

export default function AttachmentManagePanel({ onBack }: { onBack: () => void }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [globals, setGlobals] = useState<Record<string, GlobalDraft>>({});
  const [overrides, setOverrides] = useState<Record<string, OverrideDraft>>({});
  const [selectedShopId, setSelectedShopId] = useState('');
  const [previewRecipeKey, setPreviewRecipeKey] = useState(GENERATED_ATTACHMENT_RECIPES[0].key);
  const [previewModelId, setPreviewModelId] = useState('');
  const [previewSockets, setPreviewSockets] = useState<GeneratedAttachmentSocket[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirtyKeys = useRef(new Set<string>());
  const collectionRequest = useRef(0);
  const overrideRequest = useRef(0);
  const savePending = useRef(false);
  const [overrideOwner, setOverrideOwner] = useState('');
  const [dirtyOverrides, setDirtyOverrides] = useState(false);
  const invalidateCollection = useCallback(() => { collectionRequest.current++; }, []);
  const invalidateOverrides = useCallback(() => { overrideRequest.current++; }, []);

  const load = useCallback(async () => {
    if (savePending.current) return;
    const request = ++collectionRequest.current;
    setLoading(true); setError('');
    try {
    const [settingsResult, shopsResult, modelsResult] = await Promise.all([
      supabase.from('generated_attachment_catalog_settings').select('*').order('recipe_key'),
      supabase.from('shops').select('id,name').order('name'),
      supabase.from('models_3d').select('id,name,file_url,status,thumbnail').eq('status', 'active').order('name'),
    ]);
    const firstError = settingsResult.error || shopsResult.error || modelsResult.error;
    if (firstError) throw firstError;
    if (request !== collectionRequest.current) return;
    const settingsByKey = new Map(((settingsResult.data || []) as CatalogSettingsRecord[]).map((row) => [row.recipe_key, row]));
    const nextGlobals = Object.fromEntries(GENERATED_ATTACHMENT_RECIPES.map((recipe) => {
      const row = settingsByKey.get(recipe.key);
      return [recipe.key, { active: row?.active ?? false, price: Number(row?.default_price || 0), days: Number(row?.default_production_days || 0) }];
    }));
    setGlobals(current => ({ ...nextGlobals, ...Object.fromEntries(Object.entries(current).filter(([key]) => dirtyKeys.current.has(`global:${key}`))) }));
    const nextModels = (modelsResult.data || []) as Model[];
    setShops((shopsResult.data || []) as Shop[]);
    setModels(nextModels);
    setPreviewModelId((current) => current || nextModels[0]?.id || '');
    } catch (cause) { if (request === collectionRequest.current) setError(getErrorMessage(cause, 'Catalog settings could not be loaded.')); }
    finally { if (request === collectionRequest.current) setLoading(false); }
  }, []);

  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; invalidateCollection(); }; }, [invalidateCollection, load]);

  const loadOverrides = useCallback(async () => {
    if (savePending.current) return;
    const request = ++overrideRequest.current;
    if (!selectedShopId) { setOverrides({}); setOverrideOwner(''); return; }
    try {
    const { data, error: overrideError } = await supabase.from('generated_attachment_shop_overrides').select('*').eq('shop_id', selectedShopId);
    if (overrideError) throw overrideError;
    if (request !== overrideRequest.current) return;
    const byKey = new Map(((data || []) as ShopOverrideRecord[]).map((row) => [row.recipe_key, row]));
    const nextOverrides: Record<string, OverrideDraft> = Object.fromEntries(GENERATED_ATTACHMENT_RECIPES.map((recipe) => {
      const row = byKey.get(recipe.key);
      return [recipe.key, row ? { mode: row.enabled ? 'enabled' : 'disabled', price: row.price_adjustment == null ? '' : String(row.price_adjustment), days: row.production_days_adjustment == null ? '' : String(row.production_days_adjustment) } : { mode: 'inherit', price: '', days: '' }];
    }));
    setOverrides(current => ({ ...nextOverrides, ...Object.fromEntries(Object.entries(current).filter(([key]) => dirtyKeys.current.has(`override:${selectedShopId}:${key}`))) }));
    setOverrideOwner(selectedShopId);
    } catch (cause) { if (request === overrideRequest.current) setError(getErrorMessage(cause, 'Shop overrides could not be loaded.')); }
  }, [selectedShopId]);

  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void loadOverrides(); }); return () => { active = false; invalidateOverrides(); }; }, [invalidateOverrides, loadOverrides]);

  const refreshIfClean = useCallback(async () => {
    if (dirtyKeys.current.size || savePending.current) return;
    await Promise.all([load(), loadOverrides()]);
  }, [load, loadOverrides]);
  usePortalRealtimeRefresh(
    ['generated_attachment_catalog_settings', 'generated_attachment_shop_overrides', 'models_3d', 'shops'],
    refreshIfClean,
  );

  async function saveGlobal(recipeKey: string) {
    const draft = globals[recipeKey];
    if (!draft || savePending.current) return;
    if (!Number.isFinite(draft.price) || draft.price < 0 || !Number.isInteger(draft.days) || draft.days < 0) { setError('Enter a valid price and whole number of days.'); return; }
    savePending.current = true;
    invalidateCollection();
    setLoading(false);
    setSavingKey(`global:${recipeKey}`); setError(''); setMessage('');
    try {
      const { data, error } = await supabase.from('generated_attachment_catalog_settings').upsert({ recipe_key: recipeKey, active: draft.active, default_price: draft.price, default_production_days: draft.days, updated_at: new Date().toISOString() }, { onConflict: 'recipe_key' }).select('recipe_key').single();
      if (error) throw error;
      if (!data) throw new Error('The saved catalog settings could not be confirmed. Reload before retrying.');
      dirtyKeys.current.delete(`global:${recipeKey}`);
      setMessage('Global settings saved.');
    } catch (cause) { setError(getErrorMessage(cause, 'Catalog settings could not be saved.')); }
    finally { savePending.current = false; setSavingKey(''); }
  }

  async function saveOverride(recipeKey: string) {
    if (!selectedShopId || overrideOwner !== selectedShopId || savePending.current) return;
    const draft = overrides[recipeKey] || { mode: 'inherit', price: '', days: '' };
    if ((draft.price !== '' && (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0)) || (draft.days !== '' && (!Number.isInteger(Number(draft.days)) || Number(draft.days) < 0))) { setError('Enter a valid price and whole number of days.'); return; }
    savePending.current = true;
    invalidateOverrides();
    setSavingKey(`override:${recipeKey}`); setError(''); setMessage('');
    try {
      if (draft.mode === 'inherit') {
        const { error } = await supabase.from('generated_attachment_shop_overrides').delete().eq('recipe_key', recipeKey).eq('shop_id', selectedShopId);
        if (error) throw error;
        const { data, error: verifyError } = await supabase.from('generated_attachment_shop_overrides').select('recipe_key').eq('recipe_key', recipeKey).eq('shop_id', selectedShopId).maybeSingle();
        if (verifyError) throw verifyError;
        if (data) throw new Error('The override could not be removed. Please reload before retrying.');
      } else {
        const { data, error } = await supabase.from('generated_attachment_shop_overrides').upsert({ recipe_key: recipeKey, shop_id: selectedShopId, enabled: draft.mode === 'enabled', price_adjustment: draft.price === '' ? null : Number(draft.price), production_days_adjustment: draft.days === '' ? null : Number(draft.days), updated_at: new Date().toISOString() }, { onConflict: 'recipe_key,shop_id' }).select('recipe_key').single();
        if (error) throw error;
        if (!data) throw new Error('The saved override could not be confirmed. Reload before retrying.');
      }
      dirtyKeys.current.delete(`override:${selectedShopId}:${recipeKey}`);
      setDirtyOverrides([...dirtyKeys.current].some(key => key.startsWith(`override:${selectedShopId}:`)));
      setMessage('Shop override saved.');
    } catch (cause) { setError(getErrorMessage(cause, 'Shop override could not be saved.')); }
    finally { savePending.current = false; setSavingKey(''); }
  }

  const previewRecipe = GENERATED_ATTACHMENT_RECIPES.find((recipe) => recipe.key === previewRecipeKey)!;
  const previewModel = models.find((model) => model.id === previewModelId);
  const previewSocket = previewSockets.find((socket) => recipeFitsSocket(previewRecipe, socket));
  const previewSelections = useMemo(() => {
    if (!previewSocket || !previewRecipe) return [];
    const draft = globals[previewRecipe.key] || { active: false, price: 0, days: 0 };
    return [createAttachmentSelection({ recipe: previewRecipe, shopId: null, priceAdjustment: draft.price, productionDaysAdjustment: draft.days }, [previewSocket])];
  }, [globals, previewRecipe, previewSocket]);

  if (loading && !Object.keys(globals).length) return <div className="py-16 text-center text-brown-medium">Loading generated catalog…</div>;

  return <div className="space-y-7">
    <div className="portal-action-bar portal-action-bar--between"><button onClick={onBack} className="text-sm text-brown-medium hover:text-primary">← Base models</button><span className="px-3 py-2 rounded-xl bg-cream-secondary text-xs font-semibold text-brown-medium whitespace-nowrap">{GENERATED_ATTACHMENT_RECIPES.length} code-owned recipes</span></div>
    {loading && <p role="status" className="text-sm text-brown-medium">Refreshing catalog…</p>}
    {error && <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}<button type="button" onClick={() => void load()}>Retry loading catalog</button></div>}
    {message && <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">{message}</div>}

    <section className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
      <div className="bg-white rounded-2xl border border-cream-tertiary overflow-hidden"><div className="px-5 py-4 border-b"><h3 className="font-bold">Global catalog</h3><p className="text-xs text-brown-medium mt-1">Inactive recipes are hidden from every shopper.</p></div><div className="divide-y divide-cream-tertiary">{GENERATED_ATTACHMENT_RECIPES.map((recipe) => {
        const draft = globals[recipe.key] || { active: false, price: 0, days: 0 };
        return <div key={recipe.key} onChangeCapture={() => { dirtyKeys.current.add(`global:${recipe.key}`); }} className="p-4 grid sm:grid-cols-[64px_minmax(150px,1fr)_90px_80px_auto] gap-3 items-center"><button type="button" onClick={() => setPreviewRecipeKey(recipe.key)} className={`rounded-xl overflow-hidden border-2 ${previewRecipeKey === recipe.key ? 'border-primary' : 'border-transparent'}`}><AssetImage src={recipe.thumbnail} alt="" className="w-16 h-12 object-cover" /></button><div><strong className="text-sm">{recipe.name}</strong><p className="text-xs text-brown-medium capitalize">{recipe.family} · {recipe.style} · v{recipe.version}</p></div><label className="text-xs">Price ₱<input type="number" disabled={Boolean(savingKey)} min="0" value={draft.price} onChange={(event) => setGlobals({ ...globals, [recipe.key]: { ...draft, price: Number(event.target.value) } })} className="mt-1 w-full px-2 py-2 rounded-lg border" /></label><label className="text-xs">Days<input type="number" disabled={Boolean(savingKey)} min="0" value={draft.days} onChange={(event) => setGlobals({ ...globals, [recipe.key]: { ...draft, days: Number(event.target.value) } })} className="mt-1 w-full px-2 py-2 rounded-lg border" /></label><div className="flex sm:flex-col items-center gap-2"><label className="text-xs flex gap-2"><input type="checkbox" disabled={Boolean(savingKey)} checked={draft.active} onChange={(event) => setGlobals({ ...globals, [recipe.key]: { ...draft, active: event.target.checked } })} /> Active</label><button onClick={() => saveGlobal(recipe.key)} disabled={Boolean(savingKey)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs disabled:opacity-50">Save</button></div></div>;
      })}</div></div>
      <aside className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="text-xs">Preview recipe<select value={previewRecipeKey} onChange={(event) => setPreviewRecipeKey(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border bg-white">{GENERATED_ATTACHMENT_RECIPES.map((recipe) => <option key={recipe.key} value={recipe.key}>{recipe.name}</option>)}</select></label><label className="text-xs">Base model<select value={previewModelId} onChange={(event) => { setPreviewModelId(event.target.value); setPreviewSockets([]); }} className="mt-1 w-full px-3 py-2 rounded-xl border bg-white">{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label></div><div className="h-[500px] rounded-2xl overflow-hidden border bg-cream-secondary">{previewModel ? <FreeformViewer fallbackSrc={previewModel.thumbnail} fallbackAlt={previewModel.name} modelFile={previewModel.file_url} shapeParams={DEFAULT_SHAPE} materialParams={{ finish: 'raw_clay', color: '#C4A882' }} attachmentParams={previewSelections} attachmentSockets={previewSocket ? [previewSocket] : []} selectedSocketIds={previewSocket ? [previewSocket.id] : []} onSocketsChange={setPreviewSockets} onMorphDetected={() => {}} preview /> : <div className="h-full grid place-items-center text-sm text-brown-medium">No active base model.</div>}</div>{previewModel && previewSockets.length > 0 && !previewSocket && <p className="text-xs text-amber-700">This recipe does not safely fit the selected model.</p>}</aside>
    </section>

    <section className="bg-white rounded-2xl border border-cream-tertiary overflow-hidden"><div className="p-5 border-b flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-bold">Per-shop overrides</h3><p className="text-xs text-brown-medium mt-1">Inherit global pricing, override it, or disable a recipe for one shop.</p></div><label className="text-xs">Shop<select value={selectedShopId} disabled={Boolean(savingKey) || dirtyOverrides} title={dirtyOverrides ? "Save edited overrides before changing shops" : undefined} onChange={(event) => { overrideRequest.current++; setOverrides({}); setOverrideOwner(''); setSelectedShopId(event.target.value); }} className="ml-2 px-3 py-2 rounded-xl border bg-white"><option value="">Choose shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label></div>{!selectedShopId ? <p className="p-8 text-center text-sm text-brown-medium">Choose a shop to manage its overrides.</p> : overrideOwner !== selectedShopId ? <p className="p-8">Shop overrides are unavailable or loading. <button type="button" onClick={() => void loadOverrides()}>Retry</button></p> : <div className="divide-y divide-cream-tertiary">{GENERATED_ATTACHMENT_RECIPES.map((recipe) => {
      const draft = overrides[recipe.key] || { mode: 'inherit', price: '', days: '' };
      return <div key={recipe.key} onChangeCapture={() => { dirtyKeys.current.add(`override:${selectedShopId}:${recipe.key}`); setDirtyOverrides(true); }} className="p-4 grid sm:grid-cols-[minmax(160px,1fr)_130px_110px_90px_auto] gap-3 items-end"><div><strong className="text-sm">{recipe.name}</strong><p className="text-xs text-brown-medium">Global: ₱{globals[recipe.key]?.price || 0} · +{globals[recipe.key]?.days || 0} days</p></div><label className="text-xs">Availability<select value={draft.mode} disabled={Boolean(savingKey)} onChange={(event) => setOverrides({ ...overrides, [recipe.key]: { ...draft, mode: event.target.value as OverrideDraft['mode'] } })} className="mt-1 w-full px-2 py-2 rounded-lg border bg-white"><option value="inherit">Inherit</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label><label className="text-xs">Price override<input type="number" disabled={Boolean(savingKey)} min="0" value={draft.price} placeholder="Inherit" onChange={(event) => setOverrides({ ...overrides, [recipe.key]: { ...draft, price: event.target.value } })} className="mt-1 w-full px-2 py-2 rounded-lg border" /></label><label className="text-xs">Days<input type="number" disabled={Boolean(savingKey)} min="0" value={draft.days} placeholder="Inherit" onChange={(event) => setOverrides({ ...overrides, [recipe.key]: { ...draft, days: event.target.value } })} className="mt-1 w-full px-2 py-2 rounded-lg border" /></label><button onClick={() => saveOverride(recipe.key)} disabled={Boolean(savingKey)} className="px-3 py-2 rounded-lg border border-primary text-primary text-xs disabled:opacity-50">Save</button></div>;
    })}</div>}</section>
  </div>;
}
