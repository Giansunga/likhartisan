import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GalleryPage from '../GalleryPage';
import { clearGallerySnapshot } from '../../lib/gallerySnapshot';

const mocks = vi.hoisted(() => ({
  currentTheme: 'christmas' as 'default' | 'christmas' | 'valentines',
  order: vi.fn(),
  variations: vi.fn(),
  reviews: vi.fn(),
  user: null as null | { id: string },
  signalFetch: vi.fn(),
  soldCounts: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ currentTheme: mocks.currentTheme }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.soldCounts,
    from: vi.fn((table: string) => table === 'user_product_signals' ? { select: () => ({ eq: () => ({ gte: () => ({ order: () => ({ limit: mocks.signalFetch }) }) }) }), insert: async () => ({ data: null, error: null }) } : ({
      select: vi.fn(() => table === 'products'
        ? { order: mocks.order }
        : { in: table === 'product_variations' ? mocks.variations : mocks.reviews }),
    })),
  },
}));

function product(id: string, stock: number, price = 100) {
  return { id, name: id, category: 'Vases', price, stock, image: '/test.webp', status: 'active', shop_name: 'Test Shop' };
}

describe('GalleryPage', () => {
  function ReturnControls() {
    const navigate = useNavigate();
    return <><button onClick={() => navigate(-1)}>Return with Back</button><Link to="/gallery">Gallery breadcrumb</Link></>;
  }
  it.each(['Return with Back', 'Gallery breadcrumb'])('restores page, search, sorting, order and cached results through %s', async action => {
    const rows = Array.from({ length: 30 }, (_, index) => product(`Vase ${String(index).padStart(2, '0')}`, 5, index + 100));
    mocks.order.mockResolvedValue({ data: rows, error: null });
    mocks.soldCounts.mockResolvedValue({ data: rows.map(row => ({ product_id: row.id, sold_count: 12 })), error: null });
    const { container } = render(<MemoryRouter initialEntries={['/gallery?category=Vases']}><Routes>
      <Route path="/gallery" element={<GalleryPage />} />
      <Route path="/product/:id" element={<ReturnControls />} />
    </Routes></MemoryRouter>);
    await waitFor(() => expect(container.querySelectorAll('[data-gallery-product]')).toHaveLength(24));
    await screen.findAllByText('12 sold');
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Sort products' })[0], { target: { value: 'price-asc' } });
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Vase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    const cards = [...container.querySelectorAll<HTMLElement>('[data-gallery-product]')].map(card => card.dataset.galleryProduct);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
    fireEvent.click(container.querySelector('[data-gallery-product]')!);
    if (action === 'Return with Back') fireEvent.click(screen.getByRole('button', { name: action }));
    else fireEvent.click(screen.getByRole('link', { name: action }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page'));
    expect(screen.getByPlaceholderText(/Search/)).toHaveValue('Vase');
    expect(screen.getAllByRole('combobox', { name: 'Sort products' })[0]).toHaveValue('price-asc');
    expect([...container.querySelectorAll<HTMLElement>('[data-gallery-product]')].map(card => card.dataset.galleryProduct)).toEqual(cards);
    expect(mocks.order).toHaveBeenCalledTimes(1);
    expect(mocks.soldCounts).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('12 sold')).toHaveLength(6);
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 640));
    if (action === 'Return with Back') expect(container.querySelector('[data-gallery-product]')).toHaveFocus();
  }, 15000);

  beforeEach(() => {
    clearGallerySnapshot();
    vi.clearAllMocks();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    mocks.currentTheme = 'christmas';
    mocks.user = null;
    mocks.signalFetch.mockResolvedValue({ data: [], error: null });
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.variations.mockResolvedValue({ data: [], error: null });
    mocks.reviews.mockResolvedValue({ data: [], error: null });
    mocks.soldCounts.mockResolvedValue({ data: [], error: null });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('places mobile filters at the document root and keeps the results action outside scrolling controls', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    render(<MemoryRouter><GalleryPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const overlay = screen.getByText('Sort & Filter').closest('.gallery-filter-overlay') as HTMLElement;
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay).toHaveClass('active');
    const sorting = within(overlay).getByRole('combobox', { name: 'Sort products' });
    fireEvent.change(sorting, { target: { value: 'price-asc' } });
    const results = within(overlay).getByRole('button', { name: /View .* Results/ });
    expect(results.closest('.gallery-filter-sheet__content')).toBeNull();
    fireEvent.click(results);
    expect(overlay).not.toHaveClass('active');
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(sorting).toHaveValue('price-asc');
    await waitFor(() => expect(mocks.order).toHaveBeenCalledOnce());
  });

  it('loads sold counts in one batch and displays zero and comma-formatted counts beside categories', async () => {
    mocks.order.mockResolvedValue({ data: [product('New vase', 3), product('Popular vase', 5)], error: null });
    mocks.soldCounts.mockResolvedValue({ data: [{ product_id: 'New vase', sold_count: 0 }, { product_id: 'Popular vase', sold_count: '12345' }], error: null });
    render(<MemoryRouter><GalleryPage /></MemoryRouter>);
    const zero = await screen.findByText('0 sold');
    expect(zero.parentElement).toHaveClass('product-card-header');
    expect(zero.parentElement).toHaveTextContent('Vases0 sold');
    expect(await screen.findByText('12,345 sold')).toBeInTheDocument();
    expect(mocks.soldCounts).toHaveBeenCalledExactlyOnceWith('get_product_sold_counts', { p_product_ids: ['New vase', 'Popular vase'] });
  });

  it('renders cards while sold counts are pending, then fills their labels', async () => {
    let finish!: (result: { data: { product_id: string; sold_count: number }[]; error: null }) => void;
    mocks.order.mockResolvedValue({ data: [product('Slow count', 3)], error: null });
    mocks.soldCounts.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<MemoryRouter><GalleryPage /></MemoryRouter>);
    await screen.findByRole('link', { name: /Slow count/ });
    expect(screen.queryByText(/\d sold/)).not.toBeInTheDocument();
    await act(async () => finish({ data: [{ product_id: 'Slow count', sold_count: 0 }], error: null }));
    expect(await screen.findByText('0 sold')).toBeInTheDocument();
  });

  it.each(['response', 'rejection'])('keeps cards usable and hides labels on sold-count %s failure', async failure => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.order.mockResolvedValue({ data: [product('Available vase', 3)], error: null });
    if (failure === 'response') mocks.soldCounts.mockResolvedValue({ data: null, error: new Error('Unavailable') });
    else mocks.soldCounts.mockRejectedValue(new Error('Network failure'));
    render(<MemoryRouter><GalleryPage /></MemoryRouter>);
    await screen.findByRole('link', { name: /Available vase/ });
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.queryByText(/\d sold/)).not.toBeInTheDocument();
    error.mockRestore();
  });

  it('starts a fresh gallery when the account changes', async () => {
    mocks.order.mockResolvedValue({ data: [product('Guest piece', 2)], error: null });
    const { rerender } = render(<MemoryRouter><GalleryPage /></MemoryRouter>);
    await screen.findByRole('link', { name: /Guest piece/ });
    mocks.user = { id: 'user-one' };
    mocks.order.mockResolvedValue({ data: [product('Account piece', 3)], error: null });
    rerender(<MemoryRouter><GalleryPage /></MemoryRouter>);
    await screen.findByRole('link', { name: /Account piece/ });
    expect(screen.queryByRole('link', { name: /Guest piece/ })).not.toBeInTheDocument();
    expect(mocks.order).toHaveBeenCalledTimes(2);
    mocks.user = null;
    mocks.order.mockResolvedValue({ data: [product('New guest piece', 1)], error: null });
    rerender(<MemoryRouter><GalleryPage /></MemoryRouter>);
    await screen.findByRole('link', { name: /New guest piece/ });
    expect(mocks.order).toHaveBeenCalledTimes(3);
  });

  it('uses the category image set for the active seasonal theme', async () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <GalleryPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(container.querySelectorAll('.zoom-card-bg')).toHaveLength(6));
    const christmasImages = [
      'gallery-thumbnail-all-crafts.jpg',
      'gallery-thumbnail-vases.jpg',
      'gallery-thumbnail-planters.jpg',
      'gallery-thumbnail-jars.jpg',
      'gallery-thumbnail-decorative-pieces.jpg',
      'gallery-thumbnail-others.png',
    ];
    Array.from(container.querySelectorAll('.zoom-card-bg')).forEach((image, index) => {
      expect(image).toHaveStyle({ backgroundImage: `url(/images/${christmasImages[index]})` });
    });

    mocks.currentTheme = 'valentines';
    await act(async () => {
      rerender(
        <MemoryRouter>
          <GalleryPage />
        </MemoryRouter>,
      );
    });

    const valentinesImages = [
      'gallery-thumbnail-all-crafts.jpg',
      'gallery-thumbnail-vases.jpg',
      'gallery-thumbnail-planters.jpg',
      'gallery-thumbnail-jars.jpg',
      'gallery-thumbnail-decorative-pieces.jpg',
      'gallery-thumbnail-others.png',
    ];
    Array.from(container.querySelectorAll('.zoom-card-bg')).forEach((image, index) => {
      expect(image).toHaveStyle({ backgroundImage: `url(/images/${valentinesImages[index]})` });
    });

    mocks.currentTheme = 'default';
    await act(async () => {
      rerender(
        <MemoryRouter>
          <GalleryPage />
        </MemoryRouter>,
      );
    });

    const standardImages = [
      'gallery-thumbnail-all-crafts.jpg',
      'gallery-thumbnail-vases.jpg',
      'gallery-thumbnail-planters.jpg',
      'gallery-thumbnail-jars.jpg',
      'gallery-thumbnail-decorative-pieces.jpg',
      'gallery-thumbnail-others.png',
    ];
    Array.from(container.querySelectorAll('.zoom-card-bg')).forEach((image, index) => {
      expect(image).toHaveStyle({ backgroundImage: `url(/images/${standardImages[index]})` });
    });
  });

  it.each(['/gallery?category=Decorative%20Pieces', '/gallery?category=Amphoras'])('keeps existing Amphoras products in Decorative Pieces for %s', async route => {
    mocks.order.mockResolvedValue({ data: [{ ...product('Legacy amphora', 1), category: 'Amphoras' }], error: null });
    render(<MemoryRouter initialEntries={[route]}><GalleryPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Legacy amphora/ })).toHaveTextContent('Decorative Pieces');
  });

  it.each(['/gallery?category=Others', '/gallery?category=Tea%20Light%20Vases'])('keeps existing Tea Light Vases products in Others for %s', async route => {
    mocks.order.mockResolvedValue({ data: [{ ...product('Legacy tea light', 1), category: 'Tea Light Vases' }], error: null });
    render(<MemoryRouter initialEntries={[route]}><GalleryPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Legacy tea light/ })).toHaveTextContent('Others');
  });

  it.each(['Bowls', 'Teapots', 'Plates'])('shows a legacy %s product in Others', async category => {
    mocks.order.mockResolvedValue({ data: [{ ...product('Legacy piece', 1), category }], error: null });
    render(<MemoryRouter initialEntries={['/gallery?category=Others']}><GalleryPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Legacy piece/ })).toHaveTextContent('Others');
  });

  it('shows stock status from variations and prices only available variations', async () => {
    mocks.order.mockResolvedValue({ data: [
      product('No stock', 0),
      product('In stock', 2, 140),
      product('All variations sold out', 5),
      product('Mixed variations', 0),
    ], error: null });
    mocks.variations.mockResolvedValue({ data: [
      { product_id: 'All variations sold out', price: 50, stock: 0 },
      { product_id: 'Mixed variations', price: 40, stock: 0 },
      { product_id: 'Mixed variations', price: 120, stock: 2 },
      { product_id: 'Mixed variations', price: 150, stock: 1 },
    ], error: null });

    render(<MemoryRouter><GalleryPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('link', { name: /Mixed variations/ })).toHaveTextContent('₱120'));
    expect(screen.getByRole('link', { name: /No stock/ })).toHaveTextContent('Out of stock');
    expect(screen.getByRole('link', { name: /No stock/ })).toHaveTextContent('₱100');
    expect(screen.getByRole('link', { name: /In stock/ })).toHaveTextContent('₱140');
    expect(screen.getByRole('link', { name: /All variations sold out/ })).toHaveTextContent('Out of stock');
    expect(screen.getByRole('link', { name: /All variations sold out/ })).toHaveTextContent('₱50');
    expect(screen.getByRole('link', { name: /Mixed variations/ })).not.toHaveTextContent('₱40');
    expect(screen.getByRole('link', { name: /All variations sold out/ })).toHaveAttribute('href', '/product/All variations sold out');
  });

  it('falls back to product stock and price when variation loading fails', async () => {
    mocks.order.mockResolvedValue({ data: [product('Available', 3, 250), product('Unavailable', 0)], error: null });
    mocks.variations.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });

    render(<MemoryRouter><GalleryPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('link', { name: /Available/ })).toHaveTextContent('₱250'));
    expect(screen.getByRole('link', { name: /Unavailable/ })).toHaveTextContent('Out of stock');
  });

  it('sorts by the visible sold-out price and exposes persistent guest favorites', async () => {
    localStorage.clear();
    mocks.order.mockResolvedValue({ data: [product('Sold vase', 0, 300), product('Available vase', 2, 100)], error: null });
    mocks.variations.mockResolvedValue({ data: [{ product_id: 'Sold vase', price: 50, stock: 0 }], error: null });
    const { container } = render(<MemoryRouter><GalleryPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('link', { name: /Sold vase/ })).toHaveTextContent('₱50'));
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Sort products' })[0], { target: { value: 'price-asc' } });
    expect(container.querySelector('.product-card-item')).toHaveAttribute('href', '/product/Sold vase');
    fireEvent.click(screen.getByRole('button', { name: 'Add Sold vase to favorites' }));
    expect(screen.getByRole('button', { name: 'Remove Sold vase from favorites' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('likhartisan_favorites')!)).toEqual(['Sold vase']);
  });
});
