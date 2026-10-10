export interface CatalogVariation {
  product_id: string;
  price: number | string | null;
  stock: number | string | null;
}

export function validCatalogPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function summarizeCatalogVariations(rows: CatalogVariation[]) {
  const groups: Record<string, CatalogVariation[]> = {};
  for (const row of rows) (groups[row.product_id] ??= []).push(row);
  const prices: Record<string, number> = {};
  const availability: Record<string, boolean> = {};
  for (const [id, variations] of Object.entries(groups)) {
    const available = variations.filter(row => Number(row.stock) > 0);
    availability[id] = available.length > 0;
    const candidates = (available.length ? available : variations)
      .map(row => validCatalogPrice(row.price)).filter((price): price is number => price !== null);
    if (candidates.length) prices[id] = Math.min(...candidates);
  }
  return { prices, availability };
}

export function catalogDisplayPrice(product: { price: unknown; catalogPrice?: number | null }, variationPrice?: number) {
  return validCatalogPrice(variationPrice ?? (product.catalogPrice !== undefined ? product.catalogPrice : product.price));
}
