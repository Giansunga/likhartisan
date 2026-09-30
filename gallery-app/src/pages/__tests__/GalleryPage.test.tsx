import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GalleryPage from '../GalleryPage';

const mocks = vi.hoisted(() => ({
  currentTheme: 'christmas' as 'default' | 'christmas' | 'valentines',
  order: vi.fn(),
  variations: vi.fn(),
  reviews: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ currentTheme: mocks.currentTheme }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
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
  beforeEach(() => {
    mocks.currentTheme = 'christmas';
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.variations.mockResolvedValue({ data: [], error: null });
    mocks.reviews.mockResolvedValue({ data: [], error: null });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
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
    expect(screen.getByRole('link', { name: /In stock/ })).toHaveTextContent('₱140');
    expect(screen.getByRole('link', { name: /All variations sold out/ })).toHaveTextContent('Out of stock');
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
});
