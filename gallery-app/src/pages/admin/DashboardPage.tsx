import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useMediaQuery } from '../../hooks/useMediaQuery';
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

function isPaidOrder(o: any) {
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

function buildRevenueData(orders: any[], period: RevenuePeriod) {
  const paidOrders = orders.filter(isPaidOrder);
  if (period === 'monthly') {
    const months = rollingMonths(12);
    const map: Record<string, number> = {};
    paidOrders.forEach((o: any) => {
      const key = monthKeyOf(new Date(o.created_at));
      map[key] = (map[key] || 0) + (o.total || 0);
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
      value: paidOrders.filter((o: any) => inRange(o.created_at, q.start, q.end)).reduce((s: number, o: any) => s + (o.total || 0), 0),
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
    value: paidOrders.filter((o: any) => new Date(o.created_at).getFullYear() === y).reduce((s: number, o: any) => s + (o.total || 0), 0),
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
  const [revenue, setRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [activeProducts, setActiveProducts] = useState(0);
  const [activeShops, setActiveShops] = useState(0);
  const [orderStatus, setOrderStatus] = useState<{ name: string; value: number; color: string }[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [activeUsers, setActiveUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revenueTrend, setRevenueTrend] = useState(0);
  const [ordersTrend, setOrdersTrend] = useState(0);
  const [productsTrend, setProductsTrend] = useState(0);
  const [shopsTrend, setShopsTrend] = useState(0);
  const [prevPeriodLabel, setPrevPeriodLabel] = useState('');
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [allShops, setAllShops] = useState<any[]>([]);

  const { start, end } = useMemo(() => getDateRange(dateRange), [dateRange]);

  const filteredOrders = useMemo(() => allOrders.filter((o: any) => inRange(o.created_at, start, end)), [allOrders, start, end]);
  const filteredProducts = useMemo(() => allProducts.filter((p: any) => inRange(p.created_at, start, end)), [allProducts, start, end]);
  const filteredShops = useMemo(() => allShops.filter((s: any) => inRange(s.created_at, start, end)), [allShops, start, end]);

  const revenueChartData = useMemo(() => buildRevenueData(filteredOrders, revenuePeriod), [filteredOrders, revenuePeriod]);

  useEffect(() => {
    fetchDashboard();
    const interval = window.setInterval(fetchDashboard, 45_000);
    const handleFocus = () => { void fetchDashboard(); };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    fetchActiveUsers();
    const interval = setInterval(fetchActiveUsers, 30000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    deriveStats(filteredOrders, filteredProducts, filteredShops);
  }, [filteredOrders, filteredProducts, filteredShops]);

  async function fetchActiveUsers() {
    try {
      const { data, error } = await supabase.rpc('count_active_users');
      if (error) return;
      setActiveUsers(Number(data) || 0);
    } catch {
      /* ignore transient errors */
    }
  }

  async function fetchDashboard() {
    try {
      setUpdatedAt(new Date());
      const [productsRes, ordersRes, shopsRes, variationsRes] = await Promise.all([
        supabase.from('products').select('id, name, image, shop_name, category, views, created_at, status').order('created_at', { ascending: false }),
        supabase.from('orders').select('id, user_name, total, status, delivery_status, payment_status, created_at, items').order('created_at', { ascending: false }),
        supabase.from('shops').select('id, name, created_at'),
        supabase.from('product_variations').select('product_id, price'),
      ]);

      const products = productsRes.data || [];
      const orders = ordersRes.data || [];
      const shops = shopsRes.data || [];
      const variations = variationsRes.data || [];

      const productPrices: Record<string, number> = {};
      variations.forEach((v: any) => {
        const price = Number(v.price) || 0;
        if (!productPrices[v.product_id] || price < productPrices[v.product_id]) {
          productPrices[v.product_id] = price;
        }
      });

      setAllOrders(orders);
      setAllProducts(products.map(p => ({
        id: p.id,
        name: p.name,
        image: p.image,
        price: productPrices[p.id] || 0,
        shop_name: p.shop_name,
        category: p.category,
        status: p.status,
        created_at: p.created_at,
      })));
      setAllShops(shops);
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e);
    } finally {
      setLoading(false);
    }
  }

  function deriveStats(orders: any[], products: any[], shops: any[]) {
    const totalRevenue = orders.filter(isPaidOrder).reduce((sum: number, o: any) => sum + (o.total || 0), 0);
    const statusCounts: Record<string, number> = { pending: 0, preparing: 0, shipped: 0, delivered: 0, cancelled: 0 };
    orders.forEach((o: any) => {
      const s = o.delivery_status || o.status || 'pending';
      if (s in statusCounts) statusCounts[s]++;
      else statusCounts.pending++;
    });

    setRevenue(totalRevenue);
    setTotalOrders(orders.length);
    setActiveProducts(products.filter((p: any) => p.status === 'active').length);
    setActiveShops(shops.length);
    setOrderStatus([
      { name: 'Pending', value: statusCounts.pending, color: '#F59E0B' },
      { name: 'Preparing', value: statusCounts.preparing, color: '#3B82F6' },
      { name: 'Shipped', value: statusCounts.shipped, color: '#8B5CF6' },
      { name: 'Delivered', value: statusCounts.delivered, color: '#10B981' },
      { name: 'Cancelled', value: statusCounts.cancelled, color: '#EF4444' },
    ]);
    setRecentOrders(orders.slice(0, 5));
    setRecentProducts(products.slice(0, 5));
    computeTrends(orders, products, shops);
  }

  function computeTrends(orders: any[], products: any[], shops: any[]) {
    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = currentStart;

    const curRevenue = orders.filter(isPaidOrder).filter(o => inRange(o.created_at, currentStart, currentEnd)).reduce((s: number, o: any) => s + (o.total || 0), 0);
    const prevRevenue = orders.filter(isPaidOrder).filter(o => inRange(o.created_at, prevStart, prevEnd)).reduce((s: number, o: any) => s + (o.total || 0), 0);
    const curOrders = orders.filter((o: any) => inRange(o.created_at, currentStart, currentEnd)).length;
    const prevOrders = orders.filter((o: any) => inRange(o.created_at, prevStart, prevEnd)).length;
    const curProducts = products.filter((p: any) => p.status === 'active' && inRange(p.created_at, currentStart, currentEnd)).length;
    const prevProducts = products.filter((p: any) => p.status === 'active' && inRange(p.created_at, prevStart, prevEnd)).length;
    const curShops = shops.filter((s: any) => inRange(s.created_at, currentStart, currentEnd)).length;
    const prevShops = shops.filter((s: any) => inRange(s.created_at, prevStart, prevEnd)).length;

    const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);

    setRevenueTrend(pct(curRevenue, prevRevenue));
    setOrdersTrend(pct(curOrders, prevOrders));
    setProductsTrend(pct(curProducts, prevProducts));
    setShopsTrend(pct(curShops, prevShops));
    setPrevPeriodLabel(`${MONTH_SHORT[prevStart.getMonth()]} ${prevStart.getFullYear()}`);
  }

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#77716B', fontSize: '0.95rem' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div>
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
          value={String(activeUsers)}
          sub="Live count"
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
