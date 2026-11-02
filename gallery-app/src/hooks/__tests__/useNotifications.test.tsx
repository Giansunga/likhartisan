import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotifications } from '../useNotifications';
import type { NotificationRecord } from '../../types/notifications';

interface Query {
  operation: 'read' | 'update' | 'delete';
  filters: Record<string, unknown>;
  head: boolean;
  single: boolean;
  changes: { read?: boolean };
}
interface Result {
  data: Array<Record<string, unknown>> | Record<string, unknown> | null;
  error: { message: string } | null;
  count?: number;
}
const mocks = vi.hoisted(() => ({ execute: vi.fn<(query: Query) => Promise<Result>>() }));
const channelTopics: string[] = [];
const channels = new Map<string, { subscribed: boolean }>();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const query: Query = { operation: 'read', filters: {}, head: false, single: false, changes: {} };
      const builder = {
        select: (_selection: string, options?: { head?: boolean }) => { query.head = Boolean(options?.head); return builder; },
        eq: (key: string, value: unknown) => { query.filters[key] = value; return builder; },
        order: () => builder,
        limit: () => builder,
        update: (changes: { read: boolean }) => { query.operation = 'update'; query.changes = changes; return builder; },
        delete: () => { query.operation = 'delete'; return builder; },
        maybeSingle: () => mocks.execute({ ...query, single: true }),
        then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => mocks.execute(query).then(resolve, reject),
      };
      return builder;
    },
    channel: (topic: string) => {
      channelTopics.push(topic);
      const state = channels.get(topic) || { subscribed: false };
      channels.set(topic, state);
      const channel = {
        on: () => {
          if (state.subscribed) throw new Error(`cannot add callbacks for ${topic} after subscribe()`);
          return channel;
        },
        subscribe: () => { state.subscribed = true; return channel; },
      };
      return channel;
    },
    // Retain registrations to reproduce delayed StrictMode cleanup.
    removeChannel: vi.fn(async () => 'ok'),
  },
}));

function notification(id = 'notice-1', userId = 'buyer-1'): NotificationRecord {
  return { id, user_id: userId, type: 'payment', title: id, message: 'Update', recipient_context: 'buyer', read: false, created_at: '2026-11-01T00:00:00Z' };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('useNotifications recovery and realtime', () => {
  let records: NotificationRecord[];
  function execute(query: Query): Promise<Result> {
    const matched = records.filter(record => Object.entries(query.filters).every(([key, value]) => record[key as keyof NotificationRecord] === value));
    const rows = matched.map(record => ({ id: record.id, read: query.operation === 'update' ? query.changes.read : record.read }));
    if (query.operation === 'update') records = records.map(record => matched.includes(record) ? { ...record, ...query.changes } : record);
    if (query.operation === 'delete') records = records.filter(record => !matched.includes(record));
    return Promise.resolve({ data: query.operation === 'read' ? matched.map(record => ({ ...record })) : query.single ? rows[0] || null : rows, error: null, count: matched.length });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    channelTopics.length = 0;
    channels.clear();
    records = [notification()];
    mocks.execute.mockImplementation(execute);
  });

  it('uses a fresh topic when StrictMode replaces the subscription effect', () => {
    const { unmount } = renderHook(() => useNotifications('buyer-1', 'buyer', 10), { wrapper: StrictMode });
    expect(channelTopics).toHaveLength(2);
    expect(new Set(channelTopics).size).toBe(2);
    unmount();
  });

  it('catches a rejected load, releases loading, and allows retry', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('Network unavailable'));
    const { result } = renderHook(() => useNotifications('buyer-1', 'buyer'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network unavailable');
    await act(async () => { await result.current.reload(); });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.error).toBe('');
  });

  it('hides the old user immediately and ignores their late response', async () => {
    const { result, rerender } = renderHook(({ userId }) => useNotifications(userId, 'buyer'), { initialProps: { userId: 'buyer-1' } });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    const old = deferred<Result>();
    mocks.execute.mockImplementationOnce(() => old.promise);
    let oldLoad: Promise<void> = Promise.resolve();
    act(() => { oldLoad = result.current.reload(true); });
    records = [notification('buyer-2-notice', 'buyer-2')];
    rerender({ userId: 'buyer-2' });
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    await waitFor(() => expect(result.current.notifications[0]?.id).toBe('buyer-2-notice'));
    await act(async () => { old.resolve({ data: [{ ...notification() }], error: null }); await oldLoad; });
    expect(result.current.notifications[0]?.id).toBe('buyer-2-notice');
  });

  it.each(['markRead', 'deleteNotification', 'markAllRead'] as const)('does not fabricate success when %s changes zero rows', async action => {
    const { result } = renderHook(() => useNotifications('buyer-1', 'buyer'));
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    mocks.execute.mockImplementation(query => query.operation === 'read' ? execute(query) : Promise.resolve({ data: query.single ? null : [], error: null }));
    await act(async () => {
      if (action === 'markAllRead') await result.current.markAllRead();
      else await result.current[action]('notice-1');
    });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].read).toBe(false);
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.error).toContain('Refresh and try again');
    const mutation = mocks.execute.mock.calls.map(([query]) => query).find(query => query.operation !== 'read');
    expect(mutation?.filters).toMatchObject({ user_id: 'buyer-1', recipient_context: 'buyer' });
  });

  it.each(['markRead', 'deleteNotification', 'markAllRead'] as const)('keeps data and permits retry when %s rejects', async action => {
    const { result } = renderHook(() => useNotifications('buyer-1', 'buyer'));
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    mocks.execute.mockRejectedValueOnce(new Error('Write unavailable'));
    await act(async () => {
      if (action === 'markAllRead') await result.current.markAllRead();
      else await result.current[action]('notice-1');
    });
    expect(result.current.error).toBe('Write unavailable');
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.notifications).toHaveLength(1);
    await act(async () => {
      if (action === 'markAllRead') await result.current.markAllRead();
      else await result.current[action]('notice-1');
    });
    expect(result.current.error).toBe('');
    expect(result.current.unreadCount).toBe(0);
  });

  it('does not let a read started before a mutation restore the unread state', async () => {
    const { result } = renderHook(() => useNotifications('buyer-1', 'buyer'));
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    const old = deferred<Result>();
    mocks.execute.mockImplementationOnce(() => old.promise);
    let oldLoad: Promise<void> = Promise.resolve();
    act(() => { oldLoad = result.current.reload(true); });
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    await act(async () => { await result.current.markRead('notice-1'); });
    expect(result.current.unreadCount).toBe(0);
    await act(async () => { old.resolve({ data: [{ ...notification() }], error: null }); await oldLoad; });
    expect(result.current.notifications[0].read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it('guards duplicate submissions while a write is pending', async () => {
    const { result } = renderHook(() => useNotifications('buyer-1', 'buyer'));
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    const pending = deferred<Result>();
    mocks.execute.mockImplementationOnce(() => pending.promise);
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.markRead('notice-1'); void result.current.markRead('notice-1'); });
    records = [{ ...notification(), read: true }];
    await act(async () => { pending.resolve({ data: { id: 'notice-1', read: true }, error: null }); await first; });
    expect(mocks.execute.mock.calls.filter(([query]) => query.operation === 'update')).toHaveLength(1);
    expect(result.current.unreadCount).toBe(0);
  });

  it('ignores an old identity mutation failure after switching users', async () => {
    const { result, rerender } = renderHook(({ userId }) => useNotifications(userId, 'buyer'), { initialProps: { userId: 'buyer-1' } });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    const pending = deferred<Result>();
    mocks.execute.mockImplementationOnce(() => pending.promise);
    let write: Promise<void> = Promise.resolve();
    act(() => { write = result.current.deleteNotification('notice-1'); });
    records = [notification('buyer-2-notice', 'buyer-2')];
    rerender({ userId: 'buyer-2' });
    await waitFor(() => expect(result.current.notifications[0]?.id).toBe('buyer-2-notice'));
    await act(async () => { pending.resolve({ data: null, error: { message: 'Old user failure' } }); await write; });
    expect(result.current.error).toBe('');
    expect(result.current.notifications[0].id).toBe('buyer-2-notice');
  });
});
