import type { InputHTMLAttributes } from 'react';
import './GallerySearchInput.css';
interface GallerySearchInputProps {
  value: string;
  onChange: (value: string) => void;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;
}

export default function GallerySearchInput({ value, onChange, inputProps }: GallerySearchInputProps) {
  return (
    <label className="gallery-search-input">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7" /><path d="m16 16 4.5 4.5" /></svg>
      <input type="search" aria-label="Search products or shops" placeholder="Search products or shops" {...inputProps} value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}
