import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { normalizeProductCategory } from '../../lib/utils';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';
import { getErrorMessage } from '../../lib/portalErrors';
import type { OrderItem } from '../../types';
import StatCard from '../../components/admin/dashboard/StatCard';
import RevenueChart from '../../components/admin/dashboard/RevenueChart';
import OrderStatusChart from '../../components/admin/dashboard/OrderStatusChart';
import RecentOrdersTable from '../../components/admin/dashboard/RecentOrdersTable';
import RecentProductsTable from '../../components/admin/dashboard/RecentProductsTable';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type DateRangeKey = 'this_month' | 'last_30' | 'this_quarter' | 'this_year' | 'all';
type RevenuePeriod = 'monthly' | 'quarterly' | 'yearly';

const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_30', label: 'Last 30 Days' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
];

interface DashboardOrder {
  id: string; user_name: string; total: number; status: string; delivery_status?: string;
  payment_status?: string; created_at: string; items?: OrderItem[];
}
interface DashboardProduct {
  id: string; name: string; image: string; shop_name: string; category: string;
  status: string; created_at: string; price: number;
}
interface DashboardShop { id: string; name: string; created_at: string }
interface DashboardData { orders: DashboardOrder[]; products: DashboardProduct[]; shops: DashboardShop[] }

function amount(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isPaidOrder(o: DashboardOrder) {
  return o.payment_status === 'paid' || o.status === 'paid' || o.status === 'completed';
}

function monthKeyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getDateRange(range: DateRangeKey): { start: Date | null; end: Date | null; label: string } {
  const now = new Date();
  switch (range) {
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1), label: `${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}` };
    case 'last_30':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30), end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), label: 'Last 30 Days' };
    case 'this_quarter': {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      return { start: new Date(now.getFullYear(), qStart, 1), end: new Date(now.getFullYear(), qStart + 3, 1), label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}` };
    }
    case 'this_year':
      return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1), label: `${now.getFullYear()}` };
    case 'all':
      return { start: null, end: null, label: 'All Time' };
  }
}

function inRange(d: string | Date, start: Date | null, end: Date | null) {
  if (!start && !end) return true;
  const t = new Date(d).getTime();
  if (start && t < start.getTime()) return false;
  if (end && t >= end.getTime()) return false;
  return true;
}

function rollingMonths(n: number) {
  const now = new Date();
  const items: { month: string; label: string; fullLabel: string; key: string; year: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKeyOf(d);
    const year = d.getFullYear();
    items.push({
      month: MONTH_SHORT[d.getMonth()],
      label: MONTH_SHORT[d.getMonth()],
      fullLabel: `${MONTH_FULL[d.getMonth()]} ${year}`,
      key,
      year,
    });
  }
  return items;
}

function buildRevenueData(orders: DashboardOrder[], period: RevenuePeriod) {
  const paidOrders = orders.filter(isPaidOrder);
  if (period === 'monthly') {
    const months = rollingMonths(12);
    const map: Record<string, number> = {};
    paidOrders.forEach((o: DashboardOrder) => {
      const key = monthKeyOf(new Date(o.created_at));
      map[key] = (map[key] || 0) + amount(o.total);
    });
    return months.map(m => ({ label: m.label, fullLabel: m.fullLabel, value: map[m.key] || 0, key: m.key, year: m.year }));
  }
  if (period === 'quarterly') {
    const now = new Date();
    const quarters: { label: string; fullLabel: string; start: Date; end: Date }[] = [];
    for (let i = 3; i >= 0; i--) {
      const qYear = now.getFullYear();
      const qMonth = Math.floor(now.getMonth() / 3) * 3 - i * 3;
      const d = new Date(qYear, qMonth, 1);
      const qNum = Math.floor(d.getMonth() / 3) + 1;
      quarters.push({
        label: `Q${qNum}`,
        fullLabel: `Q${qNum} ${d.getFullYear()}`,
        start: new Date(d.getFullYear(), qNum * 3 - 3, 1),
        end: new Date(d.getFullYear(), qNum * 3, 1),
      });
    }
    return quarters.map(q => ({
      label: q.label,
      fullLabel: q.fullLabel,
      value: paidOrders.filter((o: DashboardOrder) => inRange(o.created_at, q.start, q.end)).reduce((s: number, o: DashboardOrder) => s + amount(o.total), 0),
      key: q.label,
      year: q.start.getFullYear(),
    }));
  }
  // yearly
  const now = new Date();
  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];
  return years.map(y => ({
    label: String(y),
    fullLabel: String(y),
    value: paidOrders.filter((o: DashboardOrder) => new Date(o.created_at).getFullYear() === y).reduce((s: number, o: DashboardOrder) => s + amount(o.total), 0),
    key: String(y),
    year: y,
  }));
}

function fmt(n: number) {
  return '\u20B1' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>('monthly');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [activeUsers, setActiveUsers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeUsersError, setActiveUsersError] = useState('');
  const requestRef = useRef({ sequence: 0 });
  const usersRequestRef = useRef({ sequence: 0 });

  const { start, end } = useMemo(() => getDateRange(dateRange), [dateRange]);

  const filteredOrders = useMemo(() => dashboard?.orders.filter(o => inRange(o.created_at, start, end)) || [], [dashboard, start, end]);
  const filteredProducts = useMemo(() => dashboard?.products.filter(p => inRange(p.created_at, start, end)) || [], [dashboard, start, end]);
  const filteredShops = useMemo(() => dashboard?.shops.filter(s => inRange(s.created_at, start, end)) || [], [dashboard, start, end]);
  const revenueChartData = useMemo(() => buildRevenueData(filteredOrders, revenuePeriod), [filteredOrders, revenuePeriod]);
  const { revenue, totalOrders, activeProducts, activeShops, orderStatus, recentOrders, recentProducts,
    revenueTrend, ordersTrend, productsTrend, shopsTrend, prevPeriodLabel } = useMemo(() => {
    const orders = filteredOrders;
    const products = filteredProducts;
    const shops = filteredShops;
    const statusCounts: Record<string, number> = { pending: 0, preparing: 0, shipped: 0, delivered: 0, cancelled: 0 };
    for (const order of orders) {
      const status = order.delivery_status || order.status || 'pending';
      statusCounts[status in statusCounts ? status : 'pending']++;
    }
    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = currentStart;
    const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
    const currentOrders = orders.filter(o => inRange(o.created_at, currentStart, currentEnd));
    const previousOrders = orders.filter(o => inRange(o.created_at, prevStart, prevEnd));
    const revenueOf = (items: DashboardOrder[]) => items.filter(isPaidOrder).reduce((sum, o) => sum + amount(o.total), 0);
    const productCount = (from: Date, to: Date) => products.filter(p => p.status === 'active' && inRange(p.created_at, from, to)).length;
    const shopCount = (from: Date, to: Date) => shops.filter(s => inRange(s.created_at, from, to)).length;
    return {
      revenue: revenueOf(orders), totalOrders: orders.length,
      activeProducts: products.filter(p => p.status === 'active').length, activeShops: shops.length,
      orderStatus: [
        { name: 'Pending', value: statusCounts.pending, color: '#F59E0B' },
        { name: 'Preparing', value: statusCounts.preparing, color: '#3B82F6' },
        { name: 'Shipped', value: statusCounts.shipped, color: '#8B5CF6' },
        { name: 'Delivered', value: statusCounts.delivered, color: '#10B981' },
        { name: 'Cancelled', value: statusCounts.cancelled, color: '#EF4444' },
      ],
      recentOrders: orders.slice(0, 5), recentProducts: products.slice(0, 5),
      revenueTrend: pct(revenueOf(currentOrders), revenueOf(previousOrders)),
      ordersTrend: pct(currentOrders.length, previousOrders.length),
      productsTrend: pct(productCount(currentStart, currentEnd), productCount(prevStart, prevEnd)),
      shopsTrend: pct(shopCount(currentStart, currentEnd), shopCount(prevStart, prevEnd)),
      prevPeriodLabel: `${MONTH_SHORT[prevStart.getMonth()]} ${prevStart.getFullYear()}`,
    };
  }, [filteredOrders, filteredProducts, filteredShops]);

  const fetchActiveUsers = useCallback(async () => {
    const request = ++usersRequestRef.current.sequence;
    try {
      const { data, error } = await supabase.rpc('count_active_users');
      if (error) throw error;
      if (data == null || !Number.isFinite(Number(data)) || Number(data) < 0) throw new Error('The active user count is unavailable.');
      if (request !== usersRequestRef.current.sequence) return;
      setActiveUsers(Number(data));
      setActiveUsersError('');
    } catch (error) {
      if (request === usersRequestRef.current.sequence) setActiveUsersError(getErrorMessage(error, 'The active user count could not be loaded.'));
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    const request = ++requestRef.current.sequence;
    try {
      const [productsRes, ordersRes, shopsRes, variationsRes] = await Promise.all([
        supabase.from('products').select('id, name, image, shop_name, category, views, created_at, status, price').order('created_at', { ascending: false }),
        supabase.from('orders').select('id, user_name, total, status, delivery_status, payment_status, created_at, items').order('created_at', { ascending: false }),
        supabase.from('shops').select('id, name, created_at'),
        supabase.from('product_variations').select('product_id, price'),
      ]);
      const failure = [productsRes, ordersRes, shopsRes, variationsRes].find(result => result.error)?.error;
      if (failure) throw failure;
      if (request !== requestRef.current.sequence) return;
      const prices: Record<string, number> = {};
      for (const variation of variationsRes.data || []) {
        if (variation.price == null || !Number.isFinite(Number(variation.price))) continue;
        const price = Number(variation.price);
        if (!(variation.product_id in prices) || price < prices[variation.product_id]) prices[variation.product_id] = price;
      }
      setDashboard({
        orders: (ordersRes.data || []).map(order => ({ ...order, total: amount(order.total) })) as DashboardOrder[],
        products: (productsRes.data || []).map(product => ({
          ...product, price: prices[product.id] ?? amount(product.price), category: normalizeProductCategory(product.category),
        })) as DashboardProduct[],
        shops: (shopsRes.data || []) as DashboardShop[],
      });
      setUpdatedAt(new Date());
      setLoadError('');
    } catch (error) {
      if (request === requestRef.current.sequence) setLoadError(getErrorMessage(error, 'Dashboard data could not be loaded.'));
    } finally {
      if (request === requestRef.current.sequence) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const requests = requestRef.current;
    queueMicrotask(() => { if (active) void fetchDashboard(); });
    const interval = window.setInterval(() => { void fetchDashboard(); }, 45_000);
    return () => { active = false; ++requests.sequence; window.clearInterval(interval); };
  }, [fetchDashboard]);
  usePortalRealtimeRefresh(['products', 'product_variations', 'orders', 'shops'], fetchDashboard);

  useEffect(() => {
    let active = true;
    const requests = usersRequestRef.current;
    queueMicrotask(() => { if (active) void fetchActiveUsers(); });
    const interval = window.setInterval(() => { void fetchActiveUsers(); }, 30_000);
    return () => { active = false; ++requests.sequence; window.clearInterval(interval); };
  }, [fetchActiveUsers]);

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#77716B', fontSize: '0.95rem' }}>
        Loading dashboard...
      </div>
    );
  }

  if (!dashboard) return <section role="alert" style={{ padding: 24 }}><p>{loadError || 'Dashboard data is unavailable.'}</p><button type="button" onClick={() => void fetchDashboard()}>Try again</button></section>;

  return (
    <div>
      {loadError && <div role="alert"><p>{loadError} Showing the last successful update.</p><button type="button" onClick={() => void fetchDashboard()}>Try again</button></div>}
      {activeUsersError && <div role="alert"><p>{activeUsersError}</p><button type="button" onClick={() => void fetchActiveUsers()}>Retry active users</button></div>}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="portal-action-bar">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value as DateRangeKey)}
              style={{
                appearance: 'none',
                padding: '9px 32px 9px 34px', border: '1.5px solid #E9DED2', borderRadius: '10px',
                background: '#fff', fontSize: '0.82rem', color: '#1F1F1F', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {DATE_RANGE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="#77716B" strokeWidth="2" style={{ width: '15px', height: '15px', position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="#77716B" strokeWidth="2" style={{ width: '12px', height: '12px', position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </motion.div>

      {/* ── KPI CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          index={0}
          label="TOTAL REVENUE"
          value={fmt(revenue)}
          trend={`${Math.abs(revenueTrend).toFixed(1)}%`}
          trendUp={revenueTrend >= 0}
          sub={`vs ${prevPeriodLabel}`}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="#934308" strokeWidth="2" style={{ width: '18px', height: '18px' }}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
        />
        <StatCard
          index={1}
          label="TOTAL ORDERS"
          value={String(totalOrders)}
          trend={`${Math.abs(ordersTrend).toFixed(1)}%`}
          trendUp={ordersTrend >= 0}
          sub={`vs ${prevPeriodLabel}`}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="#934308" strokeWidth="2" style={{ width: '18px', height: '18px' }}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>}
        />
        <StatCard
          index={2}
          label="ACTIVE PRODUCTS"
          value={String(activeProducts)}
          trend={`${Math.abs(productsTrend).toFixed(1)}%`}
          trendUp={productsTrend >= 0}
          sub={`vs ${prevPeriodLabel}`}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="#934308" strokeWidth="2" style={{ width: '18px', height: '18px' }}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>}
        />
        <StatCard
          index={3}
          label="ACTIVE SHOPS"
          value={String(activeShops)}
          trend={`${Math.abs(shopsTrend).toFixed(1)}%`}
          trendUp={shopsTrend >= 0}
          sub={`vs ${prevPeriodLabel}`}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="#934308" strokeWidth="2" style={{ width: '18px', height: '18px' }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>}
        />
        <StatCard
          index={4}
          label="ACTIVE USERS"
          value={activeUsers === null ? '\u2014' : String(activeUsers)}
          sub={activeUsersError ? activeUsers === null ? 'Unavailable' : 'Last successful count' : 'Live count'}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="#934308" strokeWidth="2" style={{ width: '18px', height: '18px' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        />
      </div>

      {/* ── ANALYTICS ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '1.9fr 1fr', alignItems: 'stretch', gap: '20px', marginBottom: '24px' }}>
        <RevenueChart data={revenueChartData} period={revenuePeriod} onPeriodChange={setRevenuePeriod} />
        <OrderStatusChart data={orderStatus} total={totalOrders} updatedAt={updatedAt || undefined} />
      </div>

      {/* ── BOTTOM TABLES ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
        <RecentOrdersTable orders={recentOrders} />
        <RecentProductsTable products={recentProducts} />
      </div>
    </div>
  );
}
