import { describe, expect, it } from 'vitest';
import { calculateVisualViewportBottomOffset } from '../useVisualViewportBottomOffset';

describe('calculateVisualViewportBottomOffset', () => {
  it('returns zero when the visual and layout viewport share a bottom edge', () => {
    expect(calculateVisualViewportBottomOffset(720, 720, 0)).toBe(0);
    expect(calculateVisualViewportBottomOffset(760, 720, 40)).toBe(0);
  });

  it('moves fixed navigation above browser chrome after a reload', () => {
    expect(calculateVisualViewportBottomOffset(761, 720, 0)).toBe(41);
  });

  it('handles a reduced visual viewport such as an open keyboard', () => {
    expect(calculateVisualViewportBottomOffset(720, 360, 0)).toBe(360);
  });

  it('clamps negative and invalid measurements to zero', () => {
    expect(calculateVisualViewportBottomOffset(700, 720, 0)).toBe(0);
    expect(calculateVisualViewportBottomOffset(720, Number.NaN, 0)).toBe(0);
    expect(calculateVisualViewportBottomOffset(720, null, 0)).toBe(0);
  });
});
