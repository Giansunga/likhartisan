const FAVORITES_KEY = 'likhartisan_favorites';
import { normalizeCatalogMeasurement, type MeasurementUnit } from './measurements';

export function loadFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: string[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch { /* quota exceeded */ }
}

export function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function mapSupabaseProduct(row: any) {
  const measurementUnit: MeasurementUnit = row.measurement_unit === 'in' ? 'in' : 'cm';
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    category: row.category || '',
    price: row.price || 0,
    stock: row.stock || 0,
    inStock: (row.stock || 0) > 0,
    image: row.image || '',
    model3d: row.model3d || undefined,
    materials: row.materials || '',
    dimensions: normalizeCatalogMeasurement(row.dimensions, measurementUnit),
    height: normalizeCatalogMeasurement(row.height, measurementUnit),
    openingDiameter: normalizeCatalogMeasurement(row.opening_diameter, measurementUnit),
    measurementUnit: 'in' as const,
    technique: row.technique || '',
    shopId: row.shop_id || '',
    shopName: row.shop_name || '',
    status: row.status || 'active',
    views: row.views || 0,
    ratingAvg: row.rating_avg || 0,
    ratingCount: row.rating_count || 0,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    productWeightG: row.product_weight_g == null ? undefined : Number(row.product_weight_g),
    packagingWeightG: row.packaging_weight_g == null ? undefined : Number(row.packaging_weight_g),
    shippingWeightG: row.shipping_weight_g == null ? undefined : Number(row.shipping_weight_g),
    shippingLengthIn: row.shipping_length_in == null ? undefined : Number(row.shipping_length_in),
    shippingWidthIn: row.shipping_width_in == null ? undefined : Number(row.shipping_width_in),
    shippingHeightIn: row.shipping_height_in == null ? undefined : Number(row.shipping_height_in),
  };
}

export function fmtRating(r: number) {
  return r.toFixed(1);
}

export function formatVariation(v: { dimensions?: string; height?: string; openingDiameter?: string; measurementUnit?: MeasurementUnit } | null | undefined): string {
  if (!v) return '';
  const sourceUnit = v.measurementUnit || 'cm';
  if (v.dimensions && v.dimensions !== 'N/A') return normalizeCatalogMeasurement(v.dimensions, sourceUnit);
  const parts: string[] = [];
  if (v.height && v.height !== 'N/A') parts.push(normalizeCatalogMeasurement(v.height, sourceUnit));
  if (v.openingDiameter && v.openingDiameter !== 'N/A') parts.push(normalizeCatalogMeasurement(v.openingDiameter, sourceUnit));
  return parts.join(' \u2022 ');
}

export function displayVariation(raw: string): string {
  if (!raw) return '';
  const first = raw.includes(' \u2022 ') ? raw.split(' \u2022 ')[0] : raw;
  return normalizeCatalogMeasurement(first, 'cm');
}
