import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface Model3D {
  id: string;
  name: string;
  category: string;
  file_url: string;
  thumbnail: string;
  created_at: string;
}

export default function ModelManagePage() {
  const [models, setModels] = useState<Model3D[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Vase');
  const [glbFile, setGlbFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState('');
  const glbInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchModels();
  }, []);

  async function fetchModels() {
    setLoading(true);
    const { data } = await supabase.from('models_3d').select('*').order('created_at', { ascending: false });
    if (data) setModels(data);
    setLoading(false);
  }

  const filtered = models.filter(m => {
    const q = search.toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
  });

  function openCreate() {
    setFormName('');
    setFormCategory('Vase');
    setGlbFile(null);
    setThumbFile(null);
    setThumbPreview('');
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
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('products').upload(path, file);
    if (uploadErr) throw uploadErr;
    const { data: urlData } = supabase.storage.from('products').getPublicUrl(path);
    return urlData.publicUrl;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!glbFile || !formName.trim()) return;
    setSaving(true);
    setError('');

    try {
      const fileUrl = await uploadFile(glbFile, 'models');
      let thumbnailUrl = '';
      if (thumbFile) thumbnailUrl = await uploadFile(thumbFile, 'models');

      const { error: insertErr } = await supabase.from('models_3d').insert({
        name: formName.trim(),
        category: formCategory,
        file_url: fileUrl,
        thumbnail: thumbnailUrl,
      });
      if (insertErr) throw insertErr;

      setShowModal(false);
      fetchModels();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this model?')) return;
    await supabase.from('models_3d').delete().eq('id', id);
    fetchModels();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-brown-dark">3D Model Management</h2>
          <p className="text-sm text-brown-medium mt-1">Manage preset models for the freeform customizer</p>
        </div>
        <button onClick={openCreate}
          className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Upload Model
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search models..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent bg-white" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-brown-medium">Loading models...</div>
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
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">File</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} className="border-b border-cream-tertiary/50 hover:bg-cream-secondary/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-cream-secondary flex-shrink-0 border border-cream-tertiary">
                        {m.thumbnail ? (
                          <img src={m.thumbnail} alt={m.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" className="w-6 h-6">
                              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="font-semibold text-sm text-brown-dark">{m.name}</div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-brown-dark">{m.category}</td>
                  <td className="px-5 py-4 text-xs text-brown-light font-mono truncate max-w-[200px]">{m.file_url.split('/').pop()}</td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => handleDelete(m.id)}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-cream-tertiary">
              <h3 className="font-serif text-lg font-bold text-brown-dark">Upload 3D Model</h3>
              <button onClick={() => setShowModal(false)} className="text-brown-light hover:text-brown-dark transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
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

              <div>
                <label className="block text-sm font-medium text-brown-dark mb-2">GLB / GLTF File *</label>
                <input ref={glbInputRef} type="file" accept=".glb,.gltf" onChange={e => setGlbFile(e.target.files?.[0] || null)} className="hidden" />
                <div onClick={() => glbInputRef.current?.click()}
                  className="w-full p-4 rounded-xl border-2 border-dashed border-cream-tertiary cursor-pointer hover:border-accent transition-colors text-center">
                  {glbFile ? (
                    <p className="text-sm text-brown-dark font-medium">{glbFile.name}</p>
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
                    <img src={thumbPreview} alt="Thumbnail" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-brown-light">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 mb-1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      <span className="text-xs">Upload thumbnail</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={!formName.trim() || !glbFile || saving}
                  className="bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving ? 'Uploading...' : 'Upload Model'}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-cream-tertiary text-brown-medium hover:bg-cream-secondary transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
