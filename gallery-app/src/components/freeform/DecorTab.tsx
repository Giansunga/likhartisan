import { useEffect, useState } from 'react';
import { DEFAULT_DECORATION, PATTERN_CATEGORIES, createPatternSvg, getPatternCategory, getPatternsByCategory, type DecorationParams, type PatternCategory } from './decor';

export default function DecorTab({ decoration, onChange }: { decoration: DecorationParams; onChange: (value: DecorationParams) => void }) {
  const update = (patch: Partial<DecorationParams>) => onChange({ ...decoration, ...patch });
  const [activeCategory, setActiveCategory] = useState<PatternCategory>(() => getPatternCategory(decoration.patternId) || 'floral');
  const visiblePatterns = getPatternsByCategory(activeCategory);

  useEffect(() => {
    const selectedCategory = getPatternCategory(decoration.patternId);
    if (selectedCategory) setActiveCategory(selectedCategory);
  }, [decoration.patternId]);

  return (
    <div className="decor-tab">
      <div className="freeform-tab-heading">Pattern decoration</div>
      <p className="decor-help">Choose a category, then select one of five original motifs to wrap around your pottery.</p>

      <div className="decor-category-nav">
        <div className="decor-category-tabs" role="tablist" aria-label="Pattern categories">
          {PATTERN_CATEGORIES.map((category) => (
            <button key={category.id} type="button" role="tab" aria-selected={activeCategory === category.id} className={activeCategory === category.id ? 'active' : ''} onClick={() => setActiveCategory(category.id)}>{category.label}</button>
          ))}
        </div>
      </div>

      <div className="decor-pattern-grid">
        {visiblePatterns.map((pattern) => {
          const selected = decoration.patternId === pattern.id;
          return (
            <button key={pattern.id} type="button" className={`decor-pattern-card ${selected ? 'selected' : ''}`} onClick={() => update({ patternId: pattern.id, color: pattern.defaultColor || decoration.color, placement: pattern.recommendedPlacement || decoration.placement })}>
              <span className="decor-pattern-preview" style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(createPatternSvg(pattern.id, selected ? decoration.color : '#8E623B'))}")` }} />
              <span>{pattern.name}</span>
            </button>
          );
        })}
      </div>

      {decoration.patternId && <>
        <label className="decor-field-label">Placement</label>
        <div className="decor-segmented" role="group" aria-label="Pattern placement">
          {(['upper', 'middle', 'lower', 'full'] as const).map((placement) => <button key={placement} type="button" className={decoration.placement === placement ? 'active' : ''} onClick={() => update({ placement })}>{placement === 'full' ? 'Full wrap' : placement}</button>)}
        </div>

        <label className="decor-field-label" htmlFor="decor-scale">Pattern size <span>{Math.round(decoration.scale * 100)}%</span></label>
        <input id="decor-scale" className="decor-range" type="range" min="0.6" max="1.6" step="0.1" value={decoration.scale} onChange={(event) => update({ scale: Number(event.target.value) })} />

        <div className="decor-option-row">
          <label className="decor-field-label" htmlFor="decor-color">Color</label>
          <input id="decor-color" className="decor-color-input" type="color" value={decoration.color} onChange={(event) => update({ color: event.target.value })} />
        </div>

        <label className="decor-field-label">Finish</label>
        <div className="decor-segmented" role="group" aria-label="Pattern finish">
          <button type="button" className={decoration.effect === 'painted' ? 'active' : ''} onClick={() => update({ effect: 'painted' })}>Painted</button>
          <button type="button" className={decoration.effect === 'engraved' ? 'active' : ''} onClick={() => update({ effect: 'engraved' })}>Engraved</button>
        </div>

        <button type="button" className="decor-remove" onClick={() => onChange(DEFAULT_DECORATION)}>Remove pattern</button>
      </>}
    </div>
  );
}
