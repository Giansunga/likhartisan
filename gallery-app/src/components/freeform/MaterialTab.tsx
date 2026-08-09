import { useState, useEffect } from 'react';
import { FINISHES, MATERIAL_COLORS, SHOP_FINISHES, isFinishId, type FinishId, type MaterialParams } from './materials';

export default function MaterialTab({
  materialParams,
  onChange,
  shopName,
}: {
  materialParams: MaterialParams;
  onChange: (params: MaterialParams) => void;
  shopName?: string;
}) {
  const [customColor, setCustomColor] = useState(materialParams.color);

  const availableFinishIds = shopName ? (SHOP_FINISHES[shopName] || null) : null;
  const availableFinishes = availableFinishIds
    ? FINISHES.filter((f) => availableFinishIds.includes(f.id))
    : FINISHES;

  useEffect(() => {
    if (availableFinishIds && (!isFinishId(materialParams.finish) || !availableFinishIds.includes(materialParams.finish))) {
      const first = FINISHES.find((f) => f.id === availableFinishIds[0]);
      if (first) {
        onChange({ ...materialParams, finish: first.id });
      }
    }
  }, [availableFinishIds, materialParams, onChange]);

  function selectFinish(finish: FinishId) {
    const f = FINISHES.find((x) => x.id === finish);
    if (f) {
      const color = finish === 'raw_clay' ? f.color : materialParams.color;
      if (finish === 'raw_clay') setCustomColor(color);
      onChange({ ...materialParams, finish, color });
    }
  }

  function selectColor(color: string) {
    setCustomColor(color);
    onChange({ ...materialParams, color });
  }

  return (
    <div>
      <h3 className="freeform-tab-heading">Color &amp; Material</h3>

      <h4 className="freeform-tab-subheading">Finish</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
        {availableFinishes.map((f) => (
          <button
            key={f.id}
            onClick={() => selectFinish(f.id)}
            className={`freeform-tab-option${materialParams.finish === f.id ? ' selected' : ''}`}
            style={{ padding: '10px' }}
          >
            <div aria-hidden="true" style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0, background: f.preview, boxShadow: f.id === 'glazed' ? 'inset -2px -2px 5px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.16)' : 'inset -2px -2px 4px rgba(0,0,0,.12)' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-dark)' }}>{f.label}</span>
          </button>
        ))}
      </div>

      <h4 className="freeform-tab-subheading">Color</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px', marginBottom: '16px' }}>
        {MATERIAL_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => selectColor(c)}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: '8px',
              border: materialParams.color === c ? '2px solid var(--primary-color)' : '2px solid transparent',
              background: c,
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              transform: materialParams.color === c ? 'scale(1.1)' : 'scale(1)',
              boxShadow: materialParams.color === c ? '0 2px 8px rgba(130,62,11,0.2)' : 'none',
            }}
            title={c}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <label className="freeform-tab-subheading" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Custom</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <input
            type="color"
            value={customColor}
            onChange={(e) => selectColor(e.target.value)}
            style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1.5px solid var(--bg-tertiary)', cursor: 'pointer', padding: 0 }}
          />
          <input
            type="text"
            value={customColor}
            onChange={(e) => selectColor(e.target.value)}
            className="freeform-tab-input"
            style={{ flex: 1, padding: '8px 12px', fontSize: '0.78rem', fontFamily: 'monospace' }}
          />
        </div>
      </div>

      <button onClick={() => { onChange({ finish: 'raw_clay', color: '#BE734F' }); setCustomColor('#BE734F'); }} className="freeform-tab-btn-outline">
        Reset Material
      </button>
    </div>
  );
}
