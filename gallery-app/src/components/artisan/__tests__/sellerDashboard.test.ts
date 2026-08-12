import { describe, expect, it } from 'vitest';
import type { ArtisanOrder, ArtisanProduct, SellerDateRange } from '../../../types/artisan';
import {
  buildOrderStatus,
  buildRevenueSeries,
  buildSellerMetrics,
  buildTopProducts,
  filterShopOrders,
  getDatePreset,
  shopOrderRevenue,
} from '../sellerDashboard';

const range: SellerDateRange = {
  start: new Date('2026-08-01T00:00:00'),
  end: new Date('2026-08-10T23:59:59'),
  label: 'Custom Range',
};

const orders: ArtisanOrder[] = [
  {
    id: 'order-1',
    created_at: '2026-08-05T10:00:00Z',
    status: 'paid',
    payment_status: 'Paid',
    delivery_status: 'pending',
    subtotal: 900,
    items: [
      { product_id: 'pot-1', product_name: 'Clay Pot', shop_id: 'shop-a', price: 100, qty: 2 },
      { product_id: 'other', product_name: 'Other Shop Item', shop_id: 'shop-b', price: 700, qty: 1 },
    ],
  },
  {
    id: 'order-2',
    created_at: '2026-08-06T10:00:00Z',
    status: 'completed',
    delivery_status: 'completed',
    items: [{ product_id: 'pot-1', product_name: 'Clay Pot', shop_id: 'shop-a', price: 150, qty: 1 }],
  },
  {
    id: 'order-previous',
    created_at: '2026-07-25T10:00:00Z',
    status: 'paid',
    delivery_status: 'shipped',
    items: [{ product_id: 'pot-2', product_name: 'Vase', shop_id: 'shop-a', price: 100, qty: 1 }],
  },
];

const products: ArtisanProduct[] = [
  { id: 'pot-1', name: 'Clay Pot', description: '', category: 'Pots', price: 100, stock: 4, image: '', materials: '', dimensions: '', shop_id: 'shop-a', shop_name: 'A', status: 'active', views: 0, created_at: '2026-08-01' },
  { id: 'pot-2', name: 'Vase', description: '', category: 'Vases', price: 100, stock: 0, image: '', materials: '', dimensions: '', shop_id: 'shop-a', shop_name: 'A', status: 'archived', views: 0, created_at: '2026-08-01' },
];

describe('seller dashboard analytics', () => {
  it('counts only orders and line-item revenue belonging to the seller', () => {
    expect(filterShopOrders(orders, 'shop-a')).toHaveLength(3);
    expect(shopOrderRevenue(orders[0], 'shop-a')).toBe(200);
    const metrics = buildSellerMetrics(orders, products, 'shop-a', 'A', range);
    expect(metrics.revenue).toBe(350);
    expect(metrics.totalOrders).toBe(2);
    expect(metrics.pendingOrders).toBe(1);
    expect(metrics.completedOrders).toBe(1);
    expect(metrics.activeListings).toBe(1);
  });

  it('combines delivered and completed orders in the delivered chart segment', () => {
    const status = buildOrderStatus([
      ...orders,
      { id: 'delivered', created_at: '2026-08-07', delivery_status: 'delivered', items: [] },
    ]);
    expect(status.find(item => item.name === 'Delivered')?.value).toBe(2);
  });

  it('ranks products by seller revenue and unique order count', () => {
    const top = buildTopProducts(orders, 'shop-a');
    expect(top[0]).toMatchObject({ id: 'pot-1', name: 'Clay Pot', revenue: 350, orders: 2 });
  });

  it('builds daily chart points for short date ranges', () => {
    const series = buildRevenueSeries(orders, 'shop-a', 'A', range);
    expect(series).toHaveLength(10);
    expect(series.reduce((sum, point) => sum + point.revenue, 0)).toBe(350);
  });

  it('produces stable preset boundaries', () => {
    const preset = getDatePreset('month', new Date('2026-08-10T12:00:00'));
    expect(preset.start).toEqual(new Date(2026, 7, 1));
    expect(preset.end.getDate()).toBe(10);
    expect(preset.label).toBe('This Month');
  });
});
