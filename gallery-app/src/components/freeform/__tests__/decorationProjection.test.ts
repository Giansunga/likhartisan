import { describe, expect, it } from 'vitest';
import { createPatternSvg } from '../decor';
import { getDecorationProjection } from '../decorationProjection';

describe('decoration projection', () => {
  const bounds = { minY: -5, rangeY: 10, centerY: 0 };

  it('tracks the full deformed height of a resized pot', () => {
    expect(getDecorationProjection(bounds, 1.8, 20, 1)).toEqual({
      minY: -9,
      height: 18,
      repeat: 4,
    });
  });

  it('extends the pattern around wider pots while respecting pattern size', () => {
    expect(getDecorationProjection(bounds, 1, 40, 1).repeat).toBe(8);
    expect(getDecorationProjection(bounds, 1, 40, 1.6).repeat).toBe(5);
  });

  it('keeps upper, middle, and lower placements in distinct relative bands', () => {
    const upper = createPatternSvg('floral', '#123456', 'upper');
    const middle = createPatternSvg('floral', '#123456', 'middle');
    const lower = createPatternSvg('floral', '#123456', 'lower');

    expect(upper).toContain('translate(0 174)');
    expect(middle).toContain('translate(0 100)');
    expect(lower).toContain('translate(0 26)');
  });

  it('fills full wrap with rows from top to bottom', () => {
    const full = createPatternSvg('floral', '#123456', 'full');
    expect(full.match(/translate\(0 (6|72|138|204)\)/g)).toHaveLength(4);
  });
});
