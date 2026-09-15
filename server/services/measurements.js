export const CM_PER_INCH = 2.54;

export function cmToInches(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount / CM_PER_INCH : 0;
}

export function formatInches(value) {
  const amount = Number(value);
  return `${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} in`;
}

export function normalizeCatalogMeasurement(value, sourceUnit = 'cm') {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw || /^n\/a$/i.test(raw)) return raw;
  const hasCentimeters = /\bcm|centimeters?\b/i.test(raw);
  const hasInches = /\bin(?:ches)?\b|"/i.test(raw);
  const defaultUnit = hasCentimeters ? 'cm' : hasInches ? 'in' : sourceUnit === 'in' ? 'in' : 'cm';
  const normalized = raw.replace(/-?\d+(?:\.\d+)?/g, (token, offset, full) => {
    const trailing = full.slice(offset + token.length).match(/\s*(cm|centimeters?|in|inches?)\b|\s*(")/i);
    const localUnit = trailing?.[1]?.toLowerCase().startsWith('cm') ? 'cm' : (trailing?.[1] || trailing?.[2] ? 'in' : defaultUnit);
    return `${formatInches(localUnit === 'cm' ? cmToInches(token) : token)} __IN__`;
  });
  return normalized
    .replace(/\s*(?:centimeters?|cm|inches?|in)\b/gi, '')
    .replace(/\s*"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/__IN__/g, 'in');
}
