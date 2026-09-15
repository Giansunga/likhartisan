export const CM_PER_INCH = 2.54;
export const CANONICAL_MEASUREMENT_UNIT = 'in' as const;

export type MeasurementUnit = 'cm' | 'in';

export type ShapeParamsInches = {
  height: number;
  bodyWidth: number;
  neckWidth: number;
  rimSize: number;
  curvature: number;
  unit: 'in';
};

export const DEFAULT_SHAPE_PARAMS_IN: ShapeParamsInches = Object.freeze({
  // These preserve the previous default geometry: 25, 20, 15, and 12 cm.
  height: 25 / CM_PER_INCH,
  bodyWidth: 20 / CM_PER_INCH,
  neckWidth: 15 / CM_PER_INCH,
  rimSize: 12 / CM_PER_INCH,
  curvature: 50,
  unit: CANONICAL_MEASUREMENT_UNIT,
});

const SHAPE_DIMENSION_KEYS = ['height', 'bodyWidth', 'neckWidth', 'rimSize'] as const;
const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;
const UNIT_AFTER_NUMBER_PATTERN = /\s*(cm|centimeters?|in|inches?)\b|\s*(")/i;

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function cmToInches(value: number): number {
  return finiteNumber(value) / CM_PER_INCH;
}

export function inchesToCm(value: number): number {
  return finiteNumber(value) * CM_PER_INCH;
}

export function roundMeasurement(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((finiteNumber(value) + Number.EPSILON) * factor) / factor;
}

export function formatInches(value: unknown, decimals = 2): string {
  return `${finiteNumber(value).toFixed(decimals)} in`;
}

export function parseDimensionToInches(value: unknown, sourceUnit: MeasurementUnit = CANONICAL_MEASUREMENT_UNIT): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const match = raw.match(/(-?\d+(?:\.\d+)?)\s*(cm|centimeters?|in|inches?)\b|(-?\d+(?:\.\d+)?)\s*(")/i);
  const amount = Number(match?.[1] ?? match?.[3] ?? match?.[5] ?? Number.parseFloat(raw));
  if (!Number.isFinite(amount)) return 0;
  const unit: MeasurementUnit = match?.[2]?.toLowerCase().startsWith('cm')
    ? 'cm'
    : (match?.[2] || match?.[4])
      ? 'in'
      : sourceUnit;
  return unit === 'cm' ? cmToInches(amount) : amount;
}

/**
 * Converts a catalog's free-form dimension text to a consistently labelled
 * inch string. Existing rows are treated as centimeters unless their row
 * metadata says otherwise. Every numeric token is labelled so compound
 * values such as "20 x 10 cm" remain unambiguous after conversion.
 */
export function normalizeCatalogMeasurement(value: unknown, sourceUnit: MeasurementUnit = 'cm'): string {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw || /^n\/a$/i.test(raw)) return raw;

  const hasCentimeters = /\bcm|centimeters?\b/i.test(raw);
  const hasInches = /\bin(?:ches)?\b|"/i.test(raw);
  const defaultUnit: MeasurementUnit = hasCentimeters ? 'cm' : hasInches ? 'in' : sourceUnit;

  const normalized = raw.replace(NUMBER_PATTERN, (token, offset: number, full: string) => {
    const trailing = full.slice(offset + token.length).match(UNIT_AFTER_NUMBER_PATTERN);
    const localUnit: MeasurementUnit = trailing?.[1]?.toLowerCase().startsWith('cm') ? 'cm' : trailing?.[1] || trailing?.[2] ? 'in' : defaultUnit;
    const amount = Number(token);
    const inches = localUnit === 'cm' ? cmToInches(amount) : amount;
    return `${finiteNumber(inches).toFixed(2)} __IN__`;
  });

  return normalized
    .replace(/\s*(?:centimeters?|cm|inches?|in)\b/gi, '')
    .replace(/\s*"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/__IN__/g, 'in');
}

export function normalizeShapeParams<T extends { height: number; bodyWidth: number; neckWidth: number; rimSize: number; curvature: number }>(
  input: Partial<T> & { unit?: unknown } | null | undefined,
  fallback: T = DEFAULT_SHAPE_PARAMS_IN as unknown as T,
  legacyUnit: MeasurementUnit = 'cm',
): T & { unit: 'in' } {
  const source = input?.unit === 'in' || input?.unit === 'cm' ? input.unit : legacyUnit;
  const next = { ...fallback, ...(input || {}) } as T & { unit?: unknown };
  for (const key of SHAPE_DIMENSION_KEYS) {
    const raw = finiteNumber(next[key]);
    next[key] = (source === 'cm' ? cmToInches(raw) : raw) as T[typeof key];
  }
  next.curvature = finiteNumber(next.curvature) as T['curvature'];
  next.unit = CANONICAL_MEASUREMENT_UNIT;
  return next as T & { unit: 'in' };
}
