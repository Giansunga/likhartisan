import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ATTACHMENT_FAMILIES,
  createAttachmentSelection,
  getDefaultAttachmentTransform,
  recipeFitsSocket,
  resolveCatalogAssets,
  selectedSocketIds,
  updateAttachmentPlacement,
  upsertAttachmentSelection,
  type AttachmentFamily,
  type AttachmentPlacementTransform,
  type AttachmentSelection,
  type CatalogSettingsRecord,
  type GeneratedAttachmentAsset,
  type GeneratedAttachmentSocket,
  type ShopOverrideRecord,
} from './attachments';
import {
  attachmentPlacementKey,
  clampAttachmentTransform,
  getSocketTransformLimits,
  type AttachmentPlacementLimitMap,
  type AttachmentTransformLimits,
  type TransformRange,
} from './attachmentPlacement';
import { GENERATED_ATTACHMENT_RECIPES, getGeneratedAttachmentRecipe } from './generatedAttachmentCatalog';
import PanelSection from './PanelSection';

type SocketGroup = { key: string; name: string; sockets: GeneratedAttachmentSocket[] };
type ControlKey = keyof AttachmentPlacementTransform;
type AttachmentStage = 1 | 2 | 3;

const CONTROL_CONFIG: Array<{ key: ControlKey; label: string }> = [
  { key: 'horizontalDegrees', label: 'Horizontal Position' },
  { key: 'verticalRatio', label: 'Vertical Position' },
  { key: 'surfaceOffsetRatio', label: 'Depth / Surface Offset' },
  { key: 'twistDegrees', label: 'Rotation' },
  { key: 'scaleMultiplier', label: 'Scale' },
];

function formatControlValue(key: ControlKey, value: number, modelHeightCm: number) {
  if (key === 'horizontalDegrees' || key === 'twistDegrees') return `${Math.round(value)}°`;
  if (key === 'verticalRatio' || key === 'surfaceOffsetRatio') return `${(value * modelHeightCm).toFixed(1)} cm`;
  return `${Math.round(value * 100)}%`;
}

function rangesEqualTransform(a: AttachmentPlacementTransform, b: AttachmentPlacementTransform) {
  return CONTROL_CONFIG.every(({ key }) => Math.abs(a[key] - b[key]) < 0.000001);
}

export default function AttachmentTab({ shopId, modelId, sockets, modelHeightCm, value, placementLimits, onChange, onCompatibilityWarning }: {
  shopId: string | null;
  modelId: string | null;
  sockets: GeneratedAttachmentSocket[];
  modelHeightCm: number;
  value: AttachmentSelection[];
  placementLimits?: AttachmentPlacementLimitMap;
  onChange: (attachments: AttachmentSelection[]) => void;
  onCompatibilityWarning?: (message: string) => void;
}) {
  const loadedSelection = value.at(-1);
  const loadedRecipe = getGeneratedAttachmentRecipe(loadedSelection?.recipeKey || '', loadedSelection?.recipeVersion);
  const [assets, setAssets] = useState<GeneratedAttachmentAsset[]>([]);
  const [activeFamily, setActiveFamily] = useState<AttachmentFamily>(() => loadedRecipe?.family || 'handle');
  const [selectedRecipeKey, setSelectedRecipeKey] = useState(() => loadedSelection?.recipeKey || '');
  const [activeStage, setActiveStage] = useState<AttachmentStage>(() => value.length ? 3 : 1);
  const [activePlacementBySelection, setActivePlacementBySelection] = useState<Record<string, string>>({});
  const [expandedSelectionId, setExpandedSelectionId] = useState(() => loadedSelection?.id || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!modelId) { setAssets([]); setLoading(false); return; }
      setLoading(true);
      setError('');
      const settingsPromise = supabase.from('generated_attachment_catalog_settings').select('*').eq('active', true).order('recipe_key');
      const overridesPromise = shopId
        ? supabase.from('generated_attachment_shop_overrides').select('*').eq('shop_id', shopId)
        : Promise.resolve({ data: [] as ShopOverrideRecord[], error: null });
      const [settingsResult, overridesResult] = await Promise.all([settingsPromise, overridesPromise]);
      if (!alive) return;
      const loadError = settingsResult.error || overridesResult.error;
      if (loadError) {
        setError('Generated attachments could not be loaded.');
        setAssets([]);
      } else {
        setAssets(resolveCatalogAssets(
          GENERATED_ATTACHMENT_RECIPES,
          (settingsResult.data || []) as CatalogSettingsRecord[],
          (overridesResult.data || []) as ShopOverrideRecord[],
          shopId,
        ));
      }
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [modelId, shopId]);

  useEffect(() => {
    if (loading || !sockets.length || !value.length) return;
    const socketsById = new Map(sockets.map((socket) => [socket.id, socket]));
    const assetsByKey = new Map(assets.map((asset) => [asset.recipe.key, asset]));
    let removed = false;
    let clamped = false;
    const next = value.reduce<AttachmentSelection[]>((selections, selection) => {
      const asset = assetsByKey.get(selection.recipeKey);
      if (!asset || selection.recipeVersion !== asset.recipe.version) { removed = true; return selections; }
      const placements = selection.placements.reduce<AttachmentSelection['placements']>((placementResult, placement) => {
        const socket = socketsById.get(placement.socket.id);
        const limitKey = attachmentPlacementKey(selection.id, placement.socket.id);
        const hasMeasuredLimits = placementLimits ? Object.prototype.hasOwnProperty.call(placementLimits, limitKey) : false;
        const limits = socket ? (hasMeasuredLimits ? placementLimits![limitKey] : getSocketTransformLimits(asset.recipe, socket)) : null;
        if (!socket || !limits) { removed = true; return placementResult; }
        const safeTransform = clampAttachmentTransform(placement.transform, limits);
        if (!rangesEqualTransform(safeTransform, placement.transform)) clamped = true;
        placementResult.push({ ...placement, transform: safeTransform });
        return placementResult;
      }, []);
      if (!placements.length) { removed = true; return selections; }
      selections.push({ ...selection, placements });
      return selections;
    }, []);
    const changed = removed || clamped || JSON.stringify(next) !== JSON.stringify(value);
    if (changed) {
      onChange(next);
      if (removed) onCompatibilityWarning?.('An attachment was removed because its socket is no longer safe for this shape.');
      else if (clamped) onCompatibilityWarning?.('An attachment adjustment was clamped to the nearest safe position.');
    }
  }, [assets, loading, onChange, onCompatibilityWarning, placementLimits, sockets, value]);

  const familySockets = sockets.filter((socket) => socket.family === activeFamily);
  const familyAssets = assets.filter((asset) => asset.recipe.family === activeFamily && familySockets.some((socket) => recipeFitsSocket(asset.recipe, socket)));
  const selectedAsset = familyAssets.find((asset) => asset.recipe.key === selectedRecipeKey);
  const occupied = selectedSocketIds(value);
  const lastSelection = value.at(-1);
  const visibleStage: AttachmentStage = activeStage === 3 && !value.length
    ? (selectedAsset ? 2 : 1)
    : activeStage === 2 && !selectedAsset ? 1 : activeStage;

  const socketGroups: SocketGroup[] = (() => {
    if (!selectedAsset) return [];
    const compatible = familySockets.filter((socket) => recipeFitsSocket(selectedAsset.recipe, socket));
    const groups = new Map<string, GeneratedAttachmentSocket[]>();
    for (const socket of compatible) {
      const key = socket.pairGroup || socket.id;
      groups.set(key, [...(groups.get(key) || []), socket]);
    }
    return [...groups.entries()].map(([key, groupedSockets]) => ({
      key,
      sockets: groupedSockets.sort((a, b) => a.name.localeCompare(b.name)),
      name: groupedSockets.length === 2 ? 'Handle position' : groupedSockets[0].name,
    }));
  })();

  function place(socketsToUse: GeneratedAttachmentSocket[]) {
    if (!selectedAsset) return;
    const nextSelection = createAttachmentSelection(selectedAsset, socketsToUse);
    onChange(upsertAttachmentSelection(value, nextSelection));
    setActivePlacementBySelection((current) => ({ ...current, [nextSelection.id]: nextSelection.placements[0].socket.id }));
    setExpandedSelectionId(nextSelection.id);
    setActiveStage(3);
  }

  function removeSelection(selectionId: string) {
    const next = value.filter((item) => item.id !== selectionId);
    onChange(next);
    if (!next.length) setActiveStage(selectedAsset ? 2 : 1);
    setExpandedSelectionId((current) => current === selectionId ? next.at(-1)?.id || '' : current);
  }

  function updateControl(selection: AttachmentSelection, socketId: string, key: ControlKey, rawValue: number, limits: AttachmentTransformLimits) {
    const placement = selection.placements.find((candidate) => candidate.socket.id === socketId);
    if (!placement) return;
    const step = limits[key].step;
    const snappedValue = Math.round(rawValue / step) * step;
    const nextTransform = clampAttachmentTransform({ ...placement.transform, [key]: snappedValue }, limits);
    onChange(updateAttachmentPlacement(value, selection.id, socketId, nextTransform));
  }

  function renderControl(selection: AttachmentSelection, socketId: string, transform: AttachmentPlacementTransform, limits: AttachmentTransformLimits, key: ControlKey, label: string) {
    const range = limits[key] as TransformRange;
    const inputId = `attachment-${selection.id}-${socketId}-${key}`.replace(/[^a-zA-Z0-9_-]/g, '-');
    return <div className="attachment-offset-control" key={key}>
      <span><label htmlFor={inputId}><strong>{label}</strong></label><output htmlFor={inputId}>{formatControlValue(key, transform[key], modelHeightCm)}</output></span>
      <input id={inputId} aria-label={label} type="range" min={range.min} max={range.max} step="any" value={transform[key]} onChange={(event) => updateControl(selection, socketId, key, Number(event.target.value), limits)} />
    </div>;
  }

  return <section className="attachment-tab">
    <div className="freeform-tab-heading">Generated Attachments</div>
    <p className="decor-help">Choose an ornament and position, then fine-tune how it sits on your pottery.</p>
    <div className="guided-panel-list">
      <PanelSection number={1} title="Choose Attachment" summary={selectedAsset?.recipe.name || 'Select a 3D detail'} expanded={visibleStage === 1} completed={Boolean(selectedAsset)} onToggle={() => setActiveStage(1)} regionId="attachment-choose-section">
        <div className="attachment-filter" role="tablist" aria-label="Attachment families">{ATTACHMENT_FAMILIES.map((family) => <button type="button" role="tab" aria-selected={activeFamily === family.id} className={activeFamily === family.id ? 'active' : ''} key={family.id} onClick={() => { setActiveFamily(family.id); setSelectedRecipeKey(''); setActiveStage(1); }}>{family.label}</button>)}</div>
        {loading ? <p className="attachment-empty">Analyzing compatible attachments…</p> : error ? <p className="attachment-empty attachment-error">{error}</p> : familySockets.length === 0 ? <p className="attachment-empty">This shape has no safe {ATTACHMENT_FAMILIES.find((family) => family.id === activeFamily)?.label.toLowerCase()} sockets.</p> : familyAssets.length === 0 ? <p className="attachment-empty">No configured recipe fits this shape safely.</p> : <div className="attachment-grid">{familyAssets.map((asset) => {
          const selected = selectedAsset?.recipe.key === asset.recipe.key;
          return <button type="button" key={asset.recipe.key} aria-pressed={selected} className={`attachment-card ${selected ? 'selected' : ''}`} onClick={() => { setSelectedRecipeKey(asset.recipe.key); setActiveStage(2); }}><img src={asset.recipe.thumbnail} alt="" /><span>{asset.recipe.name}</span><small>₱{asset.priceAdjustment.toLocaleString()} each</small></button>;
        })}</div>}
      </PanelSection>

      <PanelSection number={2} title="Choose Position" summary={lastSelection ? lastSelection.placements.map((placement) => placement.socket.name).join(' + ') : selectedAsset ? 'Select a socket' : 'Choose an attachment first'} expanded={visibleStage === 2} completed={Boolean(lastSelection)} disabled={!selectedAsset} onToggle={() => setActiveStage(2)} regionId="attachment-position-section">
        <div className="attachment-slot-list">{socketGroups.map((group) => <div className="attachment-slot" key={group.key}><div><strong>{group.name}</strong><small>{group.sockets.some((socket) => occupied.has(socket.id)) ? 'Occupied — selecting replaces it' : 'Available'}</small></div><div>{group.sockets.length === 2 ? <><button type="button" onClick={() => place([group.sockets[0]])}>{group.sockets[0].name}</button><button type="button" onClick={() => place([group.sockets[1]])}>{group.sockets[1].name}</button><button type="button" className="primary" onClick={() => place(group.sockets)}>Pair</button></> : <button type="button" className="primary" onClick={() => place(group.sockets)}>Place</button>}</div></div>)}</div>
      </PanelSection>

      <PanelSection number={3} title="Adjust Placement" summary={value.length ? `${value.length} selected attachment${value.length === 1 ? '' : 's'}` : 'Place an attachment first'} expanded={visibleStage === 3} completed={value.length > 0} disabled={!value.length} onToggle={() => setActiveStage(3)} regionId="attachment-adjust-section">
        <div className="attachment-selected-list">{value.map((selection) => {
          const recipe = getGeneratedAttachmentRecipe(selection.recipeKey, selection.recipeVersion);
          const requestedSocketId = activePlacementBySelection[selection.id];
          const activePlacement = selection.placements.find((placement) => placement.socket.id === requestedSocketId) || selection.placements[0];
          const liveSocket = sockets.find((socket) => socket.id === activePlacement.socket.id);
          const limitKey = attachmentPlacementKey(selection.id, activePlacement.socket.id);
          const hasMeasuredLimits = placementLimits ? Object.prototype.hasOwnProperty.call(placementLimits, limitKey) : false;
          const limits = recipe && liveSocket ? (hasMeasuredLimits ? placementLimits![limitKey] : getSocketTransformLimits(recipe, liveSocket)) : null;
          const adjustmentExpanded = expandedSelectionId === selection.id;
          const adjustmentRegionId = `attachment-adjust-${selection.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
          return <article className={`attachment-selected attachment-adjust-card${adjustmentExpanded ? ' expanded' : ''}`} key={selection.id}>
            <div className="attachment-adjust-heading">
              <button type="button" className="attachment-adjust-toggle" aria-expanded={adjustmentExpanded} aria-controls={adjustmentRegionId} onClick={() => setExpandedSelectionId(adjustmentExpanded ? '' : selection.id)}><span><strong>{selection.name}</strong><small>{selection.placements.map((placement) => placement.socket.name).join(' + ')}</small></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg></button>
              <button type="button" onClick={() => removeSelection(selection.id)}>Remove</button>
            </div>
            <div id={adjustmentRegionId} hidden={!adjustmentExpanded}>
              {selection.placements.length > 1 && <div className="attachment-instance-tabs" role="tablist" aria-label={`${selection.name} instances`}>{selection.placements.map((placement) => <button type="button" role="tab" aria-selected={placement.socket.id === activePlacement.socket.id} className={placement.socket.id === activePlacement.socket.id ? 'active' : ''} key={placement.socket.id} onClick={() => setActivePlacementBySelection((current) => ({ ...current, [selection.id]: placement.socket.id }))}>{placement.socket.name}</button>)}</div>}
              {limits ? <div className="attachment-offset-controls">{CONTROL_CONFIG.map(({ key, label }) => renderControl(selection, activePlacement.socket.id, activePlacement.transform, limits, key, label))}<button type="button" className="attachment-reset-position" onClick={() => onChange(updateAttachmentPlacement(value, selection.id, activePlacement.socket.id, clampAttachmentTransform(getDefaultAttachmentTransform(activePlacement.socket.family), limits)))}>Reset Position</button></div> : <p className="attachment-empty">This placement is unavailable for the current shape.</p>}
            </div>
          </article>;
        })}</div>
      </PanelSection>
    </div>
  </section>;
}
