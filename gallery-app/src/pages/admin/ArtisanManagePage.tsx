import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface Artisan {
  id: string;
  shop_id: string;
  name: string;
  specialty: string;
  experience: string;
  location: string;
  description: string;
  cover_image: string;
  created_at: string;
  shop_name?: string;
}

interface ShopOption {
  id: string;
  name: string;
}

const emptyForm = {
  name: '', shop_id: '', specialty: '', experience: '', location: '', description: '', cover_image: '',
};

export default function ArtisanManagePage() {
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterShop, setFilterShop] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [artRes, shopRes] = await Promise.all([
      supabase.from('artisans').select('*').order('created_at', { ascending: false }),
      supabase.from('shops').select('id, name').order('name'),
    ]);
    if (shopRes.data) setShops(shopRes.data);
    if (artRes.data) {
      const shopMap = new Map((shopRes.data || []).map((s: any) => [s.id, s.name]));
      setArtisans(artRes.data.map((a: any) => ({ ...a, shop_name: shopMap.get(a.shop_id) || '' })));
    }
    setLoading(false);
  }

  const filtered = artisans.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.name.toLowerCase().includes(q) || a.location.toLowerCase().includes(q);
    const matchShop = !filterShop || a.shop_id === filterShop;
    return matchSearch && matchShop;
  });

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setCoverFile(null);
    setCoverPreview('');
    setError('');
    setShowModal(true);
  }

  function openEdit(a: Artisan) {
    setEditId(a.id);
    setForm({ name: a.name, shop_id: a.shop_id, specialty: a.specialty, experience: a.experience, location: a.location, description: a.description, cover_image: a.cover_image });
    setCoverFile(null);
    setCoverPreview(a.cover_image || '');
    setError('');
    setShowModal(true);
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function uploadImage(file: File, folder: string): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('products').upload(path, file);
    if (uploadErr) throw uploadErr;
    const { data: urlData } = supabase.storage.from('products').getPublicUrl(path);
    return urlData.publicUrl;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      let coverUrl = form.cover_image;

      if (coverFile) coverUrl = await uploadImage(coverFile, 'artisans');

      const row = {
        name: form.name,
        shop_id: form.shop_id || null,
        specialty: form.specialty,
        experience: form.experience,
        location: form.location,
        description: form.description,
        cover_image: coverUrl,
      };

      if (editId) {
        const { error: updateErr } = await supabase.from('artisans').update(row).eq('id', editId);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('artisans').insert(row);
        if (insertErr) throw insertErr;
      }

      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this artisan?')) return;
    await supabase.from('artisans').delete().eq('id', id);
    fetchData();
  }

  function handleCoverClick() { coverInputRef.current?.click(); }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-brown-dark">Artisan Management</h2>
          <p className="text-sm text-brown-medium mt-1">Manage artisans displayed on the Artisans page</p>
        </div>
        <button onClick={openCreate}
          className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Artisan
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search artisans..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent bg-white" />
        </div>
        <select value={filterShop} onChange={e => setFilterShop(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent bg-white text-brown-dark">
          <option value="">All Shops</option>
          {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-brown-medium">Loading artisans...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-cream-tertiary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-16 h-16 mx-auto mb-4 text-brown-light/40">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          <p className="text-brown-medium text-lg font-medium mb-1">No artisans found</p>
          <p className="text-brown-light text-sm">Click "Add Artisan" to create one</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-cream-tertiary overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cream-tertiary bg-cream-secondary/50">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Artisan</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Shop</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Specialty</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Experience</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-brown-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className="border-b border-cream-tertiary/50 hover:bg-cream-secondary/30 transition-colors">
                  <td className="px-5 py-4">
                    <div>
                      <div className="font-semibold text-sm text-brown-dark">{a.name}</div>
                      {a.description && (
                        <div className="text-xs text-brown-light truncate max-w-[200px]">{a.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-brown-dark">{a.shop_name || '—'}</td>
                  <td className="px-5 py-4 text-sm text-brown-dark">{a.specialty || '—'}</td>
                  <td className="px-5 py-4 text-sm text-brown-dark">{a.experience || '—'}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(a)}
                        className="px-3 py-1.5 text-xs font-medium text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(a.id)}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-cream-tertiary">
              <h3 className="font-serif text-lg font-bold text-brown-dark">{editId ? 'Edit Artisan' : 'Add Artisan'}</h3>
              <button onClick={() => setShowModal(false)} className="text-brown-light hover:text-brown-dark transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-brown-dark mb-1">Name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                    className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-brown-dark mb-1">Shop</label>
                  <select value={form.shop_id} onChange={e => setForm(p => ({ ...p, shop_id: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent bg-white">
                    <option value="">No shop assigned</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-brown-dark mb-1">Specialty</label>
                  <input value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))} placeholder="e.g. Clay Vessels, Glaze Art, Sculptures"
                    className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brown-dark mb-1">Experience</label>
                  <input value={form.experience} onChange={e => setForm(p => ({ ...p, experience: e.target.value }))} placeholder="e.g. 35+ years"
                    className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brown-dark mb-1">Location</label>
                  <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Santo Tomas, Pampanga"
                    className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-brown-dark mb-1">Description</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3}
                    className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent resize-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-brown-dark mb-2">Cover Photo</label>
                <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
                <div onClick={handleCoverClick} className="relative w-full h-40 rounded-xl border-2 border-dashed border-cream-tertiary cursor-pointer overflow-hidden hover:border-accent transition-colors group">
                  {coverPreview ? (
                    <>
                      <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Change</span>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-brown-light">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 mb-1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      <span className="text-xs">Upload cover photo</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={!form.name || saving}
                  className="bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Artisan'}
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
