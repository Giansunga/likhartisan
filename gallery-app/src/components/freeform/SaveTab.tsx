import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface SavedDesign {
  id: string;
  name: string;
  model_name: string;
  model_file: string;
  shape_params: any;
  material_params: any;
  created_at: string;
}

export default function SaveTab({
  modelFile,
  modelName,
  shapeParams,
  materialParams,
  onLoad,
}: {
  modelFile: string;
  modelName: string;
  shapeParams: any;
  materialParams: any;
  onLoad: (design: SavedDesign) => void;
}) {
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setUserId(session.user.id);
        await fetchDesigns(session.user.id);
      } else {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function fetchDesigns(uid: string) {
    setLoading(true);
    const { data } = await supabase
      .from('designs')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (data) setDesigns(data);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this design?')) return;
    await supabase.from('designs').delete().eq('id', id);
    if (userId) await fetchDesigns(userId);
  }

  if (!userId) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" style={{ width: '48px', height: '48px', margin: '0 auto 12px', opacity: 0.4 }}>
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4-4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sign in to save your designs</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="freeform-tab-heading" style={{ marginBottom: '12px' }}>My Designs</h4>

      {loading ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading...</p>
      ) : designs.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No saved designs yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
          {designs.map((d) => (
            <div key={d.id} className="freeform-saved-design">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.model_name}</p>
              </div>
              <button onClick={() => onLoad(d)} className="freeform-saved-load">Load</button>
              <button onClick={() => handleDelete(d.id)} className="freeform-saved-delete">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
