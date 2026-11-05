import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Search, Store } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGallerySearch } from '../contexts/GallerySearchContext';
import { useShopDirectory } from '../contexts/ShopDirectoryContext';
import { normalizeSearchQuery } from '../lib/recommendations';
import { searchShops } from '../lib/shopSearch';
import AssetImage from './AssetImage';
import GallerySearchInput from './GallerySearchInput';
import './NavbarProductSearch.css';

export default function NavbarProductSearch() {
  const location = useLocation();
  const navigate = useNavigate();
  const { binding } = useGallerySearch();
  const directory = useShopDirectory();
  const formRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const activeBinding = binding?.target === location.pathname ? binding : null;
  const isShops = location.pathname === '/shops';
  const [draft, setDraft] = useState({ search: location.search, value: new URLSearchParams(location.search).get('q') || '' });
  const value = activeBinding?.value ?? (draft.search === location.search ? draft.value : new URLSearchParams(location.search).get('q') || '');
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const query = value.trim();
  const normalizedQuery = normalizeSearchQuery(query);
  const matches = normalizedQuery.length >= 2 ? searchShops(directory.shops, query).slice(0, 5) : [];
  const options = [
    { id: 'search-shops', label: `Search “${query}” shops`, destination: `/shops?${new URLSearchParams({ q: query })}`, shop: null },
    { id: 'search-products', label: `Search “${query}” products`, destination: `/gallery?${new URLSearchParams({ q: query })}`, shop: null },
    ...matches.map(shop => ({ id: `shop-${shop.id}`, label: shop.name, destination: `/shop/${shop.id}`, shop })),
  ];
  const activeIndex = options.findIndex(option => option.id === activeId);
  const filters = new URLSearchParams(location.search);
  filters.delete('q');
  const panelKey = (text: string) => JSON.stringify([location.pathname, location.hash, filters.toString(), text]);
  const open = Boolean(query) && openFor === panelKey(value);
  const activeOptionId = open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !formRef.current?.contains(event.target)) setOpenFor(null);
    };
    const close = () => setOpenFor(null);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('popstate', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('popstate', close);
    };
  }, []);

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId]);

  function changeValue(nextValue: string) {
    if (activeBinding) activeBinding.onChange(nextValue);
    else setDraft({ search: location.search, value: nextValue });
    setActiveId(null);
    setOpenFor(nextValue.trim() ? panelKey(nextValue) : null);
    directory.ensureLoaded();
  }

  function openSuggestions() {
    setOpenFor(panelKey(value));
    setActiveId(null);
    directory.ensureLoaded();
  }

  function selectOption(index: number) {
    setOpenFor(null);
    setActiveId(null);
    if (options[index].id === 'search-products' && activeBinding?.target === '/gallery') return;
    navigate(options[index].destination);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      if (open) event.preventDefault();
      setOpenFor(null);
      setActiveId(null);
    } else if (query && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setOpenFor(panelKey(value));
      const nextIndex = event.key === 'ArrowDown'
        ? (open ? activeIndex + 1 : 0) % options.length
        : (open && activeIndex >= 0 ? activeIndex - 1 + options.length : options.length - 1) % options.length;
      setActiveId(options[nextIndex].id);
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      selectOption(activeIndex);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setOpenFor(null);
    setActiveId(null);
    if (activeBinding) return;
    navigate(`${isShops ? '/shops' : '/gallery'}?${new URLSearchParams({ q: query })}`);
  }

  return (
    <form ref={formRef} className="navbar-product-search" role="search" aria-label="Search products or shops" onSubmit={submit}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenFor(null);
      }}>
      <GallerySearchInput value={value} onChange={changeValue} inputProps={{
        role: 'combobox',
        autoComplete: 'off',
        'aria-autocomplete': 'list',
        'aria-expanded': open,
        'aria-controls': open ? listId : undefined,
        'aria-activedescendant': activeOptionId,
        onFocus: openSuggestions,
        onClick: openSuggestions,
        onKeyDown: keyDown,
      }} />
      {open && (
        <div className="navbar-search-panel">
          <div id={listId} role="listbox" aria-label="Shop suggestions">
            {options.map((option, index) => (
              <button key={option.id} id={`${listId}-${index}`} type="button" role="option"
                aria-selected={activeId === option.id} tabIndex={-1}
                className="navbar-search-option"
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setActiveId(option.id)}
                onClick={() => selectOption(index)}>
                {option.shop?.image
                  ? <AssetImage className="navbar-search-shop-image" src={option.shop.image} alt="" />
                  : <span className="navbar-search-shop-icon">{option.id === 'search-products' ? <Search aria-hidden="true" /> : <Store aria-hidden="true" />}</span>}
                <span className="navbar-search-option-copy">
                  <span>{option.label}</span>
                  {option.id === 'search-products' && <small>Product names or featured artisans</small>}
                  {option.shop?.location && <small>{option.shop.location}</small>}
                </span>
              </button>
            ))}
          </div>
          <div className="navbar-search-feedback" role="status" aria-live="polite">
            {directory.status === 'loading' && 'Loading shops…'}
            {directory.status === 'ready' && normalizedQuery.length >= 2 && (
              matches.length ? `${matches.length} matching ${matches.length === 1 ? 'shop' : 'shops'}` : 'No matching shops.'
            )}
            {directory.status === 'error' && <>Shops couldn’t load. <button type="button" onClick={directory.retry}>Retry</button></>}
          </div>
        </div>
      )}
    </form>
  );
}
