export const CM_PER_INCH = 2.54;
export const CANONICAL_MEASUREMENT_UNIT = 'in' as const;

export type MeasurementUnit = 'cm' | 'in';

type LegacyShapeTargetProfile = {
  version: 1;
  body: number | null;
  neck: number | null;
  rim: number;
};

export type ShapeTargetProfileV2 = {
  version: 2;
  base: number;
  top: number;
  foot: number;
  body: number | null;
  neck: number | null;
  rim: number | null;
  mouthStart: number | null;
  lipStart?: number;
  // Each band stores its start, peak, end, and the correction toward a straight wall.
  curve: [start: number, peak: number, end: number, straighten: number][];
  limits?: Partial<Record<ShapeControlKey, [min: number, max: number]>>;
};

export type ShapeTargetProfile = LegacyShapeTargetProfile | ShapeTargetProfileV2;
export type ShapeControlKey = 'height' | 'bodyWidth' | 'neckWidth' | 'rimSize' | 'curvature';

export function hasShapeTarget(profile: ShapeTargetProfile | undefined, key: ShapeControlKey): boolean {
  if (!profile) return true;
  if (key === 'bodyWidth') return profile.body !== null;
  if (key === 'neckWidth') return profile.neck !== null;
  if (profile.version === 1) return true;
  if (key === 'height') return profile.top > profile.base;
  if (key === 'rimSize') return profile.rim !== null;
  return profile.curve.length > 0;
}

function isNormalizedHeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function readTargetProfile(profile: ShapeTargetProfile | undefined): ShapeTargetProfile | undefined {
  if (profile?.version === 1 && isNormalizedHeight(profile.rim) && profile.rim >= 0.9
    && (profile.body === null || (isNormalizedHeight(profile.body) && profile.body >= 0.12 && profile.body < profile.rim - 0.06))
    && (profile.neck === null || (profile.body !== null && isNormalizedHeight(profile.neck)
      && profile.neck > profile.body + 0.05 && profile.neck < profile.rim - 0.02))) return { ...profile };
  if (profile?.version !== 2 || !isNormalizedHeight(profile.base) || !isNormalizedHeight(profile.top)
    || !isNormalizedHeight(profile.foot) || profile.base > profile.foot || profile.foot > profile.top
    || (profile.body !== null && (!isNormalizedHeight(profile.body) || profile.body <= profile.foot || profile.body >= profile.top))
    || (profile.neck !== null && (!isNormalizedHeight(profile.neck) || profile.body === null
      || profile.neck <= profile.body || profile.neck >= profile.top))
    || (profile.rim === null ? profile.mouthStart !== null : !isNormalizedHeight(profile.rim)
      || !isNormalizedHeight(profile.mouthStart) || profile.mouthStart >= profile.rim || profile.rim > profile.top
      || profile.mouthStart <= (profile.neck ?? profile.body ?? profile.foot))
    || (profile.lipStart !== undefined && (!isNormalizedHeight(profile.lipStart) || profile.rim === null
      || profile.mouthStart === null || profile.lipStart <= profile.mouthStart || profile.lipStart > profile.rim))
    || !Array.isArray(profile.curve) || profile.curve.length > 2) return undefined;
  const curve: ShapeTargetProfileV2['curve'] = [];
  for (const band of profile.curve) {
    if (!Array.isArray(band) || band.length !== 4) return undefined;
    const [start, peak, end, amount] = band;
    if (!isNormalizedHeight(start) || !isNormalizedHeight(peak) || !isNormalizedHeight(end)
      || start < profile.foot || start >= peak || peak >= end || end > (profile.mouthStart ?? profile.top)
      || !Number.isFinite(amount) || Math.abs(amount) > 0.25) return undefined;
    curve.push([start, peak, end, amount]);
  }
  const limits: ShapeTargetProfileV2['limits'] = {};
  for (const key of [...SHAPE_DIMENSION_KEYS, 'curvature'] as const) {
    const range = profile.limits?.[key];
    if (Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)
      && (key === 'curvature' ? range[0] >= 0 && range[0] <= 50 && range[1] >= 50 && range[1] <= 100
        : range[0] >= 0.5 && range[0] <= 1 && range[1] >= 1 && range[1] <= 1.5)) {
      limits[key] = [range[0], range[1]];
    }
  }
  return { ...profile, curve, ...(Object.keys(limits).length ? { limits } : { limits: undefined }) };
}

export type ShapeParamsInches = {
  height: number;
  bodyWidth: number;
  neckWidth: number;
  rimSize: number;
  curvature: number;
  unit: 'in';
  geometryMode?: 'baseline';
  targetProfile?: ShapeTargetProfile;
  baseline?: Pick<ShapeParamsInches, 'height' | 'bodyWidth' | 'neckWidth' | 'rimSize'>;
};

export function shapeFromModelBase(base: Pick<ShapeParamsInches, 'height' | 'bodyWidth' | 'neckWidth' | 'rimSize'>): ShapeParamsInches {
  const baseline = { height: base.height, bodyWidth: base.bodyWidth, neckWidth: base.neckWidth, rimSize: base.rimSize };
  return { ...baseline, curvature: 50, unit: 'in', geometryMode: 'baseline', baseline };
}

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
  const metadata = input as ShapeParamsInches | null | undefined;
  const withMetadata = next as T & Pick<ShapeParamsInches, 'geometryMode' | 'baseline' | 'targetProfile'>;
  delete withMetadata.targetProfile;
  if (source === 'in' && metadata?.geometryMode === 'baseline' && metadata.baseline
    && SHAPE_DIMENSION_KEYS.every((key) => Number.isFinite(metadata.baseline?.[key]) && metadata.baseline![key] > 0)) {
    withMetadata.geometryMode = 'baseline';
    withMetadata.baseline = { ...metadata.baseline };
    const profile = readTargetProfile(metadata.targetProfile);
    if (profile) withMetadata.targetProfile = profile;
  } else {
    delete withMetadata.geometryMode;
    delete withMetadata.baseline;
  }
  next.unit = CANONICAL_MEASUREMENT_UNIT;
  return next as T & { unit: 'in' };
}
