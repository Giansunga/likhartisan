import type { FeaturedArtisan } from '../../lib/featuredArtisan';

interface Props {
  shopId: string;
  value: string;
  onChange: (value: string) => void;
  artisans: FeaturedArtisan[];
  loading: boolean;
  error: string;
  retry: () => void;
  validationError?: string;
  disabled?: boolean;
}

export default function FeaturedArtisanSelect({ shopId, value, onChange, artisans, loading, error, retry, validationError, disabled }: Props) {
  const selected = artisans.find(artisan => artisan.id === value);
  const message = error || validationError;
  return <div className="featured-artisan-field">
    <label htmlFor="featured-artisan">Featured Artisan *</label>
    <select id="featured-artisan" name="featuredArtisanId" required value={selected ? value : ''}
      disabled={disabled || !shopId || loading || Boolean(error) || artisans.length === 0}
      aria-invalid={Boolean(validationError)} aria-describedby="featured-artisan-help"
      onChange={event => onChange(event.target.value)}>
      <option value="">{!shopId ? 'Select a shop first' : loading ? 'Loading artisans…' : 'Select an artisan'}</option>
      {artisans.map(artisan => <option key={artisan.id} value={artisan.id}>{artisan.name}</option>)}
    </select>
    <div id="featured-artisan-help" aria-live="polite">
      {message && <p role="alert">{message}</p>}
      {error && <button type="button" onClick={retry} disabled={disabled}>Retry</button>}
      {shopId && !loading && !error && artisans.length === 0 && <p>No artisans belong to this shop yet. Add an artisan in <a href="/admin/artisans">Artisan Management</a> first.</p>}
      {selected?.specialty && <p>{selected.specialty}</p>}
    </div>
  </div>;
}
