import AssetImage from '../../components/AssetImage';
import { confirmAction } from '../../lib/popups';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';
import { uploadToR2 } from '../../lib/r2';
import { getErrorMessage } from '../../lib/portalErrors';
import AttachmentManagePanel from './AttachmentManagePanel';
import { modelBaseFromRow, type ModelBaseColumns } from '../../components/freeform/modelEstimate';

interface Model3D extends ModelBaseColumns {
  id: string;
  name: string;
  category: string;
  file_url: string;
  thumbnail: string;
  shop_id: string | null;
  status: 'active' | 'archived';
  created_at: string;
}

interface ShopOption {
  id: string;
  name: string;
}

export default function ModelManagePage() {
  const [libraryView, setLibraryView] = useState<'models' | 'attachments'>('models');
  const [models, setModels] = useState<Model3D[]>([]);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [shopError, setShopError] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingModel, setEditingModel] = useState<Model3D | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Vase');
  const [formShopId, setFormShopId] = useState('');
  const [baseFields, setBaseFields] = useState({ height: '', bodyWidth: '', neckWidth: '', rimSize: '', price: '', productionDays: '' });
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState('');
  const glbInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const modelRequest = useRef(0);
  const shopRequest = useRef(0);
  const mutationVersion = useRef(0);
  const pendingActions = useRef(new Set<string>());
  const [pendingModelIds, setPendingModelIds] = useState(new Set<string>());

  const fetchModels = useCallback(async () => {
    const request = ++modelRequest.current;
    const version = mutationVersion.current;
    setLoading(true);
    setLoadError('');
    try {
      const { data, error: queryError } = await supabase.from('models_3d').select('*').order('created_at', { ascending: false });
      if (queryError) throw queryError;
      if (request === modelRequest.current && version === mutationVersion.current) setModels(data || []);
    } catch (cause) {
      if (request === modelRequest.current && version === mutationVersion.current) setLoadError(getErrorMessage(cause, 'Could not load 3D models.'));
    } finally {
      if (request === modelRequest.current) setLoading(false);
    }
  }, []);

  const fetchShops = useCallback(async () => {
    const request = ++shopRequest.current;
    setShopError('');
    try {
      const { data, error: queryError } = await supabase.from('shops').select('id, name').order('name');
      if (queryError) throw queryError;
      if (request === shopRequest.current) setShops(data || []);
    } catch (cause) {
      if (request === shopRequest.current) setShopError(getErrorMessage(cause, 'Could not load shops.'));
    }
  }, []);

  const invalidateLoads = useCallback(() => { ++modelRequest.current; ++shopRequest.current; }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) { void fetchModels(); void fetchShops(); } });
    return () => { active = false; invalidateLoads(); };
  }, [fetchModels, fetchShops, invalidateLoads]);

  usePortalRealtimeRefresh(['models_3d'], fetchModels);
  usePortalRealtimeRefresh(['shops'], fetchShops);

  function beginModelAction(id: string) {
    if (pendingActions.current.has(id)) return false;
    pendingActions.current.add(id);
    setPendingModelIds(new Set(pendingActions.current));
    ++mutationVersion.current;
    return true;
  }

  function finishModelAction(id: string) {
    pendingActions.current.delete(id);
    setPendingModelIds(new Set(pendingActions.current));
  }

  const filtered = models.filter(m => {
    if (showArchived ? m.status !== 'archived' : m.status === 'archived') return false;
    const q = search.toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
  });

  function openCreate() {
    if (saving) return;
    setEditingModel(null);
    setFormName('');
    setFormCategory('Vase');
    setFormShopId('');
    setBaseFields({ height: '', bodyWidth: '', neckWidth: '', rimSize: '', price: '', productionDays: '' });
    setGlbFile(null);
    setThumbFile(null);
    setThumbPreview('');
    setError('');
    setShowModal(true);
  }

  function openEdit(model: Model3D) {
    if (pendingActions.current.has(model.id)) return;
    setEditingModel(model);
    setFormName(model.name);
    setFormCategory(model.category);
    setFormShopId(model.shop_id || '');
    setBaseFields({
      height: model.base_height_in?.toString() || '', bodyWidth: model.base_body_width_in?.toString() || '',
      neckWidth: model.base_neck_width_in?.toString() || '', rimSize: model.base_rim_size_in?.toString() || '',
      price: model.base_price_php?.toString() || '', productionDays: model.base_production_days?.toString() || '',
    });
    setGlbFile(null);
    setThumbFile(null);
    setThumbPreview(model.thumbnail || '');
    setError('');
    setShowModal(true);
  }

  function handleThumbChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbFile(file);
    setThumbPreview(URL.createObjectURL(file));
  }

  async function uploadFile(file: File, folder: string): Promise<string> {
    return uploadToR2(file, folder);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!formName.trim()) return;
    if (!editingModel && !glbFile) return;
    const baseColumns: ModelBaseColumns = {
      base_height_in: Number(baseFields.height), base_body_width_in: Number(baseFields.bodyWidth),
      base_neck_width_in: Number(baseFields.neckWidth), base_rim_size_in: Number(baseFields.rimSize),
      base_price_php: Number(baseFields.price), base_production_days: Number(baseFields.productionDays),
    };
    if (Object.values(baseFields).some((value) => value.trim() === '') || !modelBaseFromRow(baseColumns)) {
      setError('Enter positive base dimensions up to 999.99 inches, a price above ₱0, and 1–365 production days.');
      return;
    }
    const actionId = editingModel?.id || 'new-model';
    if (!beginModelAction(actionId)) return;
    setSaving(true);
    setError('');

    try {
      let fileUrl = editingModel?.file_url || '';
      let thumbnailUrl = editingModel?.thumbnail || '';

      if (glbFile) fileUrl = await uploadFile(glbFile, 'models');
      if (thumbFile) thumbnailUrl = await uploadFile(thumbFile, 'models');

      let savedModel: Model3D;
      if (editingModel) {
        const updateData: Record<string, string | number | null> = {
          name: formName.trim(),
          category: formCategory,
          shop_id: formShopId || null,
          ...baseColumns,
        };
        if (glbFile) updateData.file_url = fileUrl;
        if (thumbFile) updateData.thumbnail = thumbnailUrl;

        const { data, error: updateErr } = await supabase.from('models_3d').update(updateData).eq('id', editingModel.id).select('*').maybeSingle();
        if (updateErr) throw updateErr;
        if (!data || data.id !== editingModel.id) throw new Error('Model could not be saved. It may have changed or you may no longer have access.');
        savedModel = data as Model3D;
      } else {
        const { data, error: insertErr } = await supabase.from('models_3d').insert({
          name: formName.trim(),
          category: formCategory,
          file_url: fileUrl,
          thumbnail: thumbnailUrl,
          shop_id: formShopId || null,
          ...baseColumns,
        }).select('*').single();
        if (insertErr) throw insertErr;
        if (!data?.id) throw new Error('The new model could not be confirmed. Reload the model library before trying again.');
        savedModel = data as Model3D;
      }

      ++mutationVersion.current;
      setModels(current => editingModel ? current.map(model => model.id === savedModel.id ? savedModel : model) : [savedModel, ...current]);
      setShowModal(false);
      setEditingModel(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save the model.'));
    } finally {
      setSaving(false);
      finishModelAction(actionId);
    }
  }

  async function handleArchive(id: string) {
    const model = models.find(m => m.id === id);
    if (!model || !beginModelAction(id)) return;
    setActionError('');
    try {
      if (model.status === 'active' && await isFeatured(id)) return;
      const newStatus = model.status === 'archived' ? 'active' : 'archived';
      const label = newStatus === 'archived' ? 'Archive' : 'Activate';
      if (!await confirmAction(`${label} "${model.name}"?`)) return;
      const { data, error: updateError } = await supabase.from('models_3d').update({ status: newStatus }).eq('id', id).select('*').maybeSingle();
      if (updateError) throw updateError;
      if (!data || data.id !== id) throw new Error('Model could not be updated. Reload the library and try again.');
      ++mutationVersion.current;
      setModels(current => current.map(item => item.id === id ? data as Model3D : item));
    } catch (cause) { setActionError(getErrorMessage(cause, 'Model could not be updated.')); }
    finally { finishModelAction(id); }
  }

  async function handleDelete(id: string) {
    if (!beginModelAction(id)) return;
    setActionError('');
    try {
      if (await isFeatured(id)) return;
      if (!await confirmAction('Delete this model?')) return;
      const { data, error: deleteError } = await supabase.from('models_3d').delete().eq('id', id).select('id').maybeSingle();
      if (deleteError) throw deleteError;
      if (!data || data.id !== id) throw new Error('Model could not be deleted. Reload the library and try again.');
      ++mutationVersion.current;
      setModels(current => current.filter(item => item.id !== id));
    } catch (cause) { setActionError(getErrorMessage(cause, 'Model could not be deleted.')); }
    finally { finishModelAction(id); }
  }

  async function isFeatured(id: string): Promise<boolean> {
    setActionError('');
    try {
      const { data, error: checkError } = await supabase.from('landing_3d_feature')
        .select('model_id').eq('id', 'current').maybeSingle();
      if (checkError?.code === '42P01' || checkError?.code === 'PGRST205') return false;
      if (checkError) throw checkError;
      if (data?.model_id !== id) return false;
      setActionError('Publish a different featured model before archiving or deleting this one.');
      return true;
    } catch {
      setActionError('Could not check whether this model is featured. Try again.');
      return true;
    }
  }

  if (libraryView === 'attachments') return <AttachmentManagePanel onBack={() => setLibraryView('models')} />;

  return (
    <div>
      <div className="portal-action-bar">
        <Link to="/admin/models/featured" className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-cream-tertiary bg-white text-brown-dark hover:bg-cream-secondary">Edit Featured 3D Preview</Link>
        <button onClick={openCreate}
          className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Upload Model
        </button>
      </div>
      {actionError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>}
      {shopError && <p role="alert" className="mb-4 text-sm text-red-700">{shopError} <button type="button" onClick={() => void fetchShops()}>Retry shops</button></p>}

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search models..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent bg-white" />
        </div>
        <button onClick={() => setLibraryView('attachments')} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-cream-tertiary bg-white text-brown-medium hover:bg-cream-secondary whitespace-nowrap">Generated Attachments</button>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors flex items-center gap-2 ${
            showArchived
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-white border-cream-tertiary text-brown-medium hover:bg-cream-secondary'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
          </svg>
          {showArchived ? 'Hide Archived' : 'Show Archived'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-brown-medium">Loading models...</div>
      ) : loadError ? (
        <div role="alert" className="text-center py-12 text-red-700">{loadError} <button type="button" onClick={() => void fetchModels()}>Retry models</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-cream-tertiary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-16 h-16 mx-auto mb-4 text-brown-light/40">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <p className="text-brown-medium text-lg font-medium mb-1">No models uploaded</p>
          <p className="text-brown-light text-sm">Click "Upload Model" to add one</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-cream-tertiary overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cream-tertiary bg-cream-secondary/50">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Model</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Category</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Shop</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">File</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} className={`border-b border-cream-tertiary/50 hover:bg-cream-secondary/30 transition-colors ${m.status === 'archived' ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-cream-secondary flex-shrink-0 border border-cream-tertiary">
                        <AssetImage src={m.thumbnail} alt={m.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="font-semibold text-sm text-brown-dark">{m.name}</div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-brown-dark">{m.category}</td>
                  <td className="px-5 py-4 text-sm text-brown-dark">{shops.find(s => s.id === m.shop_id)?.name || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      m.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {m.status === 'active' ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-brown-light font-mono truncate max-w-[200px]">{m.file_url.split('/').pop()}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button disabled={pendingModelIds.has(m.id)} onClick={() => openEdit(m)}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                        Edit
                      </button>
                      <button disabled={pendingModelIds.has(m.id)} onClick={() => void handleArchive(m.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          m.status === 'archived'
                            ? 'text-green-700 border border-green-200 hover:bg-green-50'
                            : 'text-amber-700 border border-amber-200 hover:bg-amber-50'
                        }`}>
                        {m.status === 'archived' ? 'Activate' : 'Archive'}
                      </button>
                      <button disabled={pendingModelIds.has(m.id)} onClick={() => void handleDelete(m.id)}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { if (!saving) setShowModal(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-cream-tertiary">
              <h3 className="font-serif text-lg font-bold text-brown-dark">{editingModel ? 'Edit 3D Model' : 'Upload 3D Model'}</h3>
              <button disabled={saving} aria-label="Close model editor" onClick={() => { setShowModal(false); setEditingModel(null); }} className="text-brown-light hover:text-brown-dark transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 max-h-[75vh] overflow-y-auto">
              <fieldset disabled={saving} className="space-y-5 border-0 p-0 m-0">
              {error && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-brown-dark mb-1">Model Name *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} required placeholder="e.g. Classic Vase"
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
              </div>

              <div>
                <label className="block text-sm font-medium text-brown-dark mb-1">Category</label>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent bg-white">
                  <option value="Vase">Vase</option>
                  <option value="Jar">Jar</option>
                  <option value="Planter">Planter</option>
                  <option value="Bowl">Bowl</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-brown-dark">Base dimensions (inches) *</legend>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['height', 'Height'], ['bodyWidth', 'Body width'], ['neckWidth', 'Neck width'], ['rimSize', 'Rim size'],
                  ] as const).map(([key, label]) => {
                    return <label key={key} className="text-sm text-brown-dark">{label}
                      <input type="number" required step="0.01" value={baseFields[key]}
                        onChange={e => setBaseFields(prev => ({ ...prev, [key]: e.target.value }))}
                        className="mt-1 w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
                    </label>;
                  })}
                </div>
              </fieldset>
              <p className="text-xs text-brown-light">The stored GLB is calibrated to these measurements when uploaded or when they change.</p>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-brown-dark">Base price (₱) *
                  <input type="number" required min="0.01" step="0.01" value={baseFields.price}
                    onChange={e => setBaseFields(prev => ({ ...prev, price: e.target.value }))}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
                </label>
                <label className="text-sm text-brown-dark">Base production (days) *
                  <input type="number" required min="1" max="365" step="1" value={baseFields.productionDays}
                    onChange={e => setBaseFields(prev => ({ ...prev, productionDays: e.target.value }))}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
                </label>
              </div>
              <p className="text-xs text-brown-light">These are starting values for a mock estimate; the shop confirms the final quote.</p>

              <div>
                <label className="block text-sm font-medium text-brown-dark mb-1">Assign to Shop *</label>
                <select value={formShopId} onChange={e => setFormShopId(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent bg-white">
                  <option value="">Select a shop...</option>
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-brown-dark mb-2">
                  GLB / GLTF File {editingModel ? '(optional — leave empty to keep current)' : '*'}
                </label>
                <input ref={glbInputRef} type="file" accept=".glb,.gltf" onChange={e => setGlbFile(e.target.files?.[0] || null)} className="hidden" />
                <div onClick={() => glbInputRef.current?.click()}
                  className="w-full p-4 rounded-xl border-2 border-dashed border-cream-tertiary cursor-pointer hover:border-accent transition-colors text-center">
                  {glbFile ? (
                    <p className="text-sm text-brown-dark font-medium">{glbFile.name}</p>
                  ) : editingModel ? (
                    <p className="text-sm text-brown-light">Current: {editingModel.file_url.split('/').pop()}</p>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 mx-auto mb-1 text-brown-light">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <p className="text-xs text-brown-light">Click to browse GLB/GLTF files</p>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-brown-dark mb-2">Thumbnail (optional)</label>
                <input ref={thumbInputRef} type="file" accept="image/*" onChange={handleThumbChange} className="hidden" />
                <div onClick={() => thumbInputRef.current?.click()}
                  className="w-full h-28 rounded-xl border-2 border-dashed border-cream-tertiary cursor-pointer overflow-hidden hover:border-accent transition-colors">
                  {thumbPreview ? (
                    <AssetImage src={thumbPreview} alt="Thumbnail" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-brown-light">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 mb-1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      <span className="text-xs">Upload thumbnail</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={!formName.trim() || (!editingModel && !glbFile) || saving}
                  className="bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving ? 'Saving...' : editingModel ? 'Save Changes' : 'Upload Model'}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setEditingModel(null); }}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-cream-tertiary text-brown-medium hover:bg-cream-secondary transition-colors">
                  Cancel
                </button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
