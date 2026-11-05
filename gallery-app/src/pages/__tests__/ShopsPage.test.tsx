import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GallerySearchProvider } from '../../contexts/GallerySearchContext';
import { ShopDirectoryProvider } from '../../contexts/ShopDirectoryContext';
import NavbarProductSearch from '../../components/NavbarProductSearch';
import ShopsPage from '../ShopsPage';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  select: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  signals: [] as AbortSignal[],
}));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({
    select: mocks.select,
    order: vi.fn().mockReturnThis(),
    range: mocks.range,
    abortSignal: (signal: AbortSignal) => { mocks.signals.push(signal); return mocks.fetch(); },
  }) },
}));

const shops = [
  { id: 'clay', name: 'Clay House', banner: '/cover.jpg', image: '', location: 'Santo Tomas', description: 'Handmade pottery' },
  { id: 'earth', name: 'Earth Studio', banner: '', image: '/earth.jpg', location: 'Pampanga', description: '' },
];

function SearchShell() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <NavbarProductSearch key={location.pathname} />
    <output aria-label="current location">{location.pathname}{location.search}</output>
    <button type="button" onClick={() => navigate(-1)}>Back</button>
    <Routes>
      <Route path="/shops" element={<ShopsPage />} />
      <Route path="*" element={<p>Another page</p>} />
    </Routes>
  </>;
}

function renderSearch(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><GallerySearchProvider><ShopDirectoryProvider>
    <SearchShell />
  </ShopDirectoryProvider></GallerySearchProvider></MemoryRouter>);
}

function typeQuery(query: string) {
  const input = screen.getByRole('combobox', { name: 'Search products or shops' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  return input;
}

describe('shop search', () => {
  beforeEach(() => {
    mocks.fetch.mockReset().mockResolvedValue({ data: shops, error: null });
    mocks.select.mockClear();
    mocks.range.mockClear();
    mocks.signals = [];
  });

  it('keeps shop covers and the lower promotion with one shared search field', async () => {
    const { container } = renderSearch('/shops');
    expect(screen.getByRole('heading', { level: 1, name: 'Shops' })).toBeInTheDocument();
    expect(container.querySelector('.gallery-header-banner')).toBeNull();
    expect(await screen.findByAltText('Clay House')).toHaveAttribute('src', '/cover.jpg');
    expect(screen.getAllByRole('link', { name: 'View Shop' })[0]).toHaveAttribute('href', '/shop/clay');
    expect(screen.getByAltText(/Request a custom pottery piece/)).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(mocks.select).toHaveBeenCalledWith('id, name, description, banner, image, location');
  });

  it('loads suggestions once, keeps Enter searching products, and encodes the query', async () => {
    renderSearch();
    expect(mocks.fetch).not.toHaveBeenCalled();
    typeQuery('Clay');
    expect(await screen.findByRole('option', { name: /Clay House/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'white & gold' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByLabelText('current location')).toHaveTextContent('/gallery?q=white+%26+gold');
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens shop results, filters live with replacement URLs, and clears the search', async () => {
    renderSearch();
    typeQuery('Clay');
    fireEvent.click(screen.getByRole('option', { name: 'Search “Clay” shops' }));
    expect(await screen.findByText('1 shop for “Clay”')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('Clay');
    expect(screen.queryByRole('heading', { name: 'Earth Studio' })).not.toBeInTheDocument();
    typeQuery('Earth');
    expect(screen.getByRole('heading', { name: 'Earth Studio' })).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByLabelText('current location')).toHaveTextContent('/shops?q=Earth');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getAllByRole('link', { name: 'View Shop' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('current location')).toHaveTextContent('/');
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('opens a shop using the keyboard and restores results and query with Back', async () => {
    renderSearch('/shops?q=Clay');
    await screen.findByRole('heading', { name: 'Clay House' });
    const input = typeQuery('Clay');
    await screen.findByRole('option', { name: /Clay House/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const activeId = input.getAttribute('aria-activedescendant');
    expect(document.getElementById(activeId!)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByLabelText('current location')).toHaveTextContent('/shop/clay');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Clay House' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('Clay');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('dismisses on Escape, outside pointer, blur, and clearing, and supports Arrow Up', async () => {
    renderSearch();
    const input = typeQuery('Clay');
    await screen.findByRole('option', { name: /Clay House/ });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: /Clay House/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.focus(input);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.blur(input, { relatedTarget: screen.getByRole('button', { name: 'Back' }) });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    typeQuery('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('offers the shop action for one character and at most five matching shops for longer queries', async () => {
    mocks.fetch.mockResolvedValue({ data: Array.from({ length: 9 }, (_, i) => ({ ...shops[0], id: `${i}`, name: `Clay ${i}` })), error: null });
    renderSearch();
    typeQuery('C');
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    expect(screen.getAllByRole('option')).toHaveLength(1);
    typeQuery('Clay');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(6));
  });

  it('shows retryable directory failures separately from empty results', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: null, error: { message: 'Unavailable' } });
    renderSearch('/shops?q=Clay');
    expect(await screen.findByRole('alert')).toHaveTextContent('Shops couldn’t load');
    expect(screen.queryByText(/No shops match/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Clay House' })).toBeInTheDocument();
    typeQuery('Missing');
    expect(screen.getByText(/No shops match your search/)).toBeInTheDocument();
    expect(screen.getByText('No matching shops.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Search “Missing” shops' })).toBeInTheDocument();
  });

  it('uses the latest typed query when directory loading finishes and supports pointer selection', async () => {
    let complete!: (result: { data: typeof shops; error: null }) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    renderSearch();
    typeQuery('Clay');
    expect(screen.getByText('Loading shops…')).toBeInTheDocument();
    typeQuery('Earth');
    await act(async () => { complete({ data: shops, error: null }); });
    expect(await screen.findByRole('option', { name: /Earth Studio/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Clay House/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Earth Studio/ }));
    expect(screen.getByLabelText('current location')).toHaveTextContent('/shop/earth');
  });

  it('cancels requests and recovers during StrictMode remount', async () => {
    const { unmount } = render(<StrictMode><MemoryRouter initialEntries={['/shops']}><GallerySearchProvider><ShopDirectoryProvider>
      <SearchShell />
    </ShopDirectoryProvider></GallerySearchProvider></MemoryRouter></StrictMode>);
    await screen.findByRole('heading', { name: 'Clay House' });
    expect(mocks.signals[0].aborted).toBe(true);
    unmount();
  });

  it('loads the complete directory beyond the first batch', async () => {
    mocks.fetch.mockResolvedValueOnce({
      data: Array.from({ length: 500 }, (_, i) => ({ ...shops[0], id: `${i}`, name: `Studio ${i}` })),
      error: null,
    }).mockResolvedValueOnce({ data: [shops[1]], error: null });
    renderSearch();
    typeQuery('Earth');
    expect(await screen.findByRole('option', { name: /Earth Studio/ })).toBeInTheDocument();
    expect(mocks.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(mocks.range).toHaveBeenNthCalledWith(2, 500, 999);
  });
});
