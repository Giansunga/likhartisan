import type {
  ArtisanOrder,
  ArtisanOrderItem,
  ArtisanProduct,
  OrderStatusDatum,
  SellerDashboardMetrics,
  SellerDateRange,
} from '../../types/artisan';

export type DatePresetKey = 'week' | 'month' | 'three-months' | 'year' | 'all';

const DAY = 86_400_000;

export const DATE_PRESETS: Array<{ key: DatePresetKey; label: string }> = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'three-months', label: 'Last 3 Months' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
];

export function getDatePreset(key: DatePresetKey, now = new Date()): SellerDateRange {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start: Date;
  switch (key) {
    case 'week':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'three-months':
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
      start = new Date(2000, 0, 1);
      break;
  }
  return { start, end, label: DATE_PRESETS.find(item => item.key === key)?.label || 'Custom' };
}

export function isShopItem(item: ArtisanOrderItem, shopId: string, shopName?: string) {
  return item.shop_id === shopId || Boolean(shopName && item.shop_name === shopName);
}

export function shopItems(order: ArtisanOrder, shopId: string, shopName?: string) {
  return Array.isArray(order.items) ? order.items.filter(item => isShopItem(item, shopId, shopName)) : [];
}

export function isPaidOrder(order: ArtisanOrder) {
  const payment = order.payment_status?.toLowerCase();
  const status = order.status?.toLowerCase();
  return payment === 'paid' || status === 'paid' || status === 'completed';
}

export function shopOrderRevenue(order: ArtisanOrder, shopId: string, shopName?: string) {
  if (!isPaidOrder(order)) return 0;
  return shopItems(order, shopId, shopName).reduce((total, item) => {
    const quantity = Number(item.qty ?? item.quantity ?? 1) || 1;
    return total + (Number(item.price) || 0) * quantity;
  }, 0);
}

export function filterShopOrders(orders: ArtisanOrder[], shopId: string, shopName?: string) {
  return orders.filter(order => shopItems(order, shopId, shopName).length > 0);
}

export function inDateRange(order: ArtisanOrder, range: SellerDateRange) {
  const time = new Date(order.created_at).getTime();
  return Number.isFinite(time) && time >= range.start.getTime() && time <= range.end.getTime();
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function buildSellerMetrics(
  orders: ArtisanOrder[],
  products: ArtisanProduct[],
  shopId: string,
  shopName: string | undefined,
  range: SellerDateRange,
): SellerDashboardMetrics {
  const current = filterShopOrders(orders, shopId, shopName).filter(order => inDateRange(order, range));
  const duration = Math.max(DAY, range.end.getTime() - range.start.getTime() + 1);
  const previousRange: SellerDateRange = {
    start: new Date(range.start.getTime() - duration),
    end: new Date(range.start.getTime() - 1),
    label: 'Previous period',
  };
  const previous = filterShopOrders(orders, shopId, shopName).filter(order => inDateRange(order, previousRange));
  const revenue = current.reduce((sum, order) => sum + shopOrderRevenue(order, shopId, shopName), 0);
  const previousRevenue = previous.reduce((sum, order) => sum + shopOrderRevenue(order, shopId, shopName), 0);
  return {
    revenue,
    totalOrders: current.length,
    pendingOrders: current.filter(order => (order.delivery_status || 'pending') === 'pending').length,
    completedOrders: current.filter(order => order.delivery_status === 'completed').length,
    activeListings: products.filter(product => product.status === 'active').length,
    revenueTrend: percentageChange(revenue, previousRevenue),
    ordersTrend: percentageChange(current.length, previous.length),
  };
}

export function buildOrderStatus(orders: ArtisanOrder[]): OrderStatusDatum[] {
  const count = (statuses: string[]) => orders.filter(order => statuses.includes(order.delivery_status || 'pending')).length;
  return [
    { name: 'Pending', value: count(['pending']), color: '#F6B96B' },
    { name: 'Preparing', value: count(['preparing']), color: '#F3C85B' },
    { name: 'Shipped', value: count(['shipped']), color: '#F39739' },
    { name: 'Delivered', value: count(['delivered', 'completed']), color: '#85B45C' },
    { name: 'Cancelled', value: count(['cancelled']), color: '#E66A6A' },
  ];
}

export interface RevenuePoint { label: string; fullLabel: string; revenue: number }

export function buildRevenueSeries(
  orders: ArtisanOrder[],
  shopId: string,
  shopName: string | undefined,
  range: SellerDateRange,
): RevenuePoint[] {
  const filtered = filterShopOrders(orders, shopId, shopName).filter(order => inDateRange(order, range));
  const days = Math.ceil((range.end.getTime() - range.start.getTime()) / DAY);
  const daily = days <= 45;
  const points = new Map<string, RevenuePoint>();
  if (daily) {
    for (let cursor = new Date(range.start); cursor <= range.end; cursor = new Date(cursor.getTime() + DAY)) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      points.set(key, {
        label: cursor.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        fullLabel: cursor.toLocaleDateString(undefined, { dateStyle: 'medium' }),
        revenue: 0,
      });
    }
  } else {
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    while (cursor <= range.end) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
      points.set(key, {
        label: cursor.toLocaleDateString(undefined, { month: 'short', year: range.start.getFullYear() === range.end.getFullYear() ? undefined : '2-digit' }),
        fullLabel: cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        revenue: 0,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }
  for (const order of filtered) {
    const date = new Date(order.created_at);
    const key = daily
      ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      : `${date.getFullYear()}-${date.getMonth()}`;
    const point = points.get(key);
    if (point) point.revenue += shopOrderRevenue(order, shopId, shopName);
  }
  return [...points.values()];
}

export function buildTopProducts(orders: ArtisanOrder[], shopId: string, shopName?: string) {
  const products = new Map<string, { name: string; revenue: number; orders: Set<string> }>();
  for (const order of orders) {
    if (!isPaidOrder(order)) continue;
    for (const item of shopItems(order, shopId, shopName)) {
      const name = item.product_name || item.productName || 'Unknown product';
      const key = item.product_id || name;
      const current = products.get(key) || { name, revenue: 0, orders: new Set<string>() };
      current.revenue += (Number(item.price) || 0) * (Number(item.qty ?? item.quantity ?? 1) || 1);
      current.orders.add(order.id);
      products.set(key, current);
    }
  }
  return [...products.entries()]
    .map(([id, item]) => ({ id, name: item.name, revenue: item.revenue, orders: item.orders.size }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

export function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
