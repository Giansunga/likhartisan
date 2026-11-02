import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtisanProvider from '../ArtisanContext';
import { useArtisanPortal } from '../artisanContextValue';

interface Query { table: string; filters: Record<string, unknown>; ids?: string[]; update: boolean }
interface Result { data: Array<Record<string, unknown>> | Record<string, unknown> | null; error: { message: string } | null }
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'seller-1', email: 'seller-1@example.test' } as { id: string; email: string } | null, loading: false },
  query: vi.fn<(query: Query) => Promise<Result>>(),
  captureException: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../../lib/constants', () => ({ SHOP_EMAILS: ['legacy@example.test'] }));
vi.mock('../../../lib/sentry', () => ({ captureException: mocks.captureException }));
vi.mock('../../../realtime/buyerPresence', () => ({ listenToBuyerPresence: () => () => {} }));
vi.mock('../../../realtime/usePortalRealtimeRefresh', () => ({ usePortalRealtimeRefresh: () => {} }));
vi.mock('../../../realtime/PortalRealtimeProvider', () => ({ PortalRealtimeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    const query: Query = { table, filters: {}, update: false };
    const builder = {
      select: () => builder, order: () => builder, limit: () => builder,
      eq: (field: string, value: unknown) => { query.filters[field] = value; return builder; },
      in: (_field: string, ids: string[]) => { query.ids = ids; return builder; },
      update: () => { query.update = true; return builder; },
      maybeSingle: () => mocks.query(query),
      then: (resolve: (value: Result) => unknown, reject: (cause: unknown) => unknown) => mocks.query(query).then(resolve, reject),
    };
    return builder;
  },
  channel: () => ({ subscribe: () => {}, track: vi.fn(async () => 'ok') }),
  removeChannel: vi.fn(async () => 'ok'),
} }));

function shop(id: string) { return { id, name: id, owner_id: id.replace('shop', 'seller') }; }
function product(shopId: string, id = `${shopId}-product`) {
  return { id, name: id, shop_id: shopId, category: 'Vases', price: 200, stock: 1, status: 'active' };
}
function queryResult(query: Query): Result {
  if (query.update) return { data: null, error: null };
  if (query.table === 'user_roles') return { data: [{ role: 'shop_owner', shop_id: String(query.filters.user_id).replace('seller', 'shop') }], error: null };
  if (query.table === 'shops') return { data: shop(String(query.filters.id || 'legacy-shop')), error: null };
  if (query.table === 'products') return { data: [product(String(query.filters.shop_id))], error: null };
  return { data: (query.ids || []).flatMap(id => [{ product_id: id, price: 0 }, { product_id: id, price: 40 }]), error: null };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function Probe() {
  const portal = useArtisanPortal();
  return <section>
    <span data-testid="shop">{portal.shop.id}</span><span data-testid="user">{portal.userId}</span>
    <span data-testid="products">{portal.products.map(item => item.name).join(',')}</span>
    <span data-testid="prices">{Object.values(portal.productPrices).join(',')}</span>
    <span data-testid="product-loading">{String(portal.loadingProducts)}</span>
    <button type="button" onClick={() => void portal.refreshProducts().catch(() => undefined)}>Refresh products</button>
  </section>;
}
function App() {
  return <MemoryRouter initialEntries={['/artisan-dashboard']}><Routes>
    <Route path="/" element={<div>Storefront</div>} />
    <Route path="/artisan-dashboard" element={<ArtisanProvider><Probe /></ArtisanProvider>} />
  </Routes></MemoryRouter>;
}

describe('ArtisanProvider access and listing isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockReset();
    mocks.auth = { user: { id: 'seller-1', email: 'seller-1@example.test' }, loading: false };
    mocks.query.mockImplementation(async query => queryResult(query));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('hides the previous shop and listings immediately when the identity changes', async () => {
    const { rerender } = render(<App />);
    await waitFor(() => expect(screen.getByTestId('products')).toHaveTextContent('shop-1-product'));
    const pendingShop = deferred<Result>();
    mocks.query.mockImplementation(query => query.table === 'shops' && query.filters.id === 'shop-2' ? pendingShop.promise : Promise.resolve(queryResult(query)));
    mocks.auth = { user: { id: 'seller-2', email: 'seller-2@example.test' }, loading: false };
    rerender(<App />);
    expect(screen.queryByTestId('shop')).not.toBeInTheDocument();
    expect(screen.queryByText('shop-1-product')).not.toBeInTheDocument();
    expect(screen.getByText('Loading your shop…')).toBeInTheDocument();
    await act(async () => { pendingShop.resolve({ data: shop('shop-2'), error: null }); await pendingShop.promise; });
    await waitFor(() => expect(screen.getByTestId('products')).toHaveTextContent('shop-2-product'));
    expect(screen.getByTestId('user')).toHaveTextContent('seller-2');
  });

  it.each(['role error', 'role rejection', 'shop error', 'shop rejection'])('offers retry instead of redirecting during a %s', async failure => {
    let failed = false;
    mocks.query.mockImplementation(async query => {
      if (!failed && query.table === (failure.startsWith('role') ? 'user_roles' : 'shops') && !query.update) {
        failed = true;
        if (failure.endsWith('rejection')) throw new Error('Service unavailable');
        return { data: null, error: { message: 'Service unavailable' } };
      }
      return queryResult(query);
    });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.queryByText('Storefront')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('shop');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('redirects a genuinely unauthorized account', async () => {
    mocks.query.mockImplementation(async query => query.table === 'user_roles' ? { data: [], error: null } : queryResult(query));
    render(<App />);
    expect(await screen.findByText('Storefront')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('removes the cached shop when the same account no longer has its owner role', async () => {
    const { rerender } = render(<App />);
    await screen.findByTestId('shop');
    mocks.query.mockImplementation(async query => query.table === 'user_roles' ? { data: [], error: null } : queryResult(query));
    mocks.auth = { ...mocks.auth, user: { ...mocks.auth.user! } };
    rerender(<App />);
    expect(await screen.findByText('Storefront')).toBeInTheDocument();
    expect(screen.queryByTestId('shop')).not.toBeInTheDocument();
  });

  it('preserves the last good listing/prices on variation failure and recovers on retry', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('products')).toHaveTextContent('shop-1-product'));
    expect(screen.getByTestId('prices')).toHaveTextContent('0');
    mocks.query.mockImplementation(async query => {
      if (query.table === 'products') return { data: [product('shop-1', 'replacement-product')], error: null };
      if (query.table === 'product_variations') return { data: null, error: { message: 'Prices unavailable' } };
      return queryResult(query);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh products' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Prices unavailable');
    expect(screen.getByTestId('products')).toHaveTextContent('shop-1-product');
    expect(screen.getByTestId('product-loading')).toHaveTextContent('false');
    mocks.query.mockImplementation(async query => query.table === 'products'
      ? { data: [product('shop-1', 'replacement-product')], error: null } : queryResult(query));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('products')).toHaveTextContent('replacement-product'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores an older product refresh that finishes after the latest refresh', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('products')).toHaveTextContent('shop-1-product'));
    const old = deferred<Result>();
    let productQueries = 0;
    mocks.query.mockImplementation(query => query.table === 'products'
      ? ++productQueries === 1 ? old.promise : Promise.resolve({ data: [product('shop-1', 'newest-product')], error: null })
      : Promise.resolve(queryResult(query)));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh products' }));
    await waitFor(() => expect(productQueries).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh products' }));
    await waitFor(() => expect(screen.getByTestId('products')).toHaveTextContent('newest-product'));
    await act(async () => { old.resolve({ data: [product('shop-1', 'obsolete-product')], error: null }); await old.promise; });
    expect(screen.getByTestId('products')).toHaveTextContent('newest-product');
    expect(screen.getByTestId('product-loading')).toHaveTextContent('false');
  });

  it('allows the configured legacy seller and normalizes its email lookup', async () => {
    mocks.auth = { user: { id: 'legacy-seller', email: ' LEGACY@EXAMPLE.TEST ' }, loading: false };
    mocks.query.mockImplementation(async query => query.table === 'user_roles' ? { data: [], error: null } : queryResult(query));
    render(<App />);
    await screen.findByTestId('shop');
    expect(mocks.query.mock.calls.map(([query]) => query)).toContainEqual(expect.objectContaining({ table: 'shops', filters: { email: 'legacy@example.test' } }));
  });
});
