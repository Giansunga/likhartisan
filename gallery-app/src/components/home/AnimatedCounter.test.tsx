import { act, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import AnimatedCounter from './AnimatedCounter';

let reduced = false;
beforeEach(() => {
  vi.useFakeTimers(); reduced = false;
  vi.stubGlobal('IntersectionObserver', undefined);
  // Force the non-observer path used in browsers without this API.
  delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  window.matchMedia = vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('landing exact counters', () => {
  it('shows unknown as a dash and updates from the displayed value without restarting at zero', async () => {
    const { rerender } = render(<AnimatedCounter value={null} />); expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<AnimatedCounter value={104} />); await act(async () => { await vi.advanceTimersByTimeAsync(2800); });
    expect(screen.getByText('104')).toBeInTheDocument();
    rerender(<AnimatedCounter value={90} />); expect(screen.getByText('104')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2800); }); expect(screen.getByText('90')).toBeInTheDocument();
    rerender(<AnimatedCounter value={0} />); await act(async () => { await vi.advanceTimersByTimeAsync(2800); }); expect(screen.getByText('0')).toBeInTheDocument();
  });
  it('honors reduced motion and keeps the heritage suffix explicit', async () => {
    reduced = true; render(<AnimatedCounter value={200} suffix="+" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20); }); expect(screen.getByText('200+')).toBeInTheDocument();
  });
});
