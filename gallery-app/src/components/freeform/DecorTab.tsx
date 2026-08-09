import { useState } from 'react';
import PanelSection from './PanelSection';
import { DEFAULT_DECORATION, PATTERN_CATEGORIES, createPatternSvg, getPattern, getPatternCategory, getPatternsByCategory, type DecorationParams, type PatternCategory } from './decor';

export default function DecorTab({ decoration, onChange }: { decoration: DecorationParams; onChange: (value: DecorationParams) => void }) {
  const update = (patch: Partial<DecorationParams>) => onChange({ ...decoration, ...patch });
  const [activeCategory, setActiveCategory] = useState<PatternCategory>(() => getPatternCategory(decoration.patternId) || 'floral');
  const [activeSection, setActiveSection] = useState<1 | 2>(() => decoration.patternId ? 2 : 1);
  const visiblePatterns = getPatternsByCategory(activeCategory);
  const selectedPattern = getPattern(decoration.patternId);
  const selectedCategory = getPatternCategory(decoration.patternId);
  const categoryLabel = PATTERN_CATEGORIES.find((category) => category.id === selectedCategory)?.label;
  const visibleSection = decoration.patternId ? activeSection : 1;

  function choosePattern(patternId: string, defaultColor?: string, recommendedPlacement?: DecorationParams['placement']) {
    const patternCategory = getPatternCategory(patternId);
    if (patternCategory) setActiveCategory(patternCategory);
    update({ patternId, color: defaultColor || decoration.color, placement: recommendedPlacement || decoration.placement });
    setActiveSection(2);
  }

  return (
    <div className="decor-tab">
      <div className="freeform-tab-heading">Pattern decoration</div>
      <p className="decor-help">Choose a category, then select one of five original motifs to wrap around your pottery.</p>

      <div className="guided-panel-list">
        <PanelSection number={1} title="Choose Pattern" summary={selectedPattern ? `${selectedPattern.name}${categoryLabel ? ` · ${categoryLabel}` : ''}` : 'Select a motif'} expanded={visibleSection === 1} completed={Boolean(selectedPattern)} onToggle={() => setActiveSection(1)} regionId="pattern-choose-section">
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
                <button key={pattern.id} type="button" className={`decor-pattern-card ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => choosePattern(pattern.id, pattern.defaultColor, pattern.recommendedPlacement)}>
                  <span className="decor-pattern-preview" style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(createPatternSvg(pattern.id, selected ? decoration.color : '#8E623B'))}")` }} />
                  <span>{pattern.name}</span>
                </button>
              );
            })}
          </div>
        </PanelSection>

        <PanelSection number={2} title="Customize Pattern" summary={selectedPattern ? `${decoration.placement === 'full' ? 'Full wrap' : decoration.placement} · ${Math.round(decoration.scale * 100)}%` : 'Choose a pattern first'} expanded={visibleSection === 2} completed={Boolean(selectedPattern)} disabled={!selectedPattern} onToggle={() => setActiveSection(2)} regionId="pattern-customize-section">
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
          <button type="button" className="decor-remove" onClick={() => { onChange(DEFAULT_DECORATION); setActiveSection(1); }}>Remove pattern</button>
        </PanelSection>
      </div>
    </div>
  );
}
