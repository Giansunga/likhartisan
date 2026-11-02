import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SellerRequests from '../SellerRequests';

interface Query { table: string; filters: Record<string, unknown> }
interface Result { data: unknown; error: { message: string } | null }
const mocks = vi.hoisted(() => ({
  requests: [] as Record<string, unknown>[],
  query: vi.fn<(query: Query) => Promise<Result> | Result | undefined>(),
  rpc: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  refreshes: new Map<string, () => void | Promise<void>>(),
}));

vi.mock('../artisanContextValue', () => ({ useArtisanPortal: () => ({ shop: { id: 'shop-1', name: 'Shop One' } }) }));
vi.mock('../SellerDesignDetails', () => ({ default: ({ children }: { children: ReactNode }) => <section>{children}</section> }));
vi.mock('../../../lib/popups', () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock('../../../realtime/usePortalRealtimeRefresh', () => ({
  usePortalRealtimeRefresh: (tables: string[], refresh: () => void | Promise<void>) => { mocks.refreshes.set(tables.join(','), refresh); },
}));
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      const query: Query = { table, filters: {} };
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => { query.filters[key] = value; return builder; },
        order: async () => mocks.query(query) ?? { data: table === 'design_requests' ? mocks.requests : [], error: null },
      };
      return builder;
    },
  },
}));

function request(id = 'request-a', name = 'Vase A', overrides: Record<string, unknown> = {}) {
  return {
    id, shop_id: 'shop-1', buyer_id: 'buyer-1', conversation_id: 'conversation-1',
    status: 'pending', quantity: 100, buyer_note: '', shop_response: '', quoted_price: null, lead_time_days: null,
    current_revision: 1, created_at: '2026-10-01T01:00:00Z', updated_at: '2026-10-01T01:00:00Z',
    design_snapshot: { model: { id: 'model-1', name, category: 'Vase', thumbnail: '' }, material: { color: '#aabbcc' } },
    conversations: { buyer_name: 'Maria Santos' }, ...overrides,
  };
}

function Navigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/artisan-dashboard/requests')}>Clear link</button><button onClick={() => navigate('/artisan-dashboard/requests?requestId=request-b')}>Link to B</button></>;
}

function renderRequests(url = '/artisan-dashboard/requests') {
  return render(<MemoryRouter initialEntries={[url]}><Navigation /><SellerRequests /></MemoryRouter>);
}

async function openFirst() {
  fireEvent.click((await screen.findByText('Vase A')).closest('button')!);
  await screen.findByRole('dialog', { name: 'Vase A' });
  await waitFor(() => expect(screen.queryByText('Loading history…')).not.toBeInTheDocument());
}

function fillQuote(quote = '1250', days = '7') {
  fireEvent.change(screen.getByLabelText(/Total quote/), { target: { value: quote } });
  fireEvent.change(screen.getByLabelText(/Lead time/), { target: { value: days } });
  fireEvent.change(screen.getByLabelText(/Reply note \(optional\)/), { target: { value: 'Keep this reply' } });
}

describe('SellerRequests recovery and selection', () => {
  beforeEach(() => {
    mocks.requests = [request()];
    mocks.query.mockReset();
    mocks.rpc.mockReset();
    mocks.error.mockReset();
    mocks.success.mockReset();
    mocks.refreshes.clear();
  });

  it('initializes saved quote fields when opening a direct request link', async () => {
    mocks.requests = [request('request-a', 'Vase A', { status: 'quoted', quoted_price: 1200, lead_time_days: 14, shop_response: 'Saved quote note' })];
    renderRequests('/artisan-dashboard/requests?requestId=request-a');
    await screen.findByRole('dialog', { name: 'Vase A' });
    expect(screen.getByLabelText(/Total quote/)).toHaveValue(1200);
    expect(screen.getByLabelText(/Lead time/)).toHaveValue(14);
    expect(screen.getByLabelText(/Reply note \(optional\)/)).toHaveValue('Saved quote note');
    await waitFor(() => expect(screen.queryByText('Loading history…')).not.toBeInTheDocument());
  });

  it.each(['rejected', 'null'] as const)('preserves a quote draft and releases busy state after a %s response', async kind => {
    if (kind === 'rejected') mocks.rpc.mockRejectedValue(new Error('Quote service unavailable'));
    else mocks.rpc.mockResolvedValue({ data: null, error: null });
    renderRequests();
    await openFirst();
    fillQuote();
    fireEvent.click(screen.getByRole('button', { name: 'Send quote' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(kind === 'rejected' ? 'Quote service unavailable' : 'The saved response could not be confirmed. Reload this request before retrying.'));
    expect(screen.getByRole('button', { name: 'Send quote' })).toBeEnabled();
    expect(screen.getByLabelText(/Total quote/)).toHaveValue(1250);
    expect(screen.getByLabelText(/Lead time/)).toHaveValue(7);
    expect(screen.getByLabelText(/Reply note \(optional\)/)).toHaveValue('Keep this reply');
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('allows only one RPC while a quote save is pending', async () => {
    let finish: ((value: Result) => void) | undefined;
    mocks.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderRequests();
    await openFirst();
    fillQuote();
    const save = screen.getByRole('button', { name: 'Send quote' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Close request' })).toBeDisabled();
    await act(async () => { finish?.({ data: null, error: { message: 'Save rejected' } }); });
    expect(screen.getByRole('button', { name: 'Send quote' })).toBeEnabled();
  });

  it('shows history failure with a retry instead of an endless loader or empty history', async () => {
    mocks.query.mockImplementation(query => query.table === 'design_request_revisions' ? Promise.reject(new Error('History unavailable')) : undefined);
    renderRequests();
    await openFirst();
    expect(screen.getByRole('alert')).toHaveTextContent('History unavailable');
    expect(screen.queryByText('No history is available for this request yet.')).not.toBeInTheDocument();
    mocks.query.mockReset();
    fireEvent.click(screen.getByRole('button', { name: 'Retry history' }));
    await screen.findByText('No history is available for this request yet.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a confirmed quote successful when the subsequent history refresh rejects', async () => {
    renderRequests();
    await openFirst();
    fillQuote();
    mocks.rpc.mockResolvedValue({ data: request('request-a', 'Vase A', { status: 'quoted', quoted_price: 1250, lead_time_days: 7, shop_response: 'Keep this reply' }), error: null });
    mocks.query.mockImplementation(query => query.table === 'design_request_revisions' ? Promise.reject(new Error('History refresh failed')) : undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Send quote' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Quote sent to the buyer.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('History refresh failed');
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Send quote' })).toBeEnabled();
  });

  it('preserves an edited response while live request data refreshes', async () => {
    mocks.requests = [request('request-a', 'Vase A', { shop_response: 'Saved reply' })];
    renderRequests('/artisan-dashboard/requests?requestId=request-a');
    await screen.findByRole('dialog', { name: 'Vase A' });
    fireEvent.change(screen.getByLabelText(/Reply note \(optional\)/), { target: { value: 'Unsaved newer reply' } });
    await act(async () => { await mocks.refreshes.get('design_requests,orders')?.(); });
    expect(screen.getByLabelText(/Reply note \(optional\)/)).toHaveValue('Unsaved newer reply');
    await waitFor(() => expect(screen.queryByText('Loading history…')).not.toBeInTheDocument());
  });

  it('ignores history from a previous selection and follows changed request links', async () => {
    mocks.requests = [request(), request('request-b', 'Vase B', { quoted_price: 2400, lead_time_days: 20, shop_response: 'B note' })];
    let finishFirst: ((value: Result) => void) | undefined;
    mocks.query.mockImplementation(query => {
      if (query.table === 'design_request_revisions' && query.filters.request_id === 'request-a') return new Promise(resolve => { finishFirst = resolve; });
      if (query.table === 'design_request_events') return { data: [{ id: `event-${query.filters.request_id}`, request_id: query.filters.request_id, event_type: 'changes_requested', payload: { response: query.filters.request_id === 'request-a' ? 'A old history' : 'B current history' }, created_at: '2026-10-01T01:00:00Z' }], error: null };
    });
    renderRequests('/artisan-dashboard/requests?requestId=request-a');
    await waitFor(() => expect(finishFirst).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Link to B' }));
    await screen.findByRole('dialog', { name: 'Vase B' });
    expect(await screen.findByText('B current history')).toBeInTheDocument();
    await act(async () => { finishFirst?.({ data: [], error: null }); });
    expect(screen.queryByText('A old history')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Reply note \(optional\)/)).toHaveValue('B note');
    fireEvent.click(screen.getByRole('button', { name: 'Clear link' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('ignores a slow older list refresh after newer data arrives', async () => {
    let finishFirst: ((value: Result) => void) | undefined;
    let loads = 0;
    mocks.query.mockImplementation(query => {
      if (query.table !== 'design_requests') return;
      loads++;
      if (loads === 1) return new Promise(resolve => { finishFirst = resolve; });
      return { data: [request('request-b', 'Vase B')], error: null };
    });
    renderRequests();
    await waitFor(() => expect(finishFirst).toBeDefined());
    await act(async () => { await mocks.refreshes.get('design_requests,orders')?.(); });
    expect(screen.getByText('Vase B')).toBeInTheDocument();
    await act(async () => { finishFirst?.({ data: [request()], error: null }); });
    expect(screen.queryByText('Vase A')).not.toBeInTheDocument();
  });

  it.each([
    { quote: '1e309', days: '7' },
    { quote: '1250', days: '1.5' },
    { quote: '1250', days: '366' },
    { quote: '0', days: '7' },
  ])('rejects invalid quote $quote and lead time $days before sending', async ({ quote, days }) => {
    renderRequests();
    await openFirst();
    fillQuote(quote, days);
    fireEvent.click(screen.getByRole('button', { name: 'Send quote' }));
    expect(mocks.error).toHaveBeenCalledWith('Enter a valid total quote and lead time.');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
