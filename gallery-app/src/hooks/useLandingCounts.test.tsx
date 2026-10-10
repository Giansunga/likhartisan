import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useLandingCounts } from './useLandingCounts';

const mocks = vi.hoisted(() => ({
  counts: { artisans: 19, products: 104 }, fail: false,
  channels: [] as { name: string; handlers: (() => void)[]; status?: (status: string) => void }[],
  from: vi.fn(), removeChannel: vi.fn(), select: vi.fn(), eq: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: {
  from: mocks.from,
  channel: (name: string) => {
    const channel = { name, handlers: [] as (() => void)[], status: undefined as undefined | ((status: string) => void),
      on: (_event: string, _filter: unknown, handler: () => void) => { channel.handlers.push(handler); return channel; },
      subscribe: (callback: (status: string) => void) => { channel.status = callback; return channel; },
    };
    mocks.channels.push(channel);
    return channel;
  },
  removeChannel: mocks.removeChannel,
} }));

async function flush() { await act(async () => { await Promise.resolve(); }); }
async function advance() { await act(async () => { await vi.advanceTimersByTimeAsync(200); }); }

describe('landing live counts', () => {
  beforeEach(() => {
    vi.useFakeTimers(); mocks.channels = []; mocks.fail = false;
    mocks.counts = { artisans: 19, products: 104 }; vi.clearAllMocks();
    mocks.from.mockImplementation((table: keyof typeof mocks.counts) => {
      const response = { count: mocks.counts[table], error: mocks.fail ? new Error('Offline') : null };
      const query = { select: (...args: unknown[]) => { mocks.select(...args); return query; }, eq: (...args: unknown[]) => { mocks.eq(...args); return query; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve) };
      return query;
    });
  });
  afterEach(() => vi.useRealTimers());

  it('starts unknown, requests exact public counts and filters active listings only', async () => {
    const { result } = renderHook(useLandingCounts);
    expect(result.current).toEqual({ artisanCount: null, potteryCount: null });
    await flush();
    expect(result.current).toEqual({ artisanCount: 19, potteryCount: 104 });
    expect(mocks.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(mocks.eq).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith('status', 'active');
  });
  it('debounces inserts, updates and deletes and preserves decreases and zero', async () => {
    const { result } = renderHook(useLandingCounts); await flush();
    mocks.counts = { artisans: 20, products: 105 };
    act(() => { for (let i = 0; i < 5; i++) mocks.channels[0].handlers[1](); });
    expect(mocks.from).toHaveBeenCalledTimes(2); await advance();
    expect(mocks.from).toHaveBeenCalledTimes(4);
    expect(result.current.potteryCount).toBe(105);
    mocks.counts = { artisans: 0, products: 0 };
    act(() => mocks.channels[0].handlers[0]()); await advance();
    expect(result.current).toEqual({ artisanCount: 0, potteryCount: 0 });
  });
  it('preserves last good values after errors and recovers on reconnect, focus and visibility', async () => {
    mocks.fail = true;
    const { result } = renderHook(useLandingCounts); await flush();
    expect(result.current.artisanCount).toBeNull();
    mocks.fail = false; act(() => mocks.channels[0].status?.('SUBSCRIBED')); await advance();
    expect(result.current.artisanCount).toBe(19);
    mocks.fail = true; act(() => window.dispatchEvent(new Event('focus'))); await advance();
    expect(result.current.artisanCount).toBe(19);
    mocks.fail = false; mocks.counts.artisans = 21;
    act(() => document.dispatchEvent(new Event('visibilitychange'))); await advance();
    expect(result.current.artisanCount).toBe(21);
  });
  it('ignores stale requests and cleans pending work and channels across StrictMode remounts', async () => {
    const { result, unmount } = renderHook(useLandingCounts, { wrapper: StrictMode }); await flush();
    expect(new Set(mocks.channels.map(channel => channel.name)).size).toBe(2);
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
    let resolveOld: (value: unknown) => void = () => {};
    mocks.from.mockImplementationOnce(() => ({ select: () => new Promise(resolve => { resolveOld = resolve; }) }));
    act(() => window.dispatchEvent(new Event('focus'))); await advance();
    mocks.counts = { artisans: 30, products: 200 };
    act(() => mocks.channels[1].handlers[0]()); await advance();
    await act(async () => resolveOld({ count: 1, error: null }));
    expect(result.current.artisanCount).toBe(30);
    act(() => mocks.channels[1].handlers[0]());
    unmount(); const requests = mocks.from.mock.calls.length;
    await advance(); act(() => window.dispatchEvent(new Event('focus')));
    expect(mocks.from).toHaveBeenCalledTimes(requests);
    expect(mocks.removeChannel).toHaveBeenCalledTimes(2);
  });
});
