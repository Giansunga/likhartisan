import { act, fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductDetailPage from '../ProductDetailPage';
import RecommendationsSection from '../../components/RecommendationsSection';

type Row = Record<string, unknown>;
const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  products: [] as Row[], variations: [] as Row[], reviews: [] as Row[],
  failProducts: false,
  failModel: false,
  calls: [] as { table: string; filters: [string, unknown][]; order?: string }[],
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../../components/ModelViewer', () => ({ default: () => { if (mocks.failModel) throw new Error('Model unavailable'); return <div>3D viewer</div>; } }));
vi.mock('../../lib/cartAnimation', () => ({ animateProductToCart: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: 4 })),
    from: (table: string) => {
      const request: { table: string; filters: [string, unknown][]; order?: string } = { table, filters: [] };
      mocks.calls.push(request);
      let head = false;
      let max = Infinity;
      const result = () => {
        if (table === 'shops') return { data: { image: '' }, error: null };
        if (table === 'products' && mocks.failProducts) return { data: null, error: new Error('Unavailable'), count: null };
        const rows = table === 'products' ? mocks.products : table === 'product_variations' ? mocks.variations : mocks.reviews;
        const data = rows.filter(row => request.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value)).slice(0, max);
        return { data: head ? null : data, count: data.length, error: null };
      };
      const query = {
        select: (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return query; },
        eq: (key: string, value: unknown) => { request.filters.push([key, value]); return query; },
        in: (key: string, value: unknown[]) => { request.filters.push([key, value]); return query; },
        order: (key: string) => { request.order = key; return query; },
        limit: (value: number) => { max = value; return query; },
        single: async () => { const response = result(); return { ...response, data: Array.isArray(response.data) ? response.data[0] : response.data }; },
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  },
}));

function Location() { const location = useLocation(); return <output data-testid="location">{JSON.stringify({ path: location.pathname, state: location.state })}</output>; }
function SwitchProduct() { const navigate = useNavigate(); return <button onClick={() => navigate('/product/plain')}>Open plain product</button>; }
function renderProduct() {
  return render(<MemoryRouter initialEntries={['/product/jar']}><Routes><Route path="/product/:id" element={<><ProductDetailPage /><SwitchProduct /></>} /><Route path="/checkout" element={<Location />} /><Route path="/chat" element={<Location />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  mocks.user = null;
  mocks.failProducts = false;
  mocks.failModel = false;
  mocks.calls = [];
  mocks.products = [
    { id: 'jar', name: 'Bigasan Terracotta', category: 'Jars', price: 100, stock: 20, image: '/jar.jpg', shop_id: 'shop', shop_name: 'Maria’s Pottery', status: 'active', materials: 'Terracotta Clay', description: 'Made by hand.', technique: 'Wheel-thrown', measurement_unit: 'in' },
    { id: 'plain', name: 'Plain piece with a very long product name that must wrap', category: 'Jars', price: 75, stock: 0, image: '/plain.jpg', status: 'active', measurement_unit: 'in' },
    { id: 'other', name: 'Another shop piece', category: 'Jars', price: 90, stock: 2, shop_id: 'other-shop', status: 'active' },
  ];
  mocks.variations = [
    { id: 'small', product_id: 'jar', dimensions: '14 × 7.5 in', height: '14 in', opening_diameter: '7.5 in', price: 1200, stock: 1, weight_kg: 5, sort_order: 0, measurement_unit: 'in' },
    { id: 'large', product_id: 'jar', dimensions: '32 × 18 in', height: '32 in', opening_diameter: '18 in', price: 2600, stock: 8, weight_kg: 28, sort_order: 1, measurement_unit: 'in' },
    { id: 'sold-out', product_id: 'jar', dimensions: '40 × 20 in', price: 3000, stock: 0, sort_order: 2, measurement_unit: 'in' },
  ];
  mocks.reviews = [{ id: 'review', product_id: 'jar', user_name: 'A***t', rating: 5, body: 'Beautiful craft.', seller_service_rating: 4, created_at: '2026-09-22T00:00:00Z' }];
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('product detail presentation and shopping controls', () => {
  it.each([false, true])('keeps guest favorites usable with the model fallback: %s', async fail => {
    mocks.products[0].model3d = '/model.glb'; mocks.failModel = fail;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('likhartisan_favorites', '["existing"]');
    renderProduct();
    const favorite = await screen.findByRole('button', { name: 'Add Bigasan Terracotta to favorites' });
    fireEvent.click(favorite);
    expect(screen.getByRole('button', { name: 'Remove Bigasan Terracotta from favorites' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('likhartisan_favorites')!)).toEqual(['existing', 'jar']);
    if (fail) expect(await screen.findByAltText('Bigasan Terracotta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open plain product' }));
    expect(await screen.findByRole('button', { name: /Add Plain piece.*to favorites/ })).toHaveAttribute('aria-pressed', 'false');
    consoleError.mockRestore();
  });
  it('places the shop first and keeps real measurements, price, stock and cart selection in sync', async () => {
    const { container } = renderProduct();
    await screen.findByRole('heading', { name: 'Bigasan Terracotta' });
    expect(container.querySelector('.pdp-shop')!.compareDocumentPosition(container.querySelector('.pdp-hero')!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const sizes = screen.getByRole('group', { name: 'Select size' });
    fireEvent.click(within(sizes).getByRole('button', { name: /32.*18/ }));
    expect(within(sizes).getByRole('button', { name: /32.*18/ })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.pdp-price')).toHaveTextContent('₱2,600.00');
    expect(container.querySelector('.pdp-spec-tiles')).toHaveTextContent('28 kg');
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
    const { getCart } = await import('../../data/store');
    expect(getCart()[0]).toMatchObject({ productId: 'jar', variationId: 'large', price: 2600, qty: 1 });
    fireEvent.click(within(sizes).getByRole('button', { name: /14.*7.5/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
    expect(screen.getByRole('button', { name: 'Stock Limit Reached' })).toBeDisabled();
    fireEvent.click(within(sizes).getByRole('button', { name: /40.*20/ }));
    expect(screen.getByRole('button', { name: 'Buy Now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeDisabled();
    expect(screen.getByText('This item is currently out of stock.')).toBeInTheDocument();
  });

  it('preserves description, measurements, technique and masked reviewer names', async () => {
    const { container } = renderProduct();
    await screen.findByRole('heading', { name: 'Bigasan Terracotta' });
    expect(container.querySelector('.pdp-craft-content')).toHaveTextContent('Made by hand.');
    expect(container.querySelector('.pdp-craft-content')).toHaveTextContent('Wheel-thrown');
    expect(container.querySelector('.pdp-craft-content')).toHaveTextContent('Opening diameter');
    expect(screen.getByRole('heading', { name: 'A***t' })).toBeInTheDocument();
    expect(screen.getByText('Seller Service:')).toBeInTheDocument();
  });

  it('passes the selected size and price to checkout', async () => {
    mocks.user = { id: 'buyer' };
    renderProduct();
    await screen.findByRole('heading', { name: 'Bigasan Terracotta' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Select size' })).getByRole('button', { name: /32.*18/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy Now' }));
    const location = JSON.parse(screen.getByTestId('location').textContent!);
    expect(location).toMatchObject({ path: '/checkout', state: { buyNowItem: { variationId: 'large', price: 2600, qty: 1 } } });
  });

  it('opens sign in for guest buying, chat and questions, without sending a message', async () => {
    const signIn = vi.fn();
    window.addEventListener('open-auth', signIn);
    renderProduct();
    await screen.findByRole('heading', { name: 'Bigasan Terracotta' });
    for (const name of ['Buy Now', 'Chat Now', 'Ask a Question']) fireEvent.click(screen.getByRole('button', { name }));
    expect(signIn).toHaveBeenCalledTimes(3);
    window.removeEventListener('open-auth', signIn);
  });

  it('shows desktop sticky controls after the product section, synchronizes its selection and stock, and hides on return', async () => {
    let onIntersection: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { onIntersection = callback; }
      observe() {}
      disconnect() {}
    });
    renderProduct();
    await screen.findByRole('heading', { name: 'Bigasan Terracotta' });
    expect(screen.queryByRole('region', { name: 'Sticky purchase controls' })).not.toBeInTheDocument();
    const notify = (isIntersecting: boolean) => act(() => onIntersection([{ isIntersecting, boundingClientRect: { top: -900, bottom: isIntersecting ? 100 : -20 } } as IntersectionObserverEntry], {} as IntersectionObserver));
    notify(false);
    const dock = screen.getByRole('region', { name: 'Sticky purchase controls' });
    const sizes = screen.getByRole('group', { name: 'Select size' });
    fireEvent.click(within(sizes).getByRole('button', { name: /32.*18/ }));
    expect(dock).toHaveTextContent('₱2,600.00');
    expect(dock).toHaveTextContent('32.00 in × 18.00 in');
    fireEvent.click(within(dock).getByRole('button', { name: 'Add to Cart' }));
    const { getCart } = await import('../../data/store');
    expect(getCart()[0]).toMatchObject({ variationId: 'large', price: 2600 });
    fireEvent.click(within(sizes).getByRole('button', { name: /40.*20/ }));
    expect(within(dock).getByRole('button', { name: 'Buy Now' })).toBeDisabled();
    expect(within(dock).getByRole('button', { name: 'Add to Cart' })).toBeDisabled();
    expect(dock).toHaveTextContent('Out of stock');
    notify(true);
    expect(screen.queryByRole('region', { name: 'Sticky purchase controls' })).not.toBeInTheDocument();
  });

  it('resets sizes, weight and reviews when a recommendation opens a product with no specifications', async () => {
    const { container } = renderProduct();
    await screen.findByRole('heading', { name: 'Bigasan Terracotta' });
    fireEvent.click(screen.getByRole('button', { name: 'Open plain product' }));
    await screen.findByRole('heading', { name: /Plain piece with a very long/ });
    expect(container.querySelector('.pdp-price')).toHaveTextContent('₱75.00');
    expect(screen.queryByRole('group', { name: 'Select size' })).not.toBeInTheDocument();
    expect(container.querySelector('.pdp-spec-tiles')).not.toBeInTheDocument();
    expect(container.querySelector('.pdp-craft')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'A***t' })).not.toBeInTheDocument();
    expect(container.querySelector('.pdp-reviews')).toHaveTextContent('No reviews yet.');
    expect(screen.getByRole('button', { name: 'Buy Now' })).toBeDisabled();
  });
});

describe('product recommendation rows', () => {
  it('keeps same-shop results strict, excludes the current product and hides an empty row', async () => {
    mocks.products.push({ id: 'same', name: 'Same shop piece', shop_id: 'shop', category: 'Vases', price: 80, status: 'active' });
    const { rerender } = render(<MemoryRouter><RecommendationsSection sameShopOnly preferredShopIds={['shop']} excludeProductIds={['jar']} title="More from the Same Shop" /></MemoryRouter>);
    const row = await screen.findByRole('region', { name: 'More from the Same Shop products' });
    expect(within(row).getByRole('link', { name: /Same shop piece/ })).toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: /Another shop/ })).not.toBeInTheDocument();
    expect(mocks.calls.filter(call => call.table === 'products').every(call => call.filters.some(([key]) => key === 'shop_id'))).toBe(true);
    rerender(<MemoryRouter><RecommendationsSection sameShopOnly preferredShopIds={['empty-shop']} title="More from the Same Shop" /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'More from the Same Shop' })).not.toBeInTheDocument());
  });

  it('retains category preference and popular fallback for general recommendations', async () => {
    render(<MemoryRouter><RecommendationsSection preferredCategories={['Jars']} preferredShopIds={['shop']} excludeProductIds={['jar']} /></MemoryRouter>);
    const row = await screen.findByRole('region', { name: 'You Might Also Like products' });
    expect(within(row).getByRole('link', { name: /Another shop piece/ })).toBeInTheDocument();
    const calls = mocks.calls.filter(call => call.table === 'products');
    expect(calls[0].filters).toContainEqual(['category', ['Jars']]);
    expect(calls.at(-1)?.order).toBe('views');
  });

  it('settles failed recommendations instead of leaving loading placeholders indefinitely', async () => {
    mocks.failProducts = true;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MemoryRouter><RecommendationsSection sameShopOnly preferredShopIds={['shop']} /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'You Might Also Like' })).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    error.mockRestore();
  });
});
