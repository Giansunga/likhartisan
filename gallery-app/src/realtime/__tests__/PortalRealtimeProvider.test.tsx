import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalRealtimeProvider } from '../PortalRealtimeProvider';
import { usePortalRealtimeRefresh } from '../usePortalRealtimeRefresh';

type BroadcastHandler = (message: unknown) => void;
type StatusHandler = (status: string) => void;

const realtimeMock = vi.hoisted(() => {
  const broadcastHandlers = new Map<string, BroadcastHandler>();
  const statusHandlers = new Map<string, StatusHandler>();
  const channels: Array<{ topic: string; config: unknown }> = [];
  const removed: string[] = [];
  const setAuth = vi.fn(async () => undefined);

  return { broadcastHandlers, statusHandlers, channels, removed, setAuth };
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    realtime: { setAuth: realtimeMock.setAuth },
    channel: (topic: string, config: unknown) => {
      realtimeMock.channels.push({ topic, config });
      const channel = {
        topic,
        on: (_kind: string, _filter: unknown, handler: BroadcastHandler) => {
          realtimeMock.broadcastHandlers.set(topic, handler);
          return channel;
        },
        subscribe: (handler: StatusHandler) => {
          realtimeMock.statusHandlers.set(topic, handler);
          return channel;
        },
      };
      return channel;
    },
    removeChannel: vi.fn(async (channel: { topic: string }) => {
      realtimeMock.removed.push(channel.topic);
    }),
  },
}));

function RefreshProbe({ refresh }: { refresh: () => void }) {
  usePortalRealtimeRefresh(['orders'], refresh, 5);
  return null;
}

describe('PortalRealtimeProvider', () => {
  afterEach(() => {
    realtimeMock.broadcastHandlers.clear();
    realtimeMock.statusHandlers.clear();
    realtimeMock.channels.length = 0;
    realtimeMock.removed.length = 0;
    realtimeMock.setAuth.mockClear();
  });

  it('authenticates before joining a private topic and removes it on unmount', async () => {
    const { unmount } = render(
      <PortalRealtimeProvider topics={['admin:portal']}><span>ready</span></PortalRealtimeProvider>,
    );

    await waitFor(() => expect(realtimeMock.channels).toHaveLength(1));
    expect(realtimeMock.setAuth).toHaveBeenCalledOnce();
    expect(realtimeMock.channels[0]).toEqual({
      topic: 'admin:portal',
      config: { config: { private: true } },
    });

    unmount();
    await waitFor(() => expect(realtimeMock.removed).toContain('admin:portal'));
  });

  it('refetches for matching invalidations, reconnects, and window focus', async () => {
    const refresh = vi.fn();
    const { unmount } = render(
      <PortalRealtimeProvider topics={['shop:00000000-0000-4000-8000-000000000001']}>
        <RefreshProbe refresh={refresh} />
      </PortalRealtimeProvider>,
    );

    const topic = 'shop:00000000-0000-4000-8000-000000000001';
    await waitFor(() => expect(realtimeMock.statusHandlers.has(topic)).toBe(true));

    act(() => realtimeMock.statusHandlers.get(topic)?.('SUBSCRIBED'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    refresh.mockClear();

    act(() => realtimeMock.broadcastHandlers.get(topic)?.({
      payload: { table: 'products', operation: 'UPDATE', record_id: 'ignored' },
    }));
    await new Promise(resolve => setTimeout(resolve, 15));
    expect(refresh).not.toHaveBeenCalled();

    act(() => realtimeMock.broadcastHandlers.get(topic)?.({
      payload: { table: 'orders', operation: 'DELETE', record_id: 'order-1' },
    }));
    act(() => realtimeMock.broadcastHandlers.get(topic)?.({
      payload: { table: 'orders', operation: 'UPDATE', record_id: 'order-2' },
    }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    refresh.mockClear();

    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    refresh.mockClear();
    act(() => realtimeMock.broadcastHandlers.get(topic)?.({
      payload: { table: 'orders', operation: 'INSERT', record_id: 'order-3' },
    }));
    unmount();
    await new Promise(resolve => setTimeout(resolve, 15));
    expect(refresh).not.toHaveBeenCalled();
  });
});
