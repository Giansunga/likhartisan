import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityLogPage from './ActivityLogPage';
import type { ActivityLogRecord } from '../../types/activity';

interface Query { filters: Record<string, string>; cursor: string | null }
interface Result { data: ActivityLogRecord[] | null; error: { code?: string; message: string } | null }
const mocks = vi.hoisted(() => ({
  load: vi.fn<(query: Query) => Promise<Result>>(),
  exportActivityLog: vi.fn(),
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => {
  const query: Query = { filters: {}, cursor: null };
  const builder = {
    select: () => builder, gte: () => builder, lte: () => builder, order: () => builder, limit: () => builder,
    eq: (field: string, value: string) => { query.filters[field] = value; return builder; },
    or: (value: string) => { if (value.startsWith('occurred_at.lt.')) query.cursor = value; return builder; },
    then: (resolve: (result: Result) => unknown, reject: (cause: unknown) => unknown) => mocks.load(query).then(resolve, reject),
  };
  return builder;
} } }));
// Keep race tests small; the fixed production page size is covered by activityLog utility tests.
vi.mock('../../lib/activityLog', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/activityLog')>(), ACTIVITY_PAGE_SIZE: 2 }));
vi.mock('../../lib/activityApi', () => ({ exportActivityLog: mocks.exportActivityLog }));
vi.mock('../../lib/popups', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('../../realtime/PortalRealtimeProvider', () => ({ usePortalRealtime: () => null }));

function record(id: string, summary = id): ActivityLogRecord {
  return {
    id, summary, occurred_at: '2026-11-01T01:00:00Z', actor_id: 'admin-1', actor_label: 'Admin',
    actor_context: 'admin', source: 'admin_portal', category: 'orders', event_name: 'order.updated',
    severity: 'info', entity_type: 'orders', entity_id: id, entity_label: id,
    before_data: null, after_data: null, metadata: {}, correlation_id: id,
  };
}
function page(prefix: string) { return Array.from({ length: 3 }, (_, index) => record(`${prefix}-${index}`)); }
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (cause: unknown) => void = () => {};
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function renderPage() { return render(<MemoryRouter><ActivityLogPage /></MemoryRouter>); }

describe('ActivityLogPage loading and export recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ data: [record('first-record')], error: null });
    mocks.exportActivityLog.mockResolvedValue(undefined);
  });

  it('ignores a previous filter response that finishes after the current filters', async () => {
    const old = deferred<Result>();
    mocks.load.mockImplementation(query => query.filters.category === 'payments'
      ? Promise.resolve({ data: [record('payment-result')], error: null }) : old.promise);
    renderPage();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'payments' } });
    await screen.findByRole('button', { name: 'View details for payment-result' });
    await act(async () => { old.resolve({ data: [record('old-result')], error: null }); await old.promise; });
    expect(screen.queryByRole('button', { name: 'View details for old-result' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View details for payment-result' })).toBeInTheDocument();
  });

  it('discards an old pagination response and keeps the current pagination busy until it finishes', async () => {
    const oldPage = deferred<Result>();
    const newPage = deferred<Result>();
    mocks.load.mockImplementation(query => {
      if (query.filters.category === 'payments') return query.cursor ? newPage.promise : Promise.resolve({ data: page('payment'), error: null });
      return query.cursor ? oldPage.promise : Promise.resolve({ data: page('old'), error: null });
    });
    renderPage();
    const more = await screen.findByRole('button', { name: 'Load older activity' });
    act(() => { fireEvent.click(more); fireEvent.click(more); });
    await waitFor(() => expect(mocks.load.mock.calls.filter(([query]) => query.cursor)).toHaveLength(1));
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'payments' } });
    await screen.findByRole('button', { name: 'View details for payment-0' });
    fireEvent.click(await screen.findByRole('button', { name: 'Load older activity' }));
    await waitFor(() => expect(mocks.load.mock.calls.filter(([query]) => query.cursor)).toHaveLength(2));
    await act(async () => { oldPage.resolve({ data: [record('old-paginated')], error: null }); await oldPage.promise; });
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'View details for old-paginated' })).not.toBeInTheDocument();
    await act(async () => { newPage.resolve({ data: [record('payment-1'), record('payment-2')], error: null }); await newPage.promise; });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'View details for payment-2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Loading…' })).not.toBeInTheDocument();
  });

  it('shows a returned query error message and retries successfully', async () => {
    mocks.load.mockResolvedValueOnce({ data: null, error: { message: 'Database temporarily unavailable' } });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Database temporarily unavailable');
    expect(screen.queryByLabelText('Loading activity')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'View details for first-record' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('catches rejected pagination and allows another load without losing existing rows', async () => {
    let pageAttempts = 0;
    mocks.load.mockImplementation(async query => {
      if (!query.cursor) return { data: page('row'), error: null };
      if (++pageAttempts === 1) throw { message: 'Connection interrupted' };
      return { data: [record('older-record')], error: null };
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Load older activity' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Connection interrupted'));
    expect(screen.getByRole('button', { name: 'View details for row-0' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load older activity' }));
    await screen.findByRole('button', { name: 'View details for older-record' });
  });

  it('catches a rejected first-page request and releases the loading state', async () => {
    mocks.load.mockRejectedValueOnce(new Error('Network down'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'View details for first-record' });
  });

  it('guards duplicate exports, releases busy state on rejection, and exports the selected filters on retry', async () => {
    const pending = deferred<void>();
    mocks.exportActivityLog.mockReturnValueOnce(pending.promise);
    renderPage();
    await screen.findByRole('button', { name: 'View details for first-record' });
    const exportButton = screen.getByRole('button', { name: 'Export CSV' });
    act(() => { fireEvent.click(exportButton); fireEvent.click(exportButton); });
    expect(mocks.exportActivityLog).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
    await act(async () => { pending.reject({ message: 'Export service unavailable' }); await pending.promise.catch(() => undefined); });
    expect(mocks.error).toHaveBeenCalledWith('Export service unavailable');
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'payments' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Activity log exported.'));
    expect(mocks.exportActivityLog).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'payments' }));
    expect(screen.getByRole('button', { name: 'Export CSV' })).not.toBeDisabled();
  });
});
