import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Clock3,
  Download,
  Inbox,
  MessageCircle,
  Package,
  PhilippinePeso,
  RotateCcw,
  ShoppingBag,
} from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { exportToCsv, type CsvColumn } from '../../lib/csvExport';
import { supabase } from '../../lib/supabase';
import type { ArtisanConversationSummary, ArtisanOrder } from '../../types/artisan';
import { useArtisanPortal } from './artisanContextValue';
import {
  buildOrderStatus,
  buildRevenueSeries,
  buildSellerMetrics,
  buildTopProducts,
  DATE_PRESETS,
  filterShopOrders,
  getDatePreset,
  inDateRange,
  shopItems,
  toDateInput,
  type DatePresetKey,
} from './sellerDashboard';

function money(value: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value);
}

function trendText(value: number) {
  const rounded = Math.abs(value).toFixed(1);
  return `${value >= 0 ? '+' : '-'}${rounded}% vs previous period`;
}

function KpiCard({ icon, label, value, helper, tone = 'neutral' }: { icon: ReactNode; label: string; value: string; helper: string; tone?: 'good' | 'warn' | 'neutral' }) {
  return (
    <article className="seller-kpi-card">
      <div className="seller-kpi-card__icon">{icon}</div>
      <div>
        <span className="seller-kpi-card__label">{label}</span>
        <strong>{value}</strong>
        <small className={`seller-tone seller-tone--${tone}`}>{helper}</small>
      </div>
    </article>
  );
}

function SectionCard({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`seller-card ${className}`}>
      <header className="seller-card__header"><h2>{title}</h2>{action}</header>
      {children}
    </section>
  );
}

export default function SellerOverview() {
  const { shop, products } = useArtisanPortal();
  const [orders, setOrders] = useState<ArtisanOrder[]>([]);
  const [conversations, setConversations] = useState<ArtisanConversationSummary[]>([]);
  const [range, setRange] = useState(() => getDatePreset('month'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    const [ordersResult, conversationsResult] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('conversations').select('id, shop_id, buyer_id, buyer_name, last_message, last_message_at, artisan_unread').eq('shop_id', shop.id).order('last_message_at', { ascending: false }).limit(5),
    ]);
    if (ordersResult.error) {
      setError(ordersResult.error.message);
    } else {
      setOrders((ordersResult.data || []) as ArtisanOrder[]);
    }
    if (!conversationsResult.error) setConversations((conversationsResult.data || []) as ArtisanConversationSummary[]);
    setLoading(false);
  }, [shop.id]);

  useEffect(() => {
    queueMicrotask(() => { void fetchOverview(); });
    const channel = supabase.channel(`seller-overview:${shop.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { void fetchOverview(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `shop_id=eq.${shop.id}` }, () => { void fetchOverview(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchOverview, shop.id]);

  const shopOrders = useMemo(() => filterShopOrders(orders, shop.id, shop.name), [orders, shop.id, shop.name]);
  const rangedOrders = useMemo(() => shopOrders.filter(order => inDateRange(order, range)), [shopOrders, range]);
  const metrics = useMemo(() => buildSellerMetrics(orders, products, shop.id, shop.name, range), [orders, products, shop.id, shop.name, range]);
  const revenueSeries = useMemo(() => buildRevenueSeries(orders, shop.id, shop.name, range), [orders, shop.id, shop.name, range]);
  const status = useMemo(() => buildOrderStatus(rangedOrders), [rangedOrders]);
  const topProducts = useMemo(() => buildTopProducts(rangedOrders, shop.id, shop.name), [rangedOrders, shop.id, shop.name]);
  const recentOrders = rangedOrders.slice(0, 4);
  const recentListings = products.slice(0, 4);
  function choosePreset(key: DatePresetKey) {
    setRange(getDatePreset(key));
  }

  function changeDate(which: 'start' | 'end', value: string) {
    if (!value) return;
    setRange(current => ({ ...current, [which]: new Date(`${value}T${which === 'start' ? '00:00:00' : '23:59:59'}`), label: 'Custom Range' }));
  }

  function exportReport() {
    const stamp = new Date().toISOString().slice(0, 10);
    const metricColumns: CsvColumn[] = [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }];
    exportToCsv([
      { metric: 'Shop', value: shop.name },
      { metric: 'Date range', value: `${toDateInput(range.start)} to ${toDateInput(range.end)}` },
      { metric: 'Revenue', value: metrics.revenue.toFixed(2) },
      { metric: 'Total orders', value: metrics.totalOrders },
      { metric: 'Pending orders', value: metrics.pendingOrders },
      { metric: 'Completed orders', value: metrics.completedOrders },
      { metric: 'Active listings', value: metrics.activeListings },
    ], metricColumns, `seller-dashboard-${stamp}`);
    window.setTimeout(() => exportToCsv(
      revenueSeries,
      [{ key: 'fullLabel', label: 'Period' }, { key: 'revenue', label: 'Revenue' }],
      `seller-revenue-${stamp}`,
    ), 180);
    window.setTimeout(() => exportToCsv(
      status.map(item => ({ status: item.name, count: item.value })),
      [{ key: 'status', label: 'Status' }, { key: 'count', label: 'Orders' }],
      `seller-order-status-${stamp}`,
    ), 360);
  }

  if (loading) {
    return <div className="seller-overview-skeleton" aria-label="Loading seller overview">{Array.from({ length: 8 }, (_, index) => <div className="shimmer-skeleton" key={index} />)}</div>;
  }

  if (error) {
    return (
      <div className="seller-error-state" role="alert">
        <RotateCcw size={28} />
        <h1>We couldn’t load your overview</h1>
        <p>{error}</p>
        <button className="seller-button seller-button--primary" onClick={() => void fetchOverview()}>Try again</button>
      </div>
    );
  }

  return (
    <div className="seller-overview">
      <div className="portal-action-bar">
        <div className="seller-overview__actions">
          <div className="seller-date-inputs" aria-label="Custom date range">
            <input aria-label="Start date" type="date" value={toDateInput(range.start)} max={toDateInput(range.end)} onChange={event => changeDate('start', event.target.value)} />
            <span>→</span>
            <input aria-label="End date" type="date" value={toDateInput(range.end)} min={toDateInput(range.start)} max={toDateInput(new Date())} onChange={event => changeDate('end', event.target.value)} />
          </div>
          <button className="seller-button seller-button--outline" onClick={exportReport}><Download size={17} /> Export</button>
        </div>
      </div>

      <div className="seller-date-presets" aria-label="Dashboard date presets">
        {DATE_PRESETS.map(item => <button key={item.key} className={range.label === item.label ? 'is-active' : ''} onClick={() => choosePreset(item.key)}>{item.label}</button>)}
      </div>

      <div className="seller-kpi-grid">
        <KpiCard icon={<PhilippinePeso />} label={`Revenue (${range.label})`} value={money(metrics.revenue)} helper={trendText(metrics.revenueTrend)} tone={metrics.revenueTrend >= 0 ? 'good' : 'warn'} />
        <KpiCard icon={<ShoppingBag />} label="Orders" value={String(metrics.totalOrders)} helper={trendText(metrics.ordersTrend)} tone={metrics.ordersTrend >= 0 ? 'good' : 'warn'} />
        <KpiCard icon={<Clock3 />} label="Pending Orders" value={String(metrics.pendingOrders)} helper="Awaiting confirmation" tone="warn" />
        <KpiCard icon={<Check />} label="Completed Orders" value={String(metrics.completedOrders)} helper="Fulfilled successfully" tone="good" />
        <KpiCard icon={<Package />} label="Active Listings" value={String(metrics.activeListings)} helper={`${products.length} total listings`} tone="good" />
      </div>

      <div className="seller-analytics-grid">
        <SectionCard title="Revenue Overview" className="seller-revenue-card" action={<span className="seller-card__meta">{toDateInput(range.start)} – {toDateInput(range.end)}</span>}>
          <div className="seller-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueSeries} margin={{ top: 16, right: 16, left: 2, bottom: 4 }}>
                <CartesianGrid stroke="#EEE4DA" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#8B7A6D', fontSize: 11 }} axisLine={{ stroke: '#E4D7CA' }} tickLine={false} />
                <YAxis tickFormatter={value => `₱${Number(value).toLocaleString()}`} tick={{ fill: '#8B7A6D', fontSize: 11 }} axisLine={false} tickLine={false} width={68} />
                <Tooltip formatter={value => [money(Number(value)), 'Revenue']} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel || ''} contentStyle={{ border: '1px solid #E4D7CA', borderRadius: 10 }} />
                <Line type="monotone" dataKey="revenue" stroke="#923A14" strokeWidth={2.5} dot={{ r: 3, fill: '#923A14', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Order Status">
          <div className="seller-status-chart">
            <div className="seller-donut-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={status} dataKey="value" innerRadius="62%" outerRadius="86%" paddingAngle={1}>{status.map(item => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
              <div className="seller-donut-total"><strong>{metrics.totalOrders}</strong><span>Total Orders</span></div>
            </div>
            <div className="seller-status-legend">{status.map(item => <div key={item.name}><span style={{ background: item.color }} /><span>{item.name}</span><strong>{item.value} ({metrics.totalOrders ? Math.round(item.value / metrics.totalOrders * 100) : 0}%)</strong></div>)}</div>
          </div>
        </SectionCard>
      </div>

      <div className="seller-overview-bottom">
        <SectionCard title="Top Products by Revenue" action={<Link to="listings">View all <ArrowRight size={14} /></Link>}>
          {topProducts.length ? <div className="seller-compact-list">{topProducts.map(item => {
            const product = products.find(candidate => candidate.id === item.id || candidate.name === item.name);
            return <div key={item.id}><div className="seller-listing-thumb">{product?.image ? <img src={product.image} alt="" /> : <Package />}</div><span>{item.name}</span><small>{item.orders} orders</small><strong>{money(item.revenue)}</strong></div>;
          })}</div> : <div className="seller-mini-empty"><ShoppingBag /><p>No sales in this period yet.</p></div>}
        </SectionCard>

        <SectionCard title="Recent Listings" action={<Link to="listings">View all <ArrowRight size={14} /></Link>}>
          {recentListings.length ? <div className="seller-compact-list">{recentListings.map(product => <div key={product.id}><div className="seller-listing-thumb"><img src={product.image} alt="" /></div><span>{product.name}</span><small>{product.category}</small><strong>{money(product.price)}</strong></div>)}</div> : <div className="seller-mini-empty"><Package /><p>No listings yet.</p></div>}
        </SectionCard>

        <div className="seller-side-summaries">
          <SectionCard title="Recent Orders" action={<Link to="orders">View all</Link>}>
            {recentOrders.length ? <div className="seller-summary-list">{recentOrders.slice(0, 2).map(order => {
              const item = shopItems(order, shop.id, shop.name)[0];
              return <Link to={`orders?orderId=${order.id}`} key={order.id}><span>{item?.product_name || item?.productName || `Order #${order.id.slice(0, 6)}`}</span><small>{order.delivery_status || 'pending'}</small></Link>;
            })}</div> : <div className="seller-mini-empty seller-mini-empty--small"><Inbox /><p>No recent orders</p></div>}
          </SectionCard>
          <SectionCard title="Customer Messages" action={<Link to="messages">View all</Link>}>
            {conversations.length ? <div className="seller-summary-list">{conversations.slice(0, 2).map(conversation => <Link to="messages" key={conversation.id}><span>{conversation.buyer_name || 'Customer'}</span><small>{conversation.last_message || 'New conversation'}</small></Link>)}</div> : <div className="seller-mini-empty seller-mini-empty--small"><MessageCircle /><p>No new messages</p></div>}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
