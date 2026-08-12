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
  onLoad: (design: SavedDesign) => void;
}) {
  const { user } = useAuth();
  const { designs, fetchDesigns, renameDesign, deleteDesign } = useSavedDesigns(user?.id);
  const [search, setSearch] = useState('');
  const [shopFilter, setShopFilter] = useState(currentShopId || 'all');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchDesigns();
      setShopFilter(currentShopId || 'all');
      setSearch('');
    }
  }, [open, fetchDesigns, currentShopId]);

  const shopNames = useMemo(() => {
    const names = new Map<string, string>();
    designs.forEach((d) => {
      if (d.shop_id && d.shops?.name) names.set(d.shop_id, d.shops.name);
    });
    return names;
  }, [designs]);

  const filtered = useMemo(() => {
    return designs.filter((d) => {
      if (shopFilter !== 'all' && d.shop_id !== shopFilter) return false;
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
  }, [designs, shopFilter, search]);

  async function handleRename(id: string) {
    const ok = await renameDesign(id, renameValue.trim());
    if (ok) setRenamingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this design?')) return;
    await deleteDesign(id);
  }

  function handleLoad(d: SavedDesign) {
    setLoadingId(d.id);
    onLoad(d);
  }

  if (!open) return null;

  return (
    <div className="freeform-modal-overlay" onClick={onClose}>
      <div className="freeform-modal saved-designs-modal" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px', zIndex: 10,
            width: '28px', height: '28px', borderRadius: '50%',
            border: 'none', background: 'var(--bg-tertiary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', color: 'var(--text-muted)', transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
          aria-label="Close"
        >
          &times;
        </button>
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 className="freeform-modal-title">Load Saved Design</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {designs.length} saved design{designs.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="Search designs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="freeform-modal-input"
              style={{ flex: 1 }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShopFilter('all')}
              className={`freeform-tab-option${shopFilter === 'all' ? ' selected' : ''}`}
              style={{ padding: '5px 12px', fontSize: '0.75rem' }}
            >
              All Shops
            </button>
            {Array.from(shopNames.entries()).map(([id, name]) => (
              <button
                key={id}
                onClick={() => setShopFilter(id)}
                className={`freeform-tab-option${shopFilter === id ? ' selected' : ''}`}
                style={{ padding: '5px 12px', fontSize: '0.75rem' }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '0 28px 24px', maxHeight: '420px', overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>
              {search ? 'No designs match your search.' : 'No saved designs yet.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((d) => (
                <div
                  key={d.id}
                  className="saved-design-card"
                  style={{
                    display: 'flex', gap: '14px', padding: '14px', border: '1px solid var(--bg-tertiary)',
                    borderRadius: '14px', background: '#fff', alignItems: 'center',
                  }}
                >
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '12px', overflow: 'hidden',
                    background: 'var(--bg-secondary)', flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {d.thumbnail ? (
                      <img src={d.thumbnail} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" style={{ width: '28px', height: '28px' }}>
                        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
                      </svg>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renamingId === d.id ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(d.id); }}
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--primary-color)', borderRadius: '6px', fontSize: '0.8rem', outline: 'none' }}
                          autoFocus
                        />
                        <button onClick={() => handleRename(d.id)} style={{ border: 0, background: 'var(--primary-color)', color: '#fff', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setRenamingId(null)} style={{ border: '1px solid var(--bg-tertiary)', background: '#fff', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.name}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                      {d.shops?.name && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 600 }}>{d.shops.name}</span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.model_name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="freeform-summary-row-swatch" style={{ width: 12, height: 12, borderWidth: 1, background: d.material_params?.color }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {getFinishLabel(d.material_params?.finish || '')}
                          {COLOR_NAMES[d.material_params?.color?.toUpperCase()] ? ` · ${COLOR_NAMES[d.material_params.color.toUpperCase()]}` : ` ${d.material_params?.color}`}
                        </span>
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '2px' }}>
                      {new Date(d.updated_at || d.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: '2px 6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                      title="Rename"
                    >
                      &#9998;
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: '2px 6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                      title="Delete"
                    >
                      &#128465;
                    </button>
                  </div>

                  <button
                    onClick={() => handleLoad(d)}
                    style={{
                      flexShrink: 0, padding: '8px 18px', borderRadius: '10px', border: '1px solid var(--primary-color)',
                      background: loadingId === d.id ? 'var(--bg-tertiary)' : '#fff',
                      color: 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                    }}
                    disabled={loadingId === d.id}
                  >
                    {loadingId === d.id ? '...' : 'Load'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
