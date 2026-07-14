export function fmt(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export function fmtRating(r: number): string {
  return r.toFixed(1);
}

export function displayVariation(raw: string): string {
  return raw.replace(/"/g, '');
}

export function mapSupabaseProduct(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    category: row.category || '',
    price: row.price ?? 0,
    stock: row.stock ?? 0,
    inStock: (row.stock ?? 0) > 0,
    image: row.image || '',
    model3d: row.model3d || undefined,
    materials: row.materials || '',
    dimensions: row.dimensions || '',
    height: row.height || '',
    openingDiameter: row.opening_diameter || '',
    technique: row.technique || '',
    shopId: row.shop_id || '',
    shopName: row.shop_name || '',
    status: row.status || 'active',
    views: row.views ?? 0,
    ratingAvg: row.rating_avg ?? 0,
    ratingCount: row.rating_count ?? 0,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}
