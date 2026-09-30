import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  channel: null as null | {
    subscribed: boolean;
    sync: () => void;
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    presenceState: ReturnType<typeof vi.fn>;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
  },
  created: 0,
  removed: 0,
  removalGate: null as Promise<void> | null,
  presences: {} as Record<string, Array<{ user_id: string }>>,
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      if (mock.channel) return mock.channel;
      let onSync = () => {};
      const channel = {
        subscribed: false,
        sync: () => onSync(),
        on: vi.fn((_type: string, _filter: unknown, callback: () => void) => {
          if (channel.subscribed) throw new Error('cannot add `presence` callbacks after `subscribe()`.');
          onSync = callback;
          return channel;
        }),
        subscribe: vi.fn((callback: (status: string) => void) => {
          channel.subscribed = true;
          callback('SUBSCRIBED');
          return channel;
        }),
        presenceState: vi.fn(() => mock.presences),
        track: vi.fn(async () => 'ok'),
        untrack: vi.fn(async () => 'ok'),
      };
      mock.channel = channel;
      mock.created++;
      return channel;
    }),
    removeChannel: vi.fn(async () => {
      mock.removed++;
      await mock.removalGate;
      mock.channel = null;
      return 'ok';
    }),
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  mock.channel = null;
  mock.created = 0;
  mock.removed = 0;
  mock.removalGate = null;
  mock.presences = {};
});

afterEach(() => vi.useRealTimers());

describe('buyer presence subscription', () => {
  it('survives an immediate React effect remount without adding callbacks after subscribe', async () => {
    const { listenToBuyerPresence } = await import('../buyerPresence');
    const first = vi.fn();
    const stopFirst = listenToBuyerPresence(first);
    const channel = mock.channel!;
    mock.presences = { buyer: [{ user_id: 'buyer-1' }] };
    channel.sync();
    expect(first).toHaveBeenLastCalledWith({ 'buyer-1': true });

    stopFirst();
    const second = vi.fn();
    const stopSecond = listenToBuyerPresence(second);
    expect(mock.created).toBe(1);
    expect(channel.on).toHaveBeenCalledTimes(1);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith({ 'buyer-1': true });
    vi.runOnlyPendingTimers();
    expect(mock.removed).toBe(0);

    stopSecond();
    vi.runOnlyPendingTimers();
    await vi.waitFor(() => expect(mock.removed).toBe(1));
  });

  it('shares the same channel for buyer tracking and seller listening', async () => {
    const { listenToBuyerPresence, trackBuyerPresence } = await import('../buyerPresence');
    const stopListening = listenToBuyerPresence(vi.fn());
    const channel = mock.channel!;
    const stopTracking = trackBuyerPresence('buyer-1');
    expect(mock.created).toBe(1);
    expect(channel.track).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'buyer-1' }));

    stopTracking();
    expect(channel.untrack).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(channel.untrack).toHaveBeenCalledTimes(1);
    stopListening();
    vi.runOnlyPendingTimers();
    await vi.waitFor(() => expect(mock.removed).toBe(1));
  });

  it('does not briefly mark a buyer offline during an immediate remount', async () => {
    const { listenToBuyerPresence, trackBuyerPresence } = await import('../buyerPresence');
    const stopListening = listenToBuyerPresence(vi.fn());
    const stopFirst = trackBuyerPresence('buyer-1');
    const channel = mock.channel!;
    stopFirst();
    const stopSecond = trackBuyerPresence('buyer-1');
    vi.runOnlyPendingTimers();
    expect(channel.untrack).not.toHaveBeenCalled();
    stopSecond();
    vi.runOnlyPendingTimers();
    expect(channel.untrack).toHaveBeenCalledTimes(1);
    stopListening();
  });

  it('waits for an in-flight channel removal before subscribing again', async () => {
    let finishRemoval = () => {};
    mock.removalGate = new Promise<void>(resolve => { finishRemoval = resolve; });
    const { listenToBuyerPresence } = await import('../buyerPresence');
    const stop = listenToBuyerPresence(vi.fn());
    stop();
    vi.runOnlyPendingTimers();
    expect(mock.removed).toBe(1);

    const stopAgain = listenToBuyerPresence(vi.fn());
    expect(mock.created).toBe(1);
    finishRemoval();
    mock.removalGate = null;
    await vi.waitFor(() => expect(mock.created).toBe(2));
    stopAgain();
    vi.runOnlyPendingTimers();
    await vi.waitFor(() => expect(mock.removed).toBe(2));
  });
});
