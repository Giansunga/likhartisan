import { useEffect, useRef, useState } from 'react';

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
  onInteractionChange,
}: {
  shapeParams: ShapeParams;
  onChange: (params: ShapeParams) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const [draftParams, setDraftParams] = useState(shapeParams);
  const draftRef = useRef(shapeParams);
  const frameRef = useRef<number | null>(null);
  const interactingRef = useRef(false);

  useEffect(() => {
    if (interactingRef.current) return;
    draftRef.current = shapeParams;
    setDraftParams(shapeParams);
  }, [shapeParams]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  function beginInteraction() {
    if (interactingRef.current) return;
    interactingRef.current = true;
    onInteractionChange?.(true);
  }

  function flushChange() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    onChange(draftRef.current);
  }

  function endInteraction() {
    flushChange();
    interactingRef.current = false;
    onInteractionChange?.(false);
  }

  function handleChange(key: keyof ShapeParams, value: number) {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraftParams(next);
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      onChange(draftRef.current);
    });
  }

  return (
    <div>
      <h3 className="freeform-tab-heading">Shape Controls</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {SLIDERS.map((s) => {
          const val = draftParams[s.key];
          const pct = ((val - s.min) / (s.max - s.min)) * 100;
          return (
            <div key={s.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>{s.label}</label>
                <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-color)' }}>{val.toFixed(0)} cm</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{s.description}</p>
              <input
                type="range"
                min={s.min}
                max={s.max}
                value={val}
                aria-label={s.label}
                onPointerDown={beginInteraction}
                onPointerUp={endInteraction}
                onPointerCancel={endInteraction}
                onKeyDown={beginInteraction}
                onKeyUp={endInteraction}
                onBlur={() => {
                  if (interactingRef.current) endInteraction();
                }}
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

      <button onClick={() => {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        draftRef.current = { ...DEFAULTS };
        setDraftParams(draftRef.current);
        onChange(draftRef.current);
      }} className="freeform-tab-btn-outline" style={{ marginTop: '24px' }}>
        Reset Shape
      </button>
    </div>
  );
}
