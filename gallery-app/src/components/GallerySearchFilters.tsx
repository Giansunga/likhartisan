import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { GallerySearchFilters, GallerySearchOptions, GallerySearchPlan } from '../lib/gallerySearch';

interface GallerySearchFiltersProps {
  plan: GallerySearchPlan;
  options: GallerySearchOptions;
  parserFallback: boolean;
  onChange: (plan: GallerySearchPlan) => void;
}

type FilterKey = keyof GallerySearchFilters;

const EMPTY_FILTERS: GallerySearchFilters = {
  category: null,
  shopId: null,
  minPrice: null,
  maxPrice: null,
  material: null,
  technique: null,
};

export default function GallerySearchFilters({ plan, options, parserFallback, onChange }: GallerySearchFiltersProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GallerySearchFilters>(plan.filters);

  const shopName = useMemo(
    () => new Map(options.shops.map(shop => [shop.id, shop.name])),
    [options.shops],
  );
  const chips = [
    plan.filters.category ? { key: 'category' as const, label: plan.filters.category } : null,
    plan.filters.shopId ? { key: 'shopId' as const, label: shopName.get(plan.filters.shopId) ?? 'Selected shop' } : null,
    plan.filters.minPrice !== null ? { key: 'minPrice' as const, label: `From ₱${plan.filters.minPrice.toLocaleString()}` } : null,
    plan.filters.maxPrice !== null ? { key: 'maxPrice' as const, label: `Up to ₱${plan.filters.maxPrice.toLocaleString()}` } : null,
    plan.filters.material ? { key: 'material' as const, label: plan.filters.material } : null,
    plan.filters.technique ? { key: 'technique' as const, label: plan.filters.technique } : null,
  ].filter((chip): chip is NonNullable<typeof chip> => chip !== null);

  function removeFilter(key: FilterKey) {
    onChange({ ...plan, filters: { ...plan.filters, [key]: null } });
  }

  function openEditor() {
    setDraft(plan.filters);
    setEditing(true);
  }

  function toggleEditor() {
    if (editing) setEditing(false);
    else openEditor();
  }

  function setDraftValue(key: FilterKey, value: string) {
    const next = key === 'minPrice' || key === 'maxPrice'
      ? (value === '' ? null : Math.max(0, Number(value)))
      : (value || null);
    setDraft(previous => ({ ...previous, [key]: next }));
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    onChange({ ...plan, filters: draft });
    setEditing(false);
  }

  if (chips.length === 0 && !parserFallback) return null;

  return (
    <div className="gallery-ai-filters" aria-label="AI search filters">
      <div className="gallery-ai-filter-row">
        <span className="gallery-ai-filter-label">Understood as</span>
        {chips.map(chip => (
          <span className="gallery-ai-chip" key={chip.key}>
            <button type="button" onClick={openEditor}>{chip.label}</button>
            <button type="button" onClick={() => removeFilter(chip.key)} aria-label={`Remove ${chip.label} filter`}>×</button>
          </span>
        ))}
        <button className="gallery-ai-edit-button" type="button" onClick={toggleEditor}>
          {editing ? 'Close' : 'Edit filters'}
        </button>
        {parserFallback ? <span className="gallery-ai-parser-note">Basic language parsing used</span> : null}
      </div>

      {editing ? (
        <form className="gallery-ai-filter-editor" onSubmit={applyFilters}>
          <label>
            Category
            <select value={draft.category ?? ''} onChange={event => setDraftValue('category', event.target.value)}>
              <option value="">Any category</option>
              {options.categories.map(value => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            Shop
            <select value={draft.shopId ?? ''} onChange={event => setDraftValue('shopId', event.target.value)}>
              <option value="">Any shop</option>
              {options.shops.map(shop => <option value={shop.id} key={shop.id}>{shop.name}</option>)}
            </select>
          </label>
          <label>
            Minimum price
            <input type="number" min="0" value={draft.minPrice ?? ''} onChange={event => setDraftValue('minPrice', event.target.value)} />
          </label>
          <label>
            Maximum price
            <input type="number" min="0" value={draft.maxPrice ?? ''} onChange={event => setDraftValue('maxPrice', event.target.value)} />
          </label>
          <label>
            Material
            <select value={draft.material ?? ''} onChange={event => setDraftValue('material', event.target.value)}>
              <option value="">Any material</option>
              {options.materials.map(value => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            Technique
            <select value={draft.technique ?? ''} onChange={event => setDraftValue('technique', event.target.value)}>
              <option value="">Any technique</option>
              {options.techniques.map(value => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <div className="gallery-ai-filter-actions">
            <button type="button" onClick={() => setDraft(EMPTY_FILTERS)}>Clear detected filters</button>
            <button type="submit">Apply filters</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
