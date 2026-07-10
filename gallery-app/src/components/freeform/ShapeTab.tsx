interface ShapeParams {
  height: number;
  bodyWidth: number;
  neckWidth: number;
  rimSize: number;
  curvature: number;
}

const SLIDERS: {
  key: keyof ShapeParams;
  label: string;
  description: string;
  min: number;
  max: number;
}[] = [
  { key: 'height', label: 'Height', description: 'Full pottery height', min: 0, max: 50 },
  { key: 'bodyWidth', label: 'Body Width', description: 'Widest part / mid-part', min: 0, max: 40 },
  { key: 'neckWidth', label: 'Neck Width', description: 'Narrow neck opening', min: 0, max: 30 },
  { key: 'rimSize', label: 'Rim Size', description: 'Mouth rim / flare diameter', min: 0, max: 25 },
  { key: 'curvature', label: 'Curvature', description: 'Base bulge -- low = straight, high = curved', min: 0, max: 100 },
];

const DEFAULTS: ShapeParams = { height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 };

export default function ShapeTab({
  shapeParams,
  onChange,
}: {
  shapeParams: ShapeParams;
  onChange: (params: ShapeParams) => void;
}) {
  function handleChange(key: keyof ShapeParams, value: number) {
    onChange({ ...shapeParams, [key]: value });
  }

  return (
    <div>
      <h3 className="freeform-tab-heading">Shape Controls</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {SLIDERS.map((s) => {
          const val = shapeParams[s.key];
          const pct = ((val - s.min) / (s.max - s.min)) * 100;
          return (
            <div key={s.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>{s.label}</label>
                <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-color)' }}>{val.toFixed(0)} cm</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{s.description}</p>
              <input
                type="range"
                min={s.min}
                max={s.max}
                value={val}
                onChange={(e) => handleChange(s.key, Number(e.target.value))}
                className="freeform-tab-slider"
                style={{
                  background: `linear-gradient(to right, var(--primary-color) 0%, var(--primary-color) ${pct}%, var(--bg-tertiary) ${pct}%, var(--bg-tertiary) 100%)`,
                }}
              />
            </div>
          );
        })}
      </div>

      <button onClick={() => onChange({ ...DEFAULTS })} className="freeform-tab-btn-outline" style={{ marginTop: '24px' }}>
        Reset Shape
      </button>
    </div>
  );
}
