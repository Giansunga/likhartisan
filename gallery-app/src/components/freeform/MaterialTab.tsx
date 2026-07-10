import { useState } from 'react';

interface MaterialParams {
  finish: string;
  color: string;
}

const FINISHES = [
  { id: 'raw_clay', label: 'Raw Clay', color: '#C4A882' },
  { id: 'matte', label: 'Matte', color: '#8B7355' },
  { id: 'ceramic', label: 'Ceramic', color: '#E8E0D8' },
  { id: 'glazed', label: 'Glazed', color: '#D4A574' },
  { id: 'metallic', label: 'Metallic', color: '#A0A0A0' },
];

const COLORS = [
  '#C4A882', '#A0522D', '#8B4513', '#D2691E', '#CD853F', '#DEB887',
  '#B8860B', '#DAA520', '#F4A460', '#E8C39E', '#2E8B57', '#3CB371',
  '#66CDAA', '#8FBC8F', '#228B22', '#006400', '#556B2F', '#6B8E23',
  '#4682B4', '#5F9EA0', '#87CEEB', '#4169E1', '#1E90FF', '#0000CD',
  '#8B0000', '#B22222', '#DC143C', '#FF6347', '#FF4500', '#FF8C00',
  '#FFD700', '#FFFFFF',
];

export default function MaterialTab({
  materialParams,
  onChange,
}: {
  materialParams: MaterialParams;
  onChange: (params: MaterialParams) => void;
}) {
  const [customColor, setCustomColor] = useState(materialParams.color);

  function selectFinish(finish: string) {
    const f = FINISHES.find((x) => x.id === finish);
    if (f) {
      onChange({ finish, color: f.color });
      setCustomColor(f.color);
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
        {FINISHES.map((f) => (
          <button
            key={f.id}
            onClick={() => selectFinish(f.id)}
            className={`freeform-tab-option${materialParams.finish === f.id ? ' selected' : ''}`}
            style={{ padding: '10px' }}
          >
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0, background: f.color }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-dark)' }}>{f.label}</span>
          </button>
        ))}
      </div>

      <h4 className="freeform-tab-subheading">Color</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px', marginBottom: '16px' }}>
        {COLORS.map((c) => (
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

      <button onClick={() => { onChange({ finish: 'raw_clay', color: '#C4A882' }); setCustomColor('#C4A882'); }} className="freeform-tab-btn-outline">
        Reset Material
      </button>
    </div>
  );
}
