import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotifications } from '../useNotifications';

const channelTopics: string[] = [];
const channels = new Map<string, { subscribed: boolean }>();

vi.mock('../../lib/supabase', () => {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    then: (resolve: (value: { data: unknown[]; error: null; count: number }) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
  };

  return {
    supabase: {
      from: () => query,
      channel: (topic: string) => {
        channelTopics.push(topic);
        const state = channels.get(topic) || { subscribed: false };
        channels.set(topic, state);
        const channel = {
          on: () => {
            if (state.subscribed) throw new Error(`cannot add callbacks for ${topic} after subscribe()`);
            return channel;
          },
          subscribe: () => {
            state.subscribed = true;
            return channel;
          },
        };
        return channel;
      },
      // Deliberately leave the channel registered to reproduce the async
      // cleanup race that previously crashed the page in StrictMode.
      removeChannel: vi.fn(async () => 'ok'),
    },
  };
});

describe('useNotifications realtime channel', () => {
  beforeEach(() => {
    channelTopics.length = 0;
    channels.clear();
  });

  it('uses a fresh topic when StrictMode replaces the subscription effect', () => {
    const { unmount } = renderHook(() => useNotifications('buyer-1', 'buyer', 10), {
      wrapper: StrictMode,
    });

    expect(channelTopics).toHaveLength(2);
    expect(new Set(channelTopics).size).toBe(2);
    unmount();
  });
});
