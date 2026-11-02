import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortalRealtimeRefresh } from '../usePortalRealtimeRefresh';
const mocks = vi.hoisted(() => ({ realtime: { connectedEpoch: 1, subscribe: vi.fn(() => () => undefined) }, capture: vi.fn() }));
vi.mock('../PortalRealtimeProvider', () => ({ usePortalRealtime: () => mocks.realtime }));
vi.mock('../../lib/sentry', () => ({ captureException: mocks.capture }));
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.realtime.connectedEpoch = 1; });
afterEach(() => vi.useRealTimers());
describe('portal refresh scheduling', () => {
  it('serializes refreshes across reconnects and refreshes again after completion', async () => {
    let finish!: () => void;
    const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const hook = renderHook(() => usePortalRealtimeRefresh(['orders'], refresh, 10));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(refresh).toHaveBeenCalledTimes(1);
    mocks.realtime.connectedEpoch = 2; hook.rerender();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('captures rejected refreshes and remains usable', async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
    renderHook(() => usePortalRealtimeRefresh(['orders'], refresh, 10));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event('focus')));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('does not run queued work after unmount', async () => {
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const hook = renderHook(() => usePortalRealtimeRefresh(['orders'], refresh, 10));
    await act(() => vi.advanceTimersByTimeAsync(10));
    act(() => window.dispatchEvent(new Event('focus')));
    await act(() => vi.advanceTimersByTimeAsync(10));
    hook.unmount();
    await act(async () => { finish(); });
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
