import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order, OrderItem } from '../../types';
import { OrdersPanel } from './SellerOrdersPage';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  rpc: vi.fn(),
  purchaseApi: vi.fn(),
  warning: vi.fn(),
  refresh: null as (() => Promise<void>) | null,
}));

vi.mock('../../lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ order: () => mocks.read() }) }),
  rpc: mocks.rpc,
} }));
vi.mock('../../lib/purchaseApi', () => ({ purchaseApi: mocks.purchaseApi }));
vi.mock('../../lib/popups', () => ({ toast: { error: mocks.warning } }));
vi.mock('../../realtime/usePortalRealtimeRefresh', () => ({
  usePortalRealtimeRefresh: (_tables: string[], refresh: () => Promise<void>) => { mocks.refresh = refresh; },
}));

const item = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  product_id: 'product-1', product_name: 'Clay vase', shop_id: 'shop-1', shop_name: 'Clay Shop', qty: 1, price: 500, ...overrides,
});
const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1', user_name: 'Maria', items: [item()], subtotal: 500, shipping_fee: 0, total: 500,
  status: 'paid', payment_status: 'paid', delivery_status: 'pending', created_at: '2026-11-01T00:00:00Z', ...overrides,
});
const saved = (overrides: Partial<Order> = {}) => ({ id: 'order-1', status: 'paid', delivery_status: 'preparing', ...overrides });

function Harness({ initialEntries = ['/artisan-dashboard/orders'] }: { initialEntries?: string[] }) {
  const [loading, setLoading] = useState(true);
  return <MemoryRouter initialEntries={initialEntries}><OrdersPanel shopId="shop-1" shopName="Clay Shop" loadingOrders={loading} setLoadingOrders={setLoading} /></MemoryRouter>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.refresh = null;
  mocks.read.mockResolvedValue({ data: [order()], error: null });
  mocks.rpc.mockResolvedValue({ data: saved(), error: null });
  mocks.purchaseApi.mockResolvedValue({ order: saved(), notificationSent: true });
});
afterEach(() => vi.restoreAllMocks());

describe('seller order failures and persistence', () => {
  it('shows a failed load rather than an empty queue and retries successfully', async () => {
    mocks.read.mockRejectedValueOnce(new Error('Orders temporarily unavailable'));
    render(<Harness />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Orders temporarily unavailable');
    expect(screen.queryByText('No orders found')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Confirm Order' })).toBeEnabled();
  });

  it.each([
    ['product', 'returned error'], ['product', 'null result'], ['product', 'rejected promise'],
    ['customized', 'returned error'], ['customized', 'null result'], ['customized', 'rejected promise'],
  ])('keeps the %s drawer and original status after a %s', async (type, failure) => {
    mocks.read.mockResolvedValue({ data: [order({ order_type: type })], error: null });
    const request = type === 'customized' ? mocks.rpc : mocks.purchaseApi;
    if (failure === 'rejected promise') request.mockRejectedValueOnce(new Error('Order update unavailable'));
    else if (type === 'customized') request.mockResolvedValueOnce({ data: null, error: failure === 'returned error' ? { message: 'Order update denied' } : null });
    else request.mockResolvedValueOnce(failure === 'returned error' ? { error: 'Order update denied', order: null } : null);
    render(<Harness />);
    fireEvent.click(await screen.findByText('Clay vase'));
    const drawer = screen.getByRole('dialog', { name: 'Order order-1' });
    const action = type === 'customized' ? 'Start Production' : 'Confirm Order';
    fireEvent.click(within(drawer).getByRole('button', { name: action }));
    expect(await within(drawer).findByRole('alert')).toHaveTextContent(/unavailable|denied|could not be confirmed/i);
    expect(within(drawer).getByText('pending')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: action })).toBeEnabled();
    expect(screen.getByRole('dialog', { name: 'Order order-1' })).toBeInTheDocument();
    expect(mocks.warning).not.toHaveBeenCalled();
  });

  it.each(['product', 'customized'])('blocks duplicate %s actions until the primary request finishes', async type => {
    mocks.read.mockResolvedValue({ data: [order({ order_type: type })], error: null });
    const request = deferred<unknown>();
    const write = type === 'customized' ? mocks.rpc : mocks.purchaseApi;
    write.mockReturnValueOnce(request.promise);
    render(<Harness />);
    const action = await screen.findByRole('button', { name: type === 'customized' ? 'Start Production' : 'Confirm Order' });
    fireEvent.click(action);
    fireEvent.click(action);
    expect(write).toHaveBeenCalledOnce();
    expect(action).toBeDisabled();
    await act(async () => { request.resolve(type === 'customized' ? { data: saved(), error: null } : { order: saved(), notificationSent: true }); });
    expect(screen.getByRole('button', { name: 'Hand to Courier' })).toBeEnabled();
  });

  it('does not let a slow refresh started during a write undo the saved status', async () => {
    const update = deferred<unknown>();
    const load = deferred<{ data: Order[]; error: null }>();
    mocks.purchaseApi.mockReturnValueOnce(update.promise);
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Order' }));
    mocks.read.mockReturnValueOnce(load.promise);
    let refreshing: Promise<void> | undefined;
    act(() => { refreshing = mocks.refresh?.(); });
    await act(async () => { update.resolve({ order: saved(), notificationSent: true }); });
    await act(async () => { load.resolve({ data: [order()], error: null }); await refreshing; });
    expect(screen.getByRole('button', { name: 'Hand to Courier' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Order' })).not.toBeInTheDocument();
  });

  it('matches shop IDs before names while retaining legacy records without an ID', async () => {
    mocks.read.mockResolvedValue({ data: [order({ items: [
      item({ product_name: 'Owned vase' }),
      item({ product_id: 'other-product', product_name: 'Other shop vase', shop_id: 'shop-2', shop_name: 'Clay Shop' }),
      item({ product_id: 'legacy-product', product_name: 'Legacy vase', shop_id: undefined, shop_name: 'Clay Shop' }),
    ] })], error: null });
    render(<Harness />);
    expect(await screen.findByText('Owned vase')).toBeInTheDocument();
    expect(screen.getByText('Legacy vase')).toBeInTheDocument();
    expect(screen.queryByText('Other shop vase')).not.toBeInTheDocument();
  });

  it('uses unique row keys for identically named items and updates every row of an order plus its open drawer', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.read.mockResolvedValue({ data: [order({ items: [item(), item({ variation_id: 'variation-2', qty: 2 })] })], error: null });
    render(<Harness />);
    const names = await screen.findAllByText('Clay vase');
    expect(names).toHaveLength(2);
    expect(errors.mock.calls.flat().join(' ')).not.toContain('same key');
    fireEvent.click(names[0]);
    const drawer = screen.getByRole('dialog', { name: 'Order order-1' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Confirm Order' }));
    await waitFor(() => expect(within(drawer).getByText('preparing')).toBeInTheDocument());
    expect(within(screen.getByRole('table')).getAllByText('preparing')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Hand to Courier' })).toHaveLength(3);
  });

  it('rejects an incomplete saved custom-order record rather than clearing the delivery status', async () => {
    mocks.read.mockResolvedValue({ data: [order({ order_type: 'customized' })], error: null });
    mocks.rpc.mockResolvedValueOnce({ data: { id: 'order-1' }, error: null });
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start Production' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed');
    expect(screen.getByRole('button', { name: 'Start Production' })).toBeEnabled();
    expect(within(screen.getByRole('table')).getByText('pending')).toBeInTheDocument();
  });

  it('keeps a confirmed primary update when only its buyer notification fails', async () => {
    mocks.purchaseApi.mockResolvedValueOnce({ order: saved(), notificationSent: false });
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Order' }));
    expect(await screen.findByRole('button', { name: 'Hand to Courier' })).toBeInTheDocument();
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('Do not repeat the order update'));
  });

  it('keeps legacy completed payment status paid after a custom-order update', async () => {
    mocks.read.mockResolvedValue({ data: [order({ order_type: 'customized', payment_status: 'completed' })], error: null });
    mocks.rpc.mockResolvedValueOnce({ data: saved({ payment_status: 'completed' }), error: null });
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start Production' }));
    expect(await screen.findByRole('button', { name: 'Hand to Courier' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Paid')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('Cancelled')).not.toBeInTheDocument();
  });
});
