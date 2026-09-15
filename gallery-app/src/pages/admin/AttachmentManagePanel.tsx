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

type Shop = { id: string; name: string };
type Model = { id: string; name: string; file_url: string; status: string };
type GlobalDraft = { active: boolean; price: number; days: number };
type OverrideDraft = { mode: 'inherit' | 'enabled' | 'disabled'; price: string; days: string };

const DEFAULT_SHAPE = { height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 };

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
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [settingsResult, shopsResult, modelsResult] = await Promise.all([
      supabase.from('generated_attachment_catalog_settings').select('*').order('recipe_key'),
      supabase.from('shops').select('id,name').order('name'),
      supabase.from('models_3d').select('id,name,file_url,status').eq('status', 'active').order('name'),
    ]);
    const firstError = settingsResult.error || shopsResult.error || modelsResult.error;
    if (firstError) setError(firstError.message);
    const settingsByKey = new Map(((settingsResult.data || []) as CatalogSettingsRecord[]).map((row) => [row.recipe_key, row]));
    setGlobals(Object.fromEntries(GENERATED_ATTACHMENT_RECIPES.map((recipe) => {
      const row = settingsByKey.get(recipe.key);
      return [recipe.key, { active: row?.active ?? false, price: Number(row?.default_price || 0), days: Number(row?.default_production_days || 0) }];
    })));
    const nextModels = (modelsResult.data || []) as Model[];
    setShops((shopsResult.data || []) as Shop[]);
    setModels(nextModels);
    setPreviewModelId((current) => current || nextModels[0]?.id || '');
    setLoading(false);
  }, []);

  // Loading the settings collections is the mount effect's purpose.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const loadOverrides = useCallback(async () => {
    if (!selectedShopId) { setOverrides({}); return; }
    const { data, error: overrideError } = await supabase.from('generated_attachment_shop_overrides').select('*').eq('shop_id', selectedShopId);
    if (overrideError) { setError(overrideError.message); return; }
    const byKey = new Map(((data || []) as ShopOverrideRecord[]).map((row) => [row.recipe_key, row]));
    setOverrides(Object.fromEntries(GENERATED_ATTACHMENT_RECIPES.map((recipe) => {
      const row = byKey.get(recipe.key);
      return [recipe.key, row ? { mode: row.enabled ? 'enabled' : 'disabled', price: row.price_adjustment == null ? '' : String(row.price_adjustment), days: row.production_days_adjustment == null ? '' : String(row.production_days_adjustment) } : { mode: 'inherit', price: '', days: '' }];
    })));
  }, [selectedShopId]);

  useEffect(() => { queueMicrotask(() => { void loadOverrides(); }); }, [loadOverrides]);

  const refreshIfClean = useCallback(async () => {
    if (dirtyRef.current) return;
    await Promise.all([load(), loadOverrides()]);
  }, [load, loadOverrides]);
  usePortalRealtimeRefresh(
    ['generated_attachment_catalog_settings', 'generated_attachment_shop_overrides', 'models_3d', 'shops'],
    refreshIfClean,
  );

  async function saveGlobal(recipeKey: string) {
    const draft = globals[recipeKey];
    if (!draft) return;
    setSavingKey(`global:${recipeKey}`); setError(''); setMessage('');
    const { error: saveError } = await supabase.from('generated_attachment_catalog_settings').upsert({
      recipe_key: recipeKey,
      active: draft.active,
      default_price: Math.max(0, draft.price),
      default_production_days: Math.max(0, Math.round(draft.days)),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'recipe_key' });
    if (saveError) setError(saveError.message); else { dirtyRef.current = false; setMessage('Global settings saved.'); }
    setSavingKey('');
  }

  async function saveOverride(recipeKey: string) {
    if (!selectedShopId) return;
    const draft = overrides[recipeKey] || { mode: 'inherit', price: '', days: '' };
    setSavingKey(`override:${recipeKey}`); setError(''); setMessage('');
    const result = draft.mode === 'inherit'
      ? await supabase.from('generated_attachment_shop_overrides').delete().eq('recipe_key', recipeKey).eq('shop_id', selectedShopId)
      : await supabase.from('generated_attachment_shop_overrides').upsert({
          recipe_key: recipeKey,
          shop_id: selectedShopId,
          enabled: draft.mode === 'enabled',
          price_adjustment: draft.price === '' ? null : Math.max(0, Number(draft.price)),
          production_days_adjustment: draft.days === '' ? null : Math.max(0, Math.round(Number(draft.days))),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'recipe_key,shop_id' });
    if (result.error) setError(result.error.message); else { dirtyRef.current = false; setMessage('Shop override saved.'); }
    setSavingKey('');
  }

  const previewRecipe = GENERATED_ATTACHMENT_RECIPES.find((recipe) => recipe.key === previewRecipeKey)!;
  const previewModel = models.find((model) => model.id === previewModelId);
  const previewSocket = previewSockets.find((socket) => recipeFitsSocket(previewRecipe, socket));
  const previewSelections = useMemo(() => {
    if (!previewSocket || !previewRecipe) return [];
    const draft = globals[previewRecipe.key] || { active: false, price: 0, days: 0 };
    return [createAttachmentSelection({ recipe: previewRecipe, shopId: null, priceAdjustment: draft.price, productionDaysAdjustment: draft.days }, [previewSocket])];
  }, [globals, previewRecipe, previewSocket]);

  if (loading) return <div className="py-16 text-center text-brown-medium">Loading generated catalog…</div>;

  return <div className="space-y-7" onChangeCapture={() => { dirtyRef.current = true; }}>
    <div className="portal-action-bar portal-action-bar--between"><button onClick={onBack} className="text-sm text-brown-medium hover:text-primary">← Base models</button><span className="px-3 py-2 rounded-xl bg-cream-secondary text-xs font-semibold text-brown-medium whitespace-nowrap">{GENERATED_ATTACHMENT_RECIPES.length} code-owned recipes</span></div>
    {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
    {message && <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">{message}</div>}

    <section className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
      <div className="bg-white rounded-2xl border border-cream-tertiary overflow-hidden"><div className="px-5 py-4 border-b"><h3 className="font-bold">Global catalog</h3><p className="text-xs text-brown-medium mt-1">Inactive recipes are hidden from every shopper.</p></div><div className="divide-y divide-cream-tertiary">{GENERATED_ATTACHMENT_RECIPES.map((recipe) => {
        const draft = globals[recipe.key] || { active: false, price: 0, days: 0 };
        return <div key={recipe.key} className="p-4 grid sm:grid-cols-[64px_minmax(150px,1fr)_90px_80px_auto] gap-3 items-center"><button type="button" onClick={() => setPreviewRecipeKey(recipe.key)} className={`rounded-xl overflow-hidden border-2 ${previewRecipeKey === recipe.key ? 'border-primary' : 'border-transparent'}`}><img src={recipe.thumbnail} alt="" className="w-16 h-12 object-cover" /></button><div><strong className="text-sm">{recipe.name}</strong><p className="text-xs text-brown-medium capitalize">{recipe.family} · {recipe.style} · v{recipe.version}</p></div><label className="text-xs">Price ₱<input type="number" min="0" value={draft.price} onChange={(event) => setGlobals({ ...globals, [recipe.key]: { ...draft, price: Number(event.target.value) } })} className="mt-1 w-full px-2 py-2 rounded-lg border" /></label><label className="text-xs">Days<input type="number" min="0" value={draft.days} onChange={(event) => setGlobals({ ...globals, [recipe.key]: { ...draft, days: Number(event.target.value) } })} className="mt-1 w-full px-2 py-2 rounded-lg border" /></label><div className="flex sm:flex-col items-center gap-2"><label className="text-xs flex gap-2"><input type="checkbox" checked={draft.active} onChange={(event) => setGlobals({ ...globals, [recipe.key]: { ...draft, active: event.target.checked } })} /> Active</label><button onClick={() => saveGlobal(recipe.key)} disabled={savingKey === `global:${recipe.key}`} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs disabled:opacity-50">Save</button></div></div>;
      })}</div></div>
      <aside className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="text-xs">Preview recipe<select value={previewRecipeKey} onChange={(event) => setPreviewRecipeKey(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border bg-white">{GENERATED_ATTACHMENT_RECIPES.map((recipe) => <option key={recipe.key} value={recipe.key}>{recipe.name}</option>)}</select></label><label className="text-xs">Base model<select value={previewModelId} onChange={(event) => { setPreviewModelId(event.target.value); setPreviewSockets([]); }} className="mt-1 w-full px-3 py-2 rounded-xl border bg-white">{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label></div><div className="h-[500px] rounded-2xl overflow-hidden border bg-cream-secondary">{previewModel ? <FreeformViewer modelFile={previewModel.file_url} shapeParams={DEFAULT_SHAPE} materialParams={{ finish: 'raw_clay', color: '#C4A882' }} attachmentParams={previewSelections} attachmentSockets={previewSocket ? [previewSocket] : []} selectedSocketIds={previewSocket ? [previewSocket.id] : []} onSocketsChange={setPreviewSockets} onMorphDetected={() => {}} preview /> : <div className="h-full grid place-items-center text-sm text-brown-medium">No active base model.</div>}</div>{previewModel && previewSockets.length > 0 && !previewSocket && <p className="text-xs text-amber-700">This recipe does not safely fit the selected model.</p>}</aside>
    </section>

    <section className="bg-white rounded-2xl border border-cream-tertiary overflow-hidden"><div className="p-5 border-b flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-bold">Per-shop overrides</h3><p className="text-xs text-brown-medium mt-1">Inherit global pricing, override it, or disable a recipe for one shop.</p></div><label className="text-xs">Shop<select value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)} className="ml-2 px-3 py-2 rounded-xl border bg-white"><option value="">Choose shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label></div>{!selectedShopId ? <p className="p-8 text-center text-sm text-brown-medium">Choose a shop to manage its overrides.</p> : <div className="divide-y divide-cream-tertiary">{GENERATED_ATTACHMENT_RECIPES.map((recipe) => {
      const draft = overrides[recipe.key] || { mode: 'inherit', price: '', days: '' };
      return <div key={recipe.key} className="p-4 grid sm:grid-cols-[minmax(160px,1fr)_130px_110px_90px_auto] gap-3 items-end"><div><strong className="text-sm">{recipe.name}</strong><p className="text-xs text-brown-medium">Global: ₱{globals[recipe.key]?.price || 0} · +{globals[recipe.key]?.days || 0} days</p></div><label className="text-xs">Availability<select value={draft.mode} onChange={(event) => setOverrides({ ...overrides, [recipe.key]: { ...draft, mode: event.target.value as OverrideDraft['mode'] } })} className="mt-1 w-full px-2 py-2 rounded-lg border bg-white"><option value="inherit">Inherit</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label><label className="text-xs">Price override<input type="number" min="0" value={draft.price} placeholder="Inherit" onChange={(event) => setOverrides({ ...overrides, [recipe.key]: { ...draft, price: event.target.value } })} className="mt-1 w-full px-2 py-2 rounded-lg border" /></label><label className="text-xs">Days<input type="number" min="0" value={draft.days} placeholder="Inherit" onChange={(event) => setOverrides({ ...overrides, [recipe.key]: { ...draft, days: event.target.value } })} className="mt-1 w-full px-2 py-2 rounded-lg border" /></label><button onClick={() => saveOverride(recipe.key)} disabled={savingKey === `override:${recipe.key}`} className="px-3 py-2 rounded-lg border border-primary text-primary text-xs disabled:opacity-50">Save</button></div>;
    })}</div>}</section>
  </div>;
}
