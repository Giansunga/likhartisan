import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { type AttachmentParams, type AttachmentRecord, type AttachmentType, toAttachmentParams } from './attachments';

const TYPE_LABELS: Record<AttachmentType, string> = {
  handle: 'Handles', lid: 'Lids', spout: 'Spouts', foot: 'Feet', knob: 'Knobs', other: 'Other',
};

export default function AttachmentTab({ shopId, modelCategory, value, onChange }: {
  shopId: string | null;
  modelCategory: string;
  value: AttachmentParams[];
  onChange: (attachments: AttachmentParams[]) => void;
}) {
  const [items, setItems] = useState<AttachmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<AttachmentType | 'all'>('all');

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      let query = supabase.from('model_attachments').select('*').eq('status', 'active').order('name');
      if (shopId) query = query.eq('shop_id', shopId);
      const { data } = await query;
      if (alive) { setItems((data || []) as AttachmentRecord[]); setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [shopId]);

  const compatible = useMemo(() => items.filter((item) => {
    const categories = item.compatible_categories || [];
    return !categories.length || categories.includes('*') || categories.includes(modelCategory);
  }), [items, modelCategory]);
  const types = [...new Set(compatible.map((item) => item.attachment_type))] as AttachmentType[];
  const visible = activeType === 'all' ? compatible : compatible.filter((item) => item.attachment_type === activeType);

  function select(item: AttachmentRecord) {
    const attachment = toAttachmentParams(item);
    onChange([...value.filter((current) => current.type !== attachment.type), attachment]);
  }

  return (
    <section className="attachment-tab">
      <div className="freeform-tab-heading">3D attachments</div>
      <p className="decor-help">Add artisan-made GLB pieces to the outside of your pottery. One attachment can be selected per type.</p>
      {loading ? <p className="attachment-empty">Loading attachment library...</p> : compatible.length === 0 ? <p className="attachment-empty">No compatible attachments are available for this model yet.</p> : <>
        <div className="attachment-filter" role="tablist" aria-label="Attachment types">
          <button type="button" className={activeType === 'all' ? 'active' : ''} onClick={() => setActiveType('all')}>All</button>
          {types.map((type) => <button type="button" key={type} className={activeType === type ? 'active' : ''} onClick={() => setActiveType(type)}>{TYPE_LABELS[type]}</button>)}
        </div>
        <div className="attachment-grid">
          {visible.map((item) => {
            const selected = value.some((current) => current.id === item.id);
            return <button type="button" key={item.id} className={`attachment-card ${selected ? 'selected' : ''}`} onClick={() => select(item)}>
              {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <span className="attachment-placeholder">3D</span>}
              <span>{item.name}</span><small>{TYPE_LABELS[item.attachment_type]}</small>
            </button>;
          })}
        </div>
      </>}
      {value.length > 0 && <div className="attachment-selected-list">
        <label className="decor-field-label">Added attachments</label>
        {value.map((attachment) => <div className="attachment-selected" key={attachment.id}><span>{attachment.name}</span><button type="button" onClick={() => onChange(value.filter((current) => current.id !== attachment.id))}>Remove</button></div>)}
      </div>}
    </section>
  );
}
