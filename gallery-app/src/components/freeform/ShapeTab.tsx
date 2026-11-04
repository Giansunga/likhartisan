import { useControlDraft } from './useControlDraft';
import { useState } from 'react';
import { DEFAULT_SHAPE_PARAMS_IN, formatInches, type ShapeParamsInches } from '../../lib/measurements';

type ShapeParams = ShapeParamsInches;
type ShapeControlKey = 'height' | 'bodyWidth' | 'neckWidth' | 'rimSize' | 'curvature';

const SLIDERS: {
  key: ShapeControlKey;
  label: string;
  description: string;
  min: number;
  max: number;
}[] = [
  { key: 'height', label: 'Height', description: 'Full pottery height', min: 2, max: 20 },
  { key: 'bodyWidth', label: 'Body Width', description: 'Widest part / mid-part', min: 2, max: 16 },
  { key: 'neckWidth', label: 'Neck Width', description: 'Narrow section below the rim', min: 1, max: 12 },
  { key: 'rimSize', label: 'Rim Size', description: 'Mouth rim / flare diameter', min: 1, max: 10 },
  { key: 'curvature', label: 'Curvature', description: 'Body curve — low = straighter, high = fuller', min: 0, max: 100 },
];

const DEFAULTS: ShapeParams = DEFAULT_SHAPE_PARAMS_IN;

export default function ShapeTab({
  shapeParams,
  baseShape,
  onChange,
  onInteractionChange,
  modelKey = '',
  targetsPending = false,
  resetDisabled = false,
}: {
  shapeParams: ShapeParams;
  baseShape?: ShapeParams;
  modelKey?: string;
  targetsPending?: boolean;
  resetDisabled?: boolean;
  onChange: (params: ShapeParams) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const controls = useControlDraft(shapeParams, onChange, onInteractionChange);
  const draftParams = controls.draft;
  const baselineShape = baseShape || DEFAULTS;
  // A saved outlier extends the range once; dragging never changes its endpoints.
  const baselineKey = JSON.stringify([modelKey, baselineShape]);
  const makeRanges = () => Object.fromEntries(SLIDERS.map(({ key, min, max }) => [key,
    key === 'curvature' ? { min, max } : {
      min: Math.min(Math.max(0.01, baselineShape[key] * 0.5), shapeParams[key]),
      max: Math.max(baselineShape[key] * 1.5, shapeParams[key]),
    },
  ]));
  const [rangeState, setRangeState] = useState(() => ({ key: baselineKey, ranges: makeRanges() }));
  let ranges = rangeState.ranges;
  if (rangeState.key !== baselineKey) {
    ranges = makeRanges();
    setRangeState({ key: baselineKey, ranges });
  }

  return (
    <div>
      <h3 className="freeform-tab-heading">Shape Controls</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {SLIDERS.map((s) => {
          const val = draftParams[s.key];
          const baseline = baseShape?.[s.key] ?? DEFAULTS[s.key];
          const min = ranges[s.key].min;
          const max = ranges[s.key].max;
          const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
          const change = val - baseline;
          const profile = shapeParams.targetProfile;
          const unavailable = s.key === 'bodyWidth' && profile?.body === null
            ? 'No reliable body target for this model.'
            : s.key === 'neckWidth' && profile?.neck === null
              ? 'No distinct neck detected. Use Rim Size for the opening.'
              : null;
          return (
            <div key={s.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>{s.label}</label>
                <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-color)' }}>{s.key === 'curvature' ? `${change > 0 ? '+' : ''}${change.toFixed(0)}%` : `${change > 0 ? '+' : ''}${formatInches(change)}`}</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{unavailable ?? s.description}</p>
              <input
                type="range"
                disabled={targetsPending || Boolean(unavailable)}
                min={min}
                max={max}
                value={val}
                aria-label={s.label}
                onPointerDown={controls.begin}
                onPointerUp={controls.end}
                onPointerCancel={controls.end}
                onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) controls.begin(); }}
                onKeyUp={controls.end}
                onBlur={controls.end}
                onChange={(e) => controls.update({ ...controls.draftRef.current, [s.key]: Number(e.target.value) })}
                aria-valuetext={s.key === 'curvature' ? `${val}% curvature` : formatInches(val)}
                step={s.key === 'curvature' ? 1 : 0.1}
                className="freeform-tab-slider"
                style={{
                  background: `linear-gradient(to right, var(--primary-color) 0%, var(--primary-color) ${pct}%, var(--bg-tertiary) ${pct}%, var(--bg-tertiary) 100%)`,
                }}
              />
            </div>
          );
        })}
      </div>

      <button disabled={resetDisabled || targetsPending} onClick={() => controls.reset({ ...baselineShape })} className="freeform-tab-btn-outline" style={{ marginTop: '24px' }}>
        Reset Shape
      </button>
    </div>
  );
}
