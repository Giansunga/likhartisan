import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGallerySearch } from '../contexts/GallerySearchContext';
import GallerySearchInput from './GallerySearchInput';

export default function NavbarProductSearch() {
  const location = useLocation();
  const navigate = useNavigate();
  const { binding } = useGallerySearch();
  const isGallery = location.pathname === '/gallery';
  const [draft, setDraft] = useState(() => new URLSearchParams(location.search).get('q') || '');
  const value = isGallery && binding ? binding.value : draft;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isGallery && binding) return;
    navigate(`/gallery?${new URLSearchParams({ q: value.trim() })}`);
  }

  return (
    <form className="navbar-product-search" role="search" aria-label="Search gallery products" onSubmit={submit}>
      <GallerySearchInput value={value} onChange={isGallery && binding ? binding.onChange : setDraft} />
    </form>
  );
}
