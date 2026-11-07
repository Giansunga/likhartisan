import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUYER_INBOX_CHANGED_EVENT, useBuyerUnreadMessages } from '../useBuyerUnreadMessages';

const mocks = vi.hoisted(() => ({
  eq: vi.fn().mockReturnThis(),
  fetch: vi.fn(),
  on: vi.fn<(type: string, filter: object, callback: () => void) => unknown>().mockReturnThis(),
  removeChannel: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: mocks.eq,
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: mocks.fetch,
    }),
    channel: () => ({ on: mocks.on, subscribe: vi.fn().mockReturnThis() }),
    removeChannel: mocks.removeChannel,
  },
}));

function unreadRows(...counts: number[]) {
  return { data: counts.map(buyer_unread => ({ buyer_unread })), error: null };
}

describe('buyer unread messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockReset().mockResolvedValue(unreadRows(2, 3));
  });

  it('totals unread messages and refreshes on incoming changes and read updates', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ buyerId }: { buyerId?: string }) => useBuyerUnreadMessages(buyerId),
      { initialProps: {} },
    );
    expect(result.current).toBe(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
    rerender({ buyerId: 'buyer-a' });
    await waitFor(() => expect(result.current).toBe(5));
    expect(mocks.eq).toHaveBeenCalledWith('buyer_id', 'buyer-a');
    expect(mocks.on).toHaveBeenCalledWith('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'conversations', filter: 'buyer_id=eq.buyer-a',
    }, expect.any(Function));

    mocks.fetch.mockResolvedValue(unreadRows(2, 4));
    act(() => mocks.on.mock.calls[1][2]());
    await waitFor(() => expect(result.current).toBe(6));
    mocks.fetch.mockResolvedValue(unreadRows());
    act(() => { window.dispatchEvent(new Event(BUYER_INBOX_CHANGED_EVENT)); });
    await waitFor(() => expect(result.current).toBe(0));
    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledOnce();
  });

  it('hides the previous buyer count and ignores a late response after switching accounts', async () => {
    const { result, rerender } = renderHook(({ buyerId }) => useBuyerUnreadMessages(buyerId), {
      initialProps: { buyerId: 'buyer-a' },
    });
    await waitFor(() => expect(result.current).toBe(5));

    let finishOldRead!: (rows: ReturnType<typeof unreadRows>) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(resolve => { finishOldRead = resolve; }));
    act(() => mocks.on.mock.calls[1][2]());
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    mocks.fetch.mockResolvedValue(unreadRows(1));
    rerender({ buyerId: 'buyer-b' });
    expect(result.current).toBe(0);
    await waitFor(() => expect(result.current).toBe(1));
    await act(async () => { finishOldRead(unreadRows(10)); });
    expect(result.current).toBe(1);
  });
});
