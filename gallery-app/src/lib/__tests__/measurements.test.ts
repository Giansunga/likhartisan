import { describe, expect, it } from 'vitest';
import {
  cmToInches,
  inchesToCm,
  normalizeCatalogMeasurement,
  normalizeShapeParams,
  parseDimensionToInches,
} from '../measurements';

describe('measurement conversions', () => {
  it.each([
    [2.54, 1],
    [5.08, 2],
    [10, 3.937007874],
    [20, 7.874015748],
    [25.4, 10],
    [50.8, 20],
  ])('converts %s cm to inches', (centimeters, inches) => {
    expect(cmToInches(centimeters)).toBeCloseTo(inches, 8);
    expect(inchesToCm(cmToInches(centimeters))).toBeCloseTo(centimeters, 8);
  });

  it('normalizes legacy catalog text to labelled inches', () => {
    expect(normalizeCatalogMeasurement('20 x 10 cm', 'cm')).toBe('7.87 in x 3.94 in');
    expect(normalizeCatalogMeasurement('Height 20', 'cm')).toBe('Height 7.87 in');
    expect(normalizeCatalogMeasurement('10 × 5 in', 'in')).toBe('10.00 in × 5.00 in');
  });

  it('parses dimensions after normalization', () => {
    expect(parseDimensionToInches('2.54 cm')).toBeCloseTo(1, 8);
    expect(parseDimensionToInches('1 in')).toBe(1);
    expect(parseDimensionToInches('8', 'in')).toBe(8);
  });

  it('normalizes legacy shape values while preserving curvature', () => {
    const shape = normalizeShapeParams({ height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 });
    expect(shape.unit).toBe('in');
    expect(shape.height).toBeCloseTo(25 / 2.54, 8);
    expect(shape.bodyWidth).toBeCloseTo(20 / 2.54, 8);
    expect(shape.curvature).toBe(50);
  });
});
