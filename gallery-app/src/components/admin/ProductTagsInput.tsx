import { useId } from 'react';
import { resolveProductTags, type ProductTagsDraft } from '../../lib/productTags';
import './product-tags.css';

export default function ProductTagsInput({ value, onChange, disabled = false }: {
  value: ProductTagsDraft;
  onChange: (value: ProductTagsDraft) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const { error } = resolveProductTags(value);
  function commit(input = value.input) {
    const next = { ...value, input };
    const resolved = resolveProductTags(next);
    onChange(resolved.error ? next : { tags: resolved.tags, input: '' });
  }
  return <div className="product-tags">
    <label htmlFor={id}>Tags <small>(optional)</small></label>
    <div className="product-tags__field">
      {value.tags.length > 0 && <ul aria-label="Product tags">{value.tags.map(tag => <li key={tag}>
        <span>{tag}</span><button type="button" aria-label={`Remove tag ${tag}`} disabled={disabled}
          onClick={() => onChange({ ...value, tags: value.tags.filter(item => item !== tag) })}>×</button>
      </li>)}</ul>}
      <input id={id} value={value.input} disabled={disabled} placeholder="e.g. rustic, floral, handmade"
        aria-invalid={Boolean(error)} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
        onChange={event => event.target.value.includes(',') ? commit(event.target.value) : onChange({ ...value, input: event.target.value })}
        onBlur={() => { if (value.input) commit(); }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault(); event.stopPropagation(); commit();
          }
        }} />
    </div>
    <p id={`${id}-help`}>Separate tags with commas or Enter. Up to 10 tags, 40 characters each. Tags help buyers find similar products.</p>
    {error && <p id={`${id}-error`} className="product-tags__error" role="alert">{error}</p>}
  </div>;
}
