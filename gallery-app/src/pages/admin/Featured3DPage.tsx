import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { createLandingFeature, isEligibleLandingModel, normalizeLandingLook, parseLandingFeature, type LandingFeature, type LandingLook, type LandingModel, type LandingStages } from '../../lib/landing3dFeature';
import { shapeFromModelBase } from '../../lib/measurements';
import { modelBaseFromRow } from '../../components/freeform/modelEstimate';
import ShapeTab from '../../components/freeform/ShapeTab';
import MaterialTab from '../../components/freeform/MaterialTab';
import DecorTab from '../../components/freeform/DecorTab';
import AttachmentTab from '../../components/freeform/AttachmentTab';
import type { GeneratedAttachmentSocket } from '../../components/freeform/attachments';
import type { AttachmentPlacementLimitMap } from '../../components/freeform/attachmentPlacement';
import '../../styles/freeform.css';
import './featured-3d.css';

const FreeformViewer = lazy(() => import('../../components/freeform/FreeformViewer'));
type StageTab = 'start' | 'shape' | 'finish' | 'decorate' | 'details';
type StageKey = keyof LandingStages;
const TABS: Array<{ key: StageTab; label: string; description: string }> = [
  { key: 'start', label: 'Start', description: 'The first view in the landing section.' },
  { key: 'shape', label: 'Shape', description: 'The form revealed as visitors scroll.' },
  { key: 'finish', label: 'Finish', description: 'Two surface looks shown in sequence.' },
  { key: 'decorate', label: 'Decorate', description: 'The pattern and surface before the final step.' },
  { key: 'details', label: 'Details', description: 'The final look carried into Design Studio.' },
];

export default function Featured3DPage() {
  const [models, setModels] = useState<LandingModel[]>([]);
  const [shops, setShops] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState('');
  const [publishedId, setPublishedId] = useState('');
  const [feature, setFeature] = useState<LandingFeature | null>(null);
  const [tab, setTab] = useState<StageTab>('start');
  const [finishLook, setFinishLook] = useState<'finishOne' | 'finishTwo'>('finishOne');
  const [sockets, setSockets] = useState<GeneratedAttachmentSocket[]>([]);
  const [placementLimits, setPlacementLimits] = useState<AttachmentPlacementLimitMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const [modelResult, shopResult, settingResult] = await Promise.all([
        supabase.from('models_3d').select('*').order('name'),
        supabase.from('shops').select('id,name').order('name'),
        supabase.from('landing_3d_feature').select('model_id,visual_keyframes').eq('id', 'current').maybeSingle(),
      ]);
      if (!active) return;
      if (modelResult.error) {
        setError('Could not load 3D models.');
        setLoading(false);
        return;
      }
      const eligible = ((modelResult.data || []) as LandingModel[]).filter(isEligibleLandingModel);
      setModels(eligible);
      const shopNames = Object.fromEntries((shopResult.data || []).map((shop: { id: string; name: string }) => [shop.id, shop.name]));
      setShops(shopNames);
      const publishedModel = eligible.find((model) => model.id === settingResult.data?.model_id);
      const initialModel = publishedModel || eligible[0];
      if (initialModel) {
        const saved = publishedModel ? parseLandingFeature(settingResult.data?.visual_keyframes, publishedModel) : null;
        setSelectedId(initialModel.id);
        setFeature(saved || createLandingFeature(initialModel, shopNames[initialModel.shop_id || '']));
        if (saved) setPublishedId(initialModel.id);
        else if (settingResult.data) setNotice('The saved preview needs attention. Review its stages and publish a valid model.');
      }
      if (settingResult.error) setNotice('Published settings could not be loaded. You can preview models, but publishing may be unavailable.');
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const model = useMemo(() => models.find((entry) => entry.id === selectedId), [models, selectedId]);
  const stageKey: StageKey = tab === 'finish' ? finishLook : tab;
  const look = feature?.stages[stageKey];
  const base = modelBaseFromRow(model);

  function chooseModel(id: string) {
    const next = models.find((item) => item.id === id);
    if (!next) return;
    setSelectedId(id);
    setFeature(createLandingFeature(next, shops[next.shop_id || '']));
    setSockets([]);
    setPlacementLimits({});
    setTab('start');
    setNotice('Model changed. Review all five stages before publishing.');
    setError('');
  }

  function updateStage(key: StageKey, value: LandingLook) {
    setFeature((current) => {
      if (!current) return current;
      const normalized = normalizeLandingLook(value);
      const stages = { ...current.stages, [key]: normalized };
      if (key === 'start') {
        stages.shape = { ...stages.shape, material: normalized.material };
      }
      if (key === 'shape') {
        for (const later of ['finishOne', 'finishTwo', 'decorate', 'details'] as const) {
          stages[later] = { ...stages[later], shape: normalized.shape };
        }
      }
      if (key === 'finishTwo') {
        stages.decorate = { ...stages.decorate, material: normalized.material };
        stages.details = { ...stages.details, material: normalized.material };
      }
      if (key === 'decorate') {
        stages.details = { ...stages.details, material: normalized.material, decoration: normalized.decoration };
      }
      return { ...current, stages };
    });
    setNotice('Unpublished changes');
  }

  async function publish() {
    if (!model || !feature) return;
    if (!parseLandingFeature(feature, model)) {
      setError('Review the dimensions, colors, pattern, and attachments before publishing.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data: currentModel, error: modelError } = await supabase.from('models_3d')
        .select('*').eq('id', model.id).maybeSingle();
      const refreshed = currentModel as LandingModel | null;
      if (modelError || !isEligibleLandingModel(refreshed)
        || refreshed.file_url !== model.file_url || refreshed.shop_id !== model.shop_id
        || !parseLandingFeature(feature, refreshed)) {
        throw new Error('This model changed or is no longer eligible. Reload the page and review the preview.');
      }
      const { data, error: saveError } = await supabase.from('landing_3d_feature').upsert({
        id: 'current', model_id: model.id, visual_keyframes: feature, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' }).select('model_id').single();
      if (saveError || data?.model_id !== model.id) throw saveError || new Error('The published setting was not confirmed.');
      setPublishedId(model.id);
      setNotice('Published. Visitors will see this preview on their next page load.');
    } catch (cause) {
      setError(cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string'
        ? cause.message : 'Could not publish the featured preview.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="featured-admin-empty">Loading featured preview...</div>;

  return <div className="featured-admin">
    <header className="featured-admin__header">
      <div>
        <Link to="/admin/models" className="featured-admin__back">← 3D Models</Link>
        <h1>Featured 3D Preview</h1>
        <p>Choose a library model and shape the five-step landing page preview.</p>
      </div>
      <button type="button" className="featured-admin__publish" onClick={() => void publish()} disabled={!model || !feature || saving}>
        {saving ? 'Publishing...' : 'Save and Publish'}
      </button>
    </header>
    {error && <p className="featured-admin__message featured-admin__message--error" role="alert">{error}</p>}
    {notice && <p className="featured-admin__message" role="status">{notice}</p>}
    {!model || !feature || !look || !base ? <div className="featured-admin-empty">No eligible models are available. Upload an active model with base measurements and a shop first.</div> :
      <div className="featured-admin__grid">
        <section className="featured-admin__controls" aria-label="Featured preview settings">
          <label className="featured-admin__model-label" htmlFor="featured-model">Featured model</label>
          <select id="featured-model" value={selectedId} onChange={(event) => chooseModel(event.target.value)}>
            {models.map((item) => <option key={item.id} value={item.id}>{item.name} · {shops[item.shop_id || ''] || 'Shop'}</option>)}
          </select>
          <p className="featured-admin__current">{publishedId ? `Published: ${models.find((item) => item.id === publishedId)?.name || 'Unavailable model'}` : 'No published setting yet; the current landing preview remains active.'}</p>
          <div className="featured-admin__tabs" role="tablist" aria-label="Preview stages">
            {TABS.map((entry) => <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key} className={tab === entry.key ? 'active' : ''} onClick={() => setTab(entry.key)}>{entry.label}</button>)}
          </div>
          <p className="featured-admin__stage-description">{TABS.find((entry) => entry.key === tab)?.description}</p>
          <div className="featured-admin__editor" key={`${model.id}-${tab}`}>
            {tab === 'start' && <><ShapeTab shapeParams={look.shape} baseShape={shapeFromModelBase(base)} onChange={(shape) => updateStage('start', { ...look, shape })} /><MaterialTab materialParams={look.material} shopName={shops[model.shop_id || '']} onChange={(material) => updateStage('start', { ...look, material })} /></>}
            {tab === 'shape' && <ShapeTab shapeParams={look.shape} baseShape={shapeFromModelBase(base)} onChange={(shape) => updateStage('shape', { ...look, shape })} />}
            {tab === 'finish' && <><div className="featured-admin__subtabs"><button type="button" className={finishLook === 'finishOne' ? 'active' : ''} onClick={() => setFinishLook('finishOne')}>First finish</button><button type="button" className={finishLook === 'finishTwo' ? 'active' : ''} onClick={() => setFinishLook('finishTwo')}>Second finish</button></div><MaterialTab materialParams={look.material} shopName={shops[model.shop_id || '']} onChange={(material) => updateStage(finishLook, { ...look, material })} /></>}
            {tab === 'decorate' && <><MaterialTab materialParams={look.material} shopName={shops[model.shop_id || '']} onChange={(material) => updateStage('decorate', { ...look, material })} /><DecorTab decoration={look.decoration} onChange={(decoration) => updateStage('decorate', { ...look, decoration })} /></>}
            {tab === 'details' && <AttachmentTab shopId={model.shop_id} modelId={model.id} sockets={sockets} modelHeightIn={look.shape.height} value={look.attachments} placementLimits={placementLimits} onChange={(attachments) => updateStage('details', { ...look, attachments })} onCompatibilityWarning={setNotice} />}
          </div>
        </section>
        <aside className="featured-admin__preview" aria-label={`${TABS.find((entry) => entry.key === tab)?.label} 3D preview`}>
          <div className="featured-admin__canvas">
            <Suspense fallback={<div className="featured-admin-empty">Loading 3D preview...</div>}>
              <FreeformViewer key={model.id} preview modelFile={model.file_url} shapeParams={look.shape} materialParams={look.material} decorationParams={look.decoration} attachmentParams={look.attachments} showAttachmentSockets={tab === 'details'} onSocketsChange={setSockets} onAttachmentLimitsChange={setPlacementLimits} onMorphDetected={() => {}} onAttachmentError={() => setError('An attachment could not be displayed. Choose a different detail.')} />
            </Suspense>
          </div>
          <p>Preview of the {tab === 'finish' ? finishLook === 'finishOne' ? 'first finish' : 'second finish' : tab} stage. Scroll timing and page text remain on the public page.</p>
        </aside>
      </div>}
  </div>;
}
