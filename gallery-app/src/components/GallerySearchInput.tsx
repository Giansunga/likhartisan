export default function GallerySearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="gallery-search-input">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7" /><path d="m16 16 4.5 4.5" /></svg>
      <input type="search" aria-label="Search artisan crafts" placeholder="Search here..." value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}
