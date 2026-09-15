export function kgToGrams(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null;
  const kilograms = Number(value);
  if (!Number.isFinite(kilograms) || kilograms < 0) return null;
  const grams = Math.round(kilograms * 1000);
  return grams >= 0 ? grams : null;
}

export function positiveInches(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null;
  const inches = Number(value);
  return Number.isFinite(inches) && inches > 0 ? inches : null;
}

