import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Order } from '../../types';
import type { DetailTab } from '../../components/admin/orders/OrderManagementUI';
import OrdersPage from './OrdersPage';

const mocks = vi.hoisted(() => ({
  readOrders: vi.fn(),
  writeOrder: vi.fn(),
  activity: vi.fn(),
  purchaseApi: vi.fn(),
  notify: vi.fn(),
  refreshOrders: null as (() => Promise<void>) | null,
}));

vi.mock('../../lib/popups', () => ({ notify: mocks.notify }));
vi.mock('../../lib/purchaseApi', () => ({ purchaseApi: mocks.purchaseApi }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1' } }) }));
vi.mock('../../realtime/usePortalRealtimeRefresh', () => ({
  usePortalRealtimeRefresh: (tables: string[], refresh: () => Promise<void>) => {
    if (tables.includes('orders')) mocks.refreshOrders = refresh;
  },
}));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'orders') return {
        select: () => ({ order: () => mocks.readOrders() }),
        update: (updates: Partial<Order>) => ({ eq: (_key: string, id: string) => ({ select: () => ({ maybeSingle: () => mocks.writeOrder(id, updates) }) }) }),
      };
      const query = { eq: () => query, order: () => mocks.activity() };
      return { select: () => query };
    },
  },
}));
vi.mock('../../components/admin/orders/OrderManagementUI', () => ({
  QueueTabs: () => null,
  ExceptionSummary: () => null,
  OrdersToolbar: () => null,
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  OrdersList: ({ orders, error, onOpen, onRetry }: { orders: Order[]; error: string; onOpen: (order: Order) => void; onRetry: () => void }) => <section>
    {error ? <div role="alert">{error}<button onClick={onRetry}>Retry orders</button></div> : null}
    {orders.map(order => <button key={order.id} onClick={() => onOpen(order)}>Open {order.id}: {order.status}</button>)}
  </section>,
  OrderDetailDrawer: ({ order, onClose, onTabChange, children, footer }: { order: Order | null; onClose: () => void; onTabChange: (tab: DetailTab) => void; children: ReactNode; footer: ReactNode }) => order ? <section aria-label="Order details">
    <button onClick={onClose}>Close details</button>
    <button onClick={() => onTabChange('problems')}>Issues</button>
    <button onClick={() => onTabChange('activity')}>Activity</button>
    {children}{footer}
  </section> : null,
}));
vi.mock('../../components/admin/ConfirmDialog', () => ({
  default: ({ title, onConfirm }: { title: string; onConfirm: () => Promise<void> }) => <section><strong>{title}</strong><button onClick={() => void onConfirm()}>Confirm action</button></section>,
}));

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1', user_name: 'Buyer', items: [{ product_id: 'product-1', product_name: 'Vase', shop_id: 'shop-1', qty: 1, price: 500 }],
  subtotal: 500, shipping_fee: 0, total: 500, delivery_status: 'pending', status: 'paid', payment_status: 'paid',
  created_at: '2026-11-01T00:00:00Z', ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function openPage(initialEntries = ['/admin/orders']) {
  render(<MemoryRouter initialEntries={initialEntries}><OrdersPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Open order-1: paid' }));
  await waitFor(() => expect(mocks.purchaseApi).toHaveBeenCalled());
}

describe('admin order persistence and recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshOrders = null;
    mocks.readOrders.mockResolvedValue({ data: [order()], error: null });
    mocks.writeOrder.mockImplementation(async (_id: string, updates: Partial<Order>) => ({ data: order(updates), error: null }));
    mocks.activity.mockResolvedValue({ data: [], error: null });
    mocks.purchaseApi.mockResolvedValue({ returnRequest: null });
  });

  it.each(['returned error', 'zero rows', 'rejected promise'])('does not report an investigation flag as saved after %s', async (failure) => {
    if (failure === 'returned error') mocks.writeOrder.mockResolvedValue({ data: null, error: { message: 'Permission denied' } });
    else if (failure === 'zero rows') mocks.writeOrder.mockResolvedValue({ data: null, error: null });
    else mocks.writeOrder.mockRejectedValue(new Error('Network unavailable'));
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'Investigate' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('error', expect.any(String)));
    expect(mocks.notify).not.toHaveBeenCalledWith('success', expect.anything());
    expect(screen.getByRole('button', { name: 'Investigate' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Remove flag' })).not.toBeInTheDocument();
  });

  it('uses the returned row and blocks duplicate investigation clicks during a save', async () => {
    const save = deferred<{ data: Order; error: null }>();
    mocks.writeOrder.mockReturnValue(save.promise);
    await openPage();
    const investigate = screen.getByRole('button', { name: 'Investigate' });
    fireEvent.click(investigate);
    fireEvent.click(investigate);
    expect(mocks.writeOrder).toHaveBeenCalledOnce();
    expect(investigate).toBeDisabled();
    await act(async () => { save.resolve({ data: order({ flagged_for_investigation: true, status: 'completed' }), error: null }); });
    expect(screen.getByRole('button', { name: 'Remove flag' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Open order-1: completed' })).toBeInTheDocument();
  });

  it('keeps cancellation review open and unchanged when the update matches no row', async () => {
    mocks.readOrders.mockResolvedValue({ data: [{ ...order(), cancellation_approved: null, cancel_reason: 'Buyer request' }], error: null });
    mocks.writeOrder.mockResolvedValue({ data: null, error: null });
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'Issues' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('error', expect.any(String)));
    expect(screen.getByText('Approve Cancellation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open order-1: paid' })).toBeInTheDocument();
    expect(mocks.notify).not.toHaveBeenCalledWith('success', 'Cancellation approved');
  });

  it('preserves unsaved notes when a live refresh replaces the selected order', async () => {
    await openPage();
    const sellerNotes = screen.getByPlaceholderText('Internal notes visible to seller...');
    fireEvent.change(sellerNotes, { target: { value: 'Unsaved local draft' } });
    mocks.readOrders.mockResolvedValue({ data: [order({ seller_notes: 'Remote saved note' })], error: null });
    await act(async () => { await mocks.refreshOrders?.(); });
    expect(sellerNotes).toHaveValue('Unsaved local draft');
  });

  it('does not let an older read undo a confirmed write', async () => {
    await openPage();
    const refresh = deferred<{ data: Order[]; error: null }>();
    mocks.readOrders.mockReturnValueOnce(refresh.promise);
    let refreshing: Promise<void> | undefined;
    act(() => { refreshing = mocks.refreshOrders?.(); });
    fireEvent.click(screen.getByRole('button', { name: 'Investigate' }));
    await screen.findByRole('button', { name: 'Remove flag' });
    await act(async () => { refresh.resolve({ data: [order()], error: null }); await refreshing; });
    expect(screen.getByRole('button', { name: 'Remove flag' })).toBeInTheDocument();
  });

  it('shows and recovers from a rejected order-list request', async () => {
    mocks.readOrders.mockRejectedValueOnce(new Error('Temporary outage'));
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary outage');
    fireEvent.click(screen.getByRole('button', { name: 'Retry orders' }));
    expect(await screen.findByRole('button', { name: 'Open order-1: paid' })).toBeInTheDocument();
  });

  it('keeps a closed deep-linked drawer closed after refresh', async () => {
    render(<MemoryRouter initialEntries={['/admin/orders?orderId=order-1']}><OrdersPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Close details' }));
    await act(async () => { await mocks.refreshOrders?.(); });
    expect(screen.queryByRole('button', { name: 'Close details' })).not.toBeInTheDocument();
  });

  it('distinguishes unavailable activity from an empty activity list', async () => {
    mocks.activity.mockRejectedValueOnce(new Error('Activity unavailable'));
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Activity unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry activity' }));
    expect(await screen.findByText('No activity recorded yet.')).toBeInTheDocument();
  });
});
