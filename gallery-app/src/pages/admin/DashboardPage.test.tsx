import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';

type Result = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
const mocks = vi.hoisted(() => ({
  load: vi.fn<(table: string) => Promise<Result>>(),
  rpc: vi.fn(),
  refresh: null as null | (() => Promise<void>),
}));

vi.mock('../../lib/supabase', () => ({ supabase: {
  from: (table: string) => ({ select: () => {
    const result = mocks.load(table);
    return Object.assign(result, { order: () => result });
  } }),
  rpc: mocks.rpc,
} }));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../realtime/usePortalRealtimeRefresh', () => ({ usePortalRealtimeRefresh: (_tables: string[], refresh: () => Promise<void>) => { mocks.refresh = refresh; } }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> } }));
vi.mock('../../components/admin/dashboard/StatCard', () => ({ default: ({ label, value, sub }: { label: string; value: string; sub: string }) => <article data-testid={label}>{value}<small>{sub}</small></article> }));
vi.mock('../../components/admin/dashboard/RevenueChart', () => ({ default: () => <div /> }));
vi.mock('../../components/admin/dashboard/OrderStatusChart', () => ({ default: () => <div /> }));
vi.mock('../../components/admin/dashboard/RecentOrdersTable', () => ({ default: () => <div /> }));
vi.mock('../../components/admin/dashboard/RecentProductsTable', () => ({ default: ({ products }: { products: Array<{ price: number }> }) => <div data-testid="product-prices">{products.map(p => p.price).join(',')}</div> }));

function order(total: number | string) {
  return { id: String(total), user_name: 'Buyer', total, status: 'paid', payment_status: 'paid', created_at: new Date().toISOString(), items: [] };
}
function successfulRows(table: string): Result {
  return { error: null, data: table === 'orders' ? [order('100.25'), order('200.25')]
    : table === 'products' ? [{ id: 'product-1', name: 'Pot', image: '', shop_name: 'Shop', category: 'Others', status: 'active', created_at: new Date().toISOString(), price: 20 }]
      : table === 'product_variations' ? [{ product_id: 'product-1', price: 0 }, { product_id: 'product-1', price: 10 }] : [] };
}

describe('admin dashboard recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockImplementation(async table => successfulRows(table));
    mocks.rpc.mockResolvedValue({ data: 0, error: null });
    mocks.refresh = null;
  });

  it('shows a returned database error and retries without presenting zero metrics as real data', async () => {
    mocks.load.mockImplementation(async table => table === 'products' ? { data: null, error: { message: 'Permission unavailable' } } : successfulRows(table));
    render(<DashboardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission unavailable');
    expect(screen.queryByTestId('TOTAL REVENUE')).not.toBeInTheDocument();
    mocks.load.mockImplementation(async table => successfulRows(table));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('TOTAL REVENUE')).toHaveTextContent('₱300.50');
    expect(screen.getByTestId('product-prices')).toHaveTextContent('0');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('finishes loading after a rejected request and retains last successful data on refresh failure', async () => {
    mocks.load.mockRejectedValueOnce(new Error('Network unavailable'));
    render(<DashboardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.queryByText('Loading dashboard...')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('TOTAL REVENUE');
    mocks.load.mockRejectedValueOnce(new Error('Disconnected'));
    await act(async () => { await mocks.refresh?.(); });
    expect(screen.getByTestId('TOTAL REVENUE')).toHaveTextContent('₱300.50');
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last successful update');
  });

  it('ignores an older response that finishes after a newer refresh', async () => {
    let resolveOld: (value: Result) => void = () => {};
    const old = new Promise<Result>(resolve => { resolveOld = resolve; });
    let orderQueries = 0;
    mocks.load.mockImplementation(async table => {
      if (table === 'orders') return ++orderQueries === 1 ? old : { data: [order(50)], error: null };
      return successfulRows(table);
    });
    render(<DashboardPage />);
    await waitFor(() => expect(orderQueries).toBe(1));
    await act(async () => { await mocks.refresh?.(); });
    expect(screen.getByTestId('TOTAL REVENUE')).toHaveTextContent('₱50.00');
    await act(async () => { resolveOld({ data: [order(999)], error: null }); await old; });
    expect(screen.getByTestId('TOTAL REVENUE')).toHaveTextContent('₱50.00');
  });

  it('distinguishes a failed user count from a successful count of zero', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('Count unavailable'));
    render(<DashboardPage />);
    await screen.findByTestId('ACTIVE USERS');
    expect(screen.getByTestId('ACTIVE USERS')).toHaveTextContent('—Unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Count unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry active users' }));
    await waitFor(() => expect(screen.getByTestId('ACTIVE USERS')).toHaveTextContent('0Live count'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
