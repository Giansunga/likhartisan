import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSavedDesigns, type SavedDesign } from '../../hooks/useSavedDesigns';
import { FINISHES } from './materials';

const COLOR_NAMES: Record<string, string> = {
  '#BE734F': 'Terracotta', '#C4A882': 'Natural Clay', '#A0522D': 'Sienna', '#8B4513': 'Saddle Brown',
  '#D2691E': 'Chocolate', '#CD853F': 'Peru', '#DEB887': 'Burlywood',
  '#B8860B': 'Dark Goldenrod', '#DAA520': 'Goldenrod', '#F4A460': 'Sandy Brown',
  '#E8C39E': 'Warm Beige', '#2E8B57': 'Sea Green', '#3CB371': 'Medium Sea Green',
  '#66CDAA': 'Aquamarine', '#8FBC8F': 'Dark Sea Green', '#228B22': 'Forest Green',
  '#006400': 'Dark Green', '#556B2F': 'Olive', '#6B8E23': 'Olive Drab',
  '#4682B4': 'Steel Blue', '#5F9EA0': 'Cadet Blue', '#87CEEB': 'Sky Blue',
  '#4169E1': 'Royal Blue', '#1E90FF': 'Dodger Blue', '#0000CD': 'Medium Blue',
  '#8B0000': 'Dark Red', '#B22222': 'Firebrick', '#DC143C': 'Crimson',
  '#FF6347': 'Tomato', '#FF4500': 'Orange Red', '#FF8C00': 'Dark Orange',
  '#FFD700': 'Gold', '#FFFFFF': 'White',
};

function getFinishLabel(finishId: string): string {
  return FINISHES.find((f) => f.id === finishId)?.label || finishId.replace(/_/g, ' ');
}

export default function SavedDesignsModal({
  open,
  currentShopId,
  onClose,
  onLoad,
}: {
  open: boolean;
  currentShopId: string | null;
  onClose: () => void;
  onLoad: (design: SavedDesign) => void | Promise<void>;
}) {
  const { user } = useAuth();
  const { designs, loading, fetchDesigns, renameDesign, deleteDesign } = useSavedDesigns(user?.id);
  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState(currentShopId || 'all');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) void fetchDesigns();
  }, [open, fetchDesigns]);

  const shopNames = useMemo(() => {
    const names = new Map<string, string>();
    designs.forEach((d) => {
      if (d.shop_id && d.shops?.name) names.set(d.shop_id, d.shops.name);
    });
    return names;
  }, [designs]);

  const filtered = useMemo(() => {
    return designs.filter((d) => {
      if (shopNames.size > 1 && shopFilter !== 'all' && d.shop_id !== shopFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          d.model_name.toLowerCase().includes(q) ||
          (d.shops?.name || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [designs, shopFilter, search, shopNames]);

  async function handleRename(id: string) {
    const ok = await renameDesign(id, renameValue.trim());
    if (ok) setRenamingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this design?')) return;
    await deleteDesign(id);
  }

  async function handleLoad(d: SavedDesign) {
    setLoadingId(d.id);
    try {
      await onLoad(d);
    } finally {
      setLoadingId(null);
    }
  }

  function closeModal() {
    setSearch('');
    setShopFilter(currentShopId || 'all');
    setRenamingId(null);
    setLoadingId(null);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="freeform-modal-overlay" onClick={closeModal}>
      <div className="freeform-modal saved-designs-modal" role="dialog" aria-modal="true" aria-labelledby="saved-designs-title" onClick={(e) => e.stopPropagation()}>
        <div className="saved-designs-header">
          <div className="saved-designs-heading">
            <span className="saved-designs-heading-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" />
                <path d="M9 8h6M9 11h6" />
              </svg>
            </span>
            <div>
              <span className="saved-designs-eyebrow">YOUR COLLECTION</span>
              <h3 id="saved-designs-title" className="freeform-modal-title">Load Saved Design</h3>
              <p>{loading ? 'Loading your designs…' : `${designs.length} saved design${designs.length !== 1 ? 's' : ''}`}</p>
            </div>
          </div>
          <button className="saved-designs-close" onClick={closeModal} aria-label="Close saved designs">&times;</button>
        </div>

        {!loading && designs.length > 1 && (
          <div className="saved-designs-filters">
            <label className="saved-designs-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
              <input type="search" placeholder="Search saved designs" aria-label="Search saved designs" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            {shopNames.size > 1 && (
              <div className="saved-designs-shop-filters" aria-label="Filter by shop">
                <button type="button" className={shopFilter === 'all' ? 'active' : ''} onClick={() => setShopFilter('all')}>All shops</button>
                {Array.from(shopNames.entries()).map(([id, name]) => (
                  <button type="button" key={id} className={shopFilter === id ? 'active' : ''} onClick={() => setShopFilter(id)}>{name}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="saved-designs-content">
          {loading ? (
            <div className="saved-designs-empty" role="status"><span className="saved-designs-spinner" aria-hidden="true" /><p>Loading your designs…</p></div>
          ) : designs.length === 0 ? (
            <div className="saved-designs-empty">
              <span className="saved-designs-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M23 13h18l-3 8H26l-3-8Z" /><path d="M26 21c0 6-9 10-9 20 0 10 7 16 15 16s15-6 15-16c0-10-9-14-9-20" /><path d="M22 40c6 4 14 4 20 0" /></svg>
              </span>
              <h4>{user ? 'Your first design starts here' : 'Sign in to view your designs'}</h4>
              <p>{user ? 'Save a design in Freeform and it will be ready to continue here.' : 'Your saved designs will appear here after you sign in.'}</p>
              <button type="button" className="saved-designs-primary" onClick={user ? closeModal : () => { closeModal(); window.dispatchEvent(new CustomEvent('open-auth', { detail: 'signin' })); }}>
                {user ? 'Continue designing' : 'Sign in'}
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="saved-designs-empty saved-designs-empty-filtered">
              <h4>No designs found</h4>
              <p>Try another search or shop filter.</p>
              <button type="button" className="saved-designs-clear" onClick={() => { setSearch(''); setShopFilter('all'); }}>Clear filters</button>
            </div>
          ) : (
            <div className="saved-designs-list">
              {filtered.map((d) => (
                <div key={d.id} className="saved-design-card">
                  <div className="saved-design-card-thumb">
                    {d.thumbnail ? (
                      <img src={d.thumbnail} alt="" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" style={{ width: '28px', height: '28px' }}>
                        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
                      </svg>
                    )}
                  </div>

                  <div className="saved-design-card-info">
                    {renamingId === d.id ? (
                      <div className="saved-design-rename">
                        <input
                          aria-label={`New name for ${d.name}`}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(d.id); }}
                          autoFocus
                        />
                        <button type="button" onClick={() => handleRename(d.id)} disabled={!renameValue.trim()}>Save</button>
                        <button type="button" onClick={() => setRenamingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <strong className="saved-design-card-name" title={d.name}>{d.name}</strong>
                    )}
                    {d.shops?.name && <span className="saved-design-card-shop">{d.shops.name}</span>}
                    <span className="saved-design-card-model">{d.model_name}</span>
                    <span className="saved-design-card-finish">
                      <span className="freeform-summary-row-swatch" style={{ background: d.material_params?.color }} aria-hidden="true" />
                      {getFinishLabel(d.material_params?.finish || '')}
                      {COLOR_NAMES[d.material_params?.color?.toUpperCase()] ? ` · ${COLOR_NAMES[d.material_params.color.toUpperCase()]}` : d.material_params?.color ? ` · ${d.material_params.color}` : ''}
                    </span>
                    <time className="saved-design-card-date" dateTime={d.updated_at || d.created_at}>{new Date(d.updated_at || d.created_at).toLocaleDateString()}</time>
                  </div>
                  <div className="saved-design-card-actions">
                    <button type="button" className="saved-design-load" onClick={() => handleLoad(d)} disabled={loadingId === d.id}>
                      {loadingId === d.id ? 'Loading…' : 'Load design'}
                    </button>
                    <div className="saved-design-card-secondary">
                      <button type="button" onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }} aria-label={`Rename ${d.name}`}>Rename</button>
                      <button type="button" onClick={() => handleDelete(d.id)} aria-label={`Delete ${d.name}`}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
