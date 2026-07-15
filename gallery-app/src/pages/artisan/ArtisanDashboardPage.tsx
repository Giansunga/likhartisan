import React, { useState, useEffect, useRef, Component, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fmt, displayVariation } from '../../lib/utils';
import { recomputeProductStock } from '../../lib/stockSync';
import { API_BASE } from '../../lib/api';
import DesignMessageCard from '../../components/chat/DesignMessageCard';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, ShoppingBag, MessageSquare, Package,
  Inbox, Store, Layers, LogOut,
  ArrowUpRight, Bell
} from 'lucide-react';
import { toast } from 'sonner';

// Shimmer keyframes & classes are defined globally in src/index.css

class PanelErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(err: any) { return { hasError: true, error: err?.message || 'Something went wrong' }; }
  componentDidCatch(err: any) { console.error('Panel error:', err); }
  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: '' });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#d32f2f', marginBottom: '8px' }}>Something went wrong</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '16px' }}>{this.state.error}</p>
          <button onClick={() => this.setState({ hasError: false, error: '' })}
            style={{ padding: '10px 24px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type Panel = 'overview' | 'listings' | 'vault' | 'requests' | 'orders' | 'messages' | 'settings' | 'notifications';

import { SHOP_EMAILS } from '../../lib/constants';
import { formatTime } from '../../lib/utils';

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  model3d?: string;
  materials: string;
  dimensions: string;
  technique?: string;
  shop_id: string;
  shop_name: string;
  status: string;
  views: number;
  created_at: string;
}

export default function ArtisanDashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activePanel, setActivePanel] = useState<Panel>('overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [productPrices, setProductPrices] = useState<Record<string, number>>({});
  const [artisanShopId, setArtisanShopId] = useState<string | null>(null);
  const [ordersKey, setOrdersKey] = useState(0);
  const [shopData, setShopData] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    const panel = searchParams.get('panel');
    const orderId = searchParams.get('orderId');
    if (panel === 'orders' && orderId) {
      setActivePanel('orders');
    }
  }, [searchParams]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    async function checkArtisanAccess() {
      try {
        if (cancelled) return;
        if (user && SHOP_EMAILS.includes(user.email || '')) {
          const { data: shopResult } = await supabase
            .from('shops')
            .select('*')
            .eq('email', user.email)
            .single();

          if (cancelled) return;

          setIsAuthorized(true);
          setAuthChecked(true);

          if (shopResult) {
            setArtisanShopId(shopResult.id);
            setShopData(shopResult);
            fetchProducts(shopResult.id);
          }
        } else if (!cancelled && !isAuthorized) {
          setAuthChecked(true);
        }
      } catch (e) {
        console.error('Artisan access check error:', e);
        if (!cancelled && !isAuthorized) {
          setAuthChecked(true);
        }
      }
    }
    checkArtisanAccess();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  async function fetchProducts(sid: string) {
    setLoadingProducts(true);
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('shop_id', sid)
      .order('created_at', { ascending: false });

    if (data) {
      setProducts(data);
      // Fetch lowest variation price per product
      const pIds = data.map((p: any) => p.id);
      if (pIds.length > 0) {
        const { data: variations } = await supabase
          .from('product_variations')
          .select('product_id, price')
          .in('product_id', pIds);
        if (variations && variations.length > 0) {
          const priceMap: Record<string, number> = {};
          for (const v of variations as any[]) {
            const p = Number(v.price) || 0;
            if (!priceMap[v.product_id] || p < priceMap[v.product_id]) {
              priceMap[v.product_id] = p;
            }
          }
          setProductPrices(priceMap);
        }
      }
    }
    setLoadingProducts(false);
  }

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ color: '#666' }}>Loading...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }

  const navItems: { panel: Panel; label: string; icon: React.ReactNode }[] = [
    { panel: 'overview',  label: 'Overview',     icon: <LayoutDashboard size={18} /> },
    { panel: 'orders',   label: 'Orders',        icon: <ShoppingBag size={18} /> },
    { panel: 'messages', label: 'Messages',      icon: <MessageSquare size={18} /> },
    { panel: 'listings', label: 'My Listings',   icon: <Package size={18} /> },
    { panel: 'requests', label: 'Requests',      icon: <Inbox size={18} /> },
    { panel: 'settings', label: 'Shop Profile',  icon: <Store size={18} /> },
    { panel: 'vault',    label: 'Design Vault',  icon: <Layers size={18} /> },
    { panel: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div style={{ background: '#F7F3EE', fontFamily: 'var(--font-sans)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', marginTop: 'var(--nav-height)', minHeight: 'calc(100vh - var(--nav-height))' }}>

        {/* ── REDESIGNED SIDEBAR ── */}
        <aside style={{
          width: '240px', minWidth: '240px',
          background: '#fff',
          borderRight: '1px solid #EDE8E2',
          position: 'sticky', top: 'var(--nav-height)',
          height: 'calc(100vh - var(--nav-height))',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
          boxShadow: '2px 0 12px rgba(130,62,11,0.04)',
        }}>
          {/* Brand mark */}
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #F0EBE4' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: '#B8A89A', textTransform: 'uppercase' }}>Seller Portal</div>
          </div>

          {/* Nav items */}
          <nav style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {navItems.map((item) => {
              const isActive = activePanel === item.panel;
              return (
                <motion.button
                  key={item.panel}
                  onClick={() => { setActivePanel(item.panel); if (item.panel === 'orders') setOrdersKey(k => k + 1); }}
                  whileHover={{ x: isActive ? 0 : 3 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '11px',
                    padding: '10px 14px',
                    border: 'none',
                    background: isActive ? 'var(--primary-color)' : 'transparent',
                    color: isActive ? '#fff' : '#6B5D52',
                    fontFamily: 'var(--font-sans)', fontSize: '0.875rem', fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer', borderRadius: '10px', width: '100%', textAlign: 'left',
                    transition: 'background 0.18s, color 0.18s',
                    boxShadow: isActive ? '0 2px 8px rgba(130,62,11,0.25)' : 'none',
                  }}
                  onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = '#FDF5EE'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary-color)'; }}}
                  onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#6B5D52'; }}}
                >
                  <span style={{ opacity: isActive ? 1 : 0.7, display: 'flex' }}>{item.icon}</span>
                  {item.label}
                </motion.button>
              );
            })}
          </nav>

          {/* Bottom pinned items */}
          <div style={{ padding: '12px 12px', borderTop: '1px solid #F0EBE4', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[
              { label: 'Back to Store', icon: <Store size={17} /> },
              { label: 'Logout',   icon: <LogOut size={17} />, danger: true },
            ].map(({ label, icon, danger }) => (
              <button
                key={label}
                onClick={() => {
                  if (label === 'Logout') {
                    supabase.auth.signOut();
                    window.location.href = '/';
                  } else if (label === 'Back to Store') {
                    window.location.href = '/';
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '11px',
                  padding: '10px 14px', border: 'none', background: 'transparent',
                  color: danger ? '#C0392B' : '#6B5D52',
                  fontFamily: 'var(--font-sans)', fontSize: '0.875rem', fontWeight: 500,
                  cursor: 'pointer', borderRadius: '10px', width: '100%', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget).style.background = danger ? '#FEF2F2' : '#FDF5EE'; }}
                onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex: 1, padding: '36px 40px', background: '#F7F3EE', minWidth: 0 }}>
          {/* Welcome bar */}
          {activePanel === 'overview' && shopData && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              style={{ marginBottom: '28px' }}
            >
              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px', fontFamily: 'var(--font-serif)' }}>
                {greeting}, {shopData.name} 👋
              </h1>
              <p style={{ fontSize: '0.9rem', color: '#8C7B6E' }}>Here's a quick overview of your shop's performance today.</p>
            </motion.div>
          )}

          {!artisanShopId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--text-light)', fontSize: '0.95rem' }}>Loading shop data...</div>
          ) : (
            <PanelErrorBoundary resetKey={activePanel}>
              {activePanel === 'overview'  && <OverviewPanel products={products} productPrices={productPrices} shopId={artisanShopId} shopName={shopData?.name} loadingOrders={loadingOrders} setLoadingOrders={setLoadingOrders} setActivePanel={setActivePanel} navigate={navigate} />}
              {activePanel === 'listings'  && <ListingsPanel products={products} productPrices={productPrices} onProductsUpdated={setProducts} loadingProducts={loadingProducts} />}
              {activePanel === 'vault'     && <VaultPanel products={products} productPrices={productPrices} onProductsUpdated={setProducts} />}
              {activePanel === 'requests'  && <RequestsPanel />}
              {activePanel === 'orders'    && <OrdersPanel key={ordersKey} shopId={artisanShopId} shopName={shopData?.name} loadingOrders={loadingOrders} setLoadingOrders={setLoadingOrders} />}
              {activePanel === 'messages'  && <MessagesPanel shopId={artisanShopId} loadingMessages={loadingMessages} setLoadingMessages={setLoadingMessages} />}
              {activePanel === 'settings'  && <ShopSettingsPanel shopData={shopData} onShopUpdated={setShopData} />}
              {activePanel === 'notifications' && <NotificationsPanel userId={user?.id || ''} />}
            </PanelErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}

function OverviewPanel({ products, productPrices, shopId, shopName, loadingOrders, setLoadingOrders, setActivePanel, navigate }: { products: Product[]; productPrices: Record<string, number>; shopId: string | null; shopName?: string; loadingOrders: boolean; setLoadingOrders: (v: boolean) => void; setActivePanel: (v: Panel) => void; navigate: (path: string) => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    const n = new Date();
    return { start: new Date(n.getFullYear(), n.getMonth(), 1), end: n };
  });
  const [rangeLabel, setRangeLabel] = useState('This Month');

  const DATE_PRESETS = [
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: '3month', label: 'Last 3 Months' },
    { key: 'year', label: 'This Year' },
    { key: 'all', label: 'All Time' },
  ];

  function toInputDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function applyPreset(key: string) {
    const n = new Date();
    const startOfToday = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    let start: Date;
    switch (key) {
      case 'week': start = new Date(startOfToday); start.setDate(start.getDate() - 6); break;
      case 'month': start = new Date(n.getFullYear(), n.getMonth(), 1); break;
      case '3month': start = new Date(n.getFullYear(), n.getMonth() - 2, 1); break;
      case 'year': start = new Date(n.getFullYear(), 0, 1); break;
      default: start = new Date(2000, 0, 1); break; // all time
    }
    const label = DATE_PRESETS.find(p => p.key === key)?.label || 'Custom';
    setDateRange({ start, end: n });
    setRangeLabel(label);
  }

  useEffect(() => {
    if (!shopId) { setLoadingOrders(false); return; }
    let cancelled = false;
    async function fetchOrders() {
      try {
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (error || !data || cancelled) return;
        const shopOrders = data.filter((o: any) => {
          const items = Array.isArray(o.items) ? o.items : [];
          return items.some((i: any) => i.shop_id === shopId || (!!shopName && i.shop_name === shopName));
        });
        setOrders(shopOrders);
      } catch (e) {
        console.error('Overview fetch error:', e);
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    }
    fetchOrders();
    return () => { cancelled = true; };
  }, [shopId, shopName]);

  if (loadingOrders) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Stat cards skeletons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: '#fff', border: '1px solid #EDE8E2', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(130,62,11,0.06)' }}>
              <div style={{ height: '14px', width: '60%', background: 'linear-gradient(90deg, #F0EBE4 25%, #F7F3EE 50%, #F0EBE4 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '4px', marginBottom: '12px' }} />
              <div style={{ height: '28px', width: '80%', background: 'linear-gradient(90deg, #F0EBE4 25%, #F7F3EE 50%, #F0EBE4 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
        {/* Chart skeleton */}
        <div style={{ background: '#fff', border: '1px solid #EDE8E2', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(130,62,11,0.06)' }}>
          <div style={{ height: '300px', background: 'linear-gradient(90deg, #F0EBE4 25%, #F7F3EE 50%, #F0EBE4 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '8px' }} />
        </div>
      </div>
    );
  }

  const safeOrders = Array.isArray(orders) ? orders : [];
  const rStart = dateRange.start.getTime();
  const rEnd = dateRange.end.getTime() + (24 * 60 * 60 * 1000 - 1); // include end day
  const inRange = (o: any) => {
    try {
      const t = new Date(o.created_at).getTime();
      return t >= rStart && t <= rEnd;
    } catch { return false; }
  };
  const paidOrders = safeOrders.filter(o => o && (o.status === 'paid' || o.status === 'completed') && inRange(o));
  const totalRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
  const pendingOrders = safeOrders.filter(o => o && o.delivery_status === 'pending').length;
  const totalOrders = paidOrders.length;
  const now = new Date();

  // Period-over-period comparison: prior window of equal length immediately before the range.
  const rangeDays = Math.max(1, Math.round((rEnd - rStart) / (24 * 60 * 60 * 1000)));
  const prevEnd = rStart - 1;
  const prevStart = prevEnd - rangeDays * 24 * 60 * 60 * 1000;
  const inPrev = (o: any) => {
    try {
      const t = new Date(o.created_at).getTime();
      return t >= prevStart && t <= prevEnd;
    } catch { return false; }
  };
  const prevPaid = safeOrders.filter((o: any) => o && (o.status === 'paid' || o.status === 'completed') && inPrev(o));
  const prevRevenue = prevPaid.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
  const revenueChange = prevRevenue > 0 ? (((totalRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : '0';

  // Build monthly data dynamically based on selected date range
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const rangeStartMonth = dateRange.start.getMonth();
  const rangeStartYear = dateRange.start.getFullYear();
  const rangeEndMonth = dateRange.end.getMonth();
  const rangeEndYear = dateRange.end.getFullYear();
  const spanYears = rangeStartYear !== rangeEndYear;

  const monthlyData: { name: string; revenue: number }[] = [];
  let iterYear = rangeStartYear;
  let iterMonth = rangeStartMonth;
  while (iterYear < rangeEndYear || (iterYear === rangeEndYear && iterMonth <= rangeEndMonth)) {
    const label = spanYears ? `${monthNames[iterMonth]} ${iterYear}` : monthNames[iterMonth];
    const monthOrders = paidOrders.filter(o => {
      try {
        const d = new Date(o.created_at);
        return d.getMonth() === iterMonth && d.getFullYear() === iterYear;
      } catch { return false; }
    });
    monthlyData.push({ name: label, revenue: monthOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0) });
    iterMonth++;
    if (iterMonth > 11) { iterMonth = 0; iterYear++; }
  }
  const maxRevenue = Math.max(...monthlyData.map(m => m.revenue), 1);
  const productRevenue: Record<string, number> = {};
  paidOrders.forEach(o => {
    (Array.isArray(o.items) ? o.items : []).forEach((item: any) => {
      const name = item.product_name || item.productName || 'Unknown';
      productRevenue[name] = (productRevenue[name] || 0) + (Number(item.price) || 0) * (Number(item.qty) || 1);
    });
  });
  const topProducts = Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const statCards = [
    {
      label: `Revenue (${rangeLabel})`, value: `₱${totalRevenue.toLocaleString()}`,
      sub: 'Selected period', color: '#823E0B',
      bg: '#FDF5EE', trend: null,
    },
    {
      label: `vs Previous Period`, value: `${Number(revenueChange) >= 0 ? '+' : ''}${revenueChange}%`,
      sub: `prev ${rangeDays}d`,
      color: Number(revenueChange) >= 0 ? '#2E7D32' : '#C62828',
      bg: Number(revenueChange) >= 0 ? '#F0FDF4' : '#FEF2F2',
      trend: `${Number(revenueChange) >= 0 ? '+' : ''}${revenueChange}%`,
      trendPositive: Number(revenueChange) >= 0,
    },
    {
      label: 'Orders (period)', value: String(totalOrders),
      sub: 'Paid orders', color: '#1565C0',
      bg: '#EFF6FF', trend: null,
    },
    {
      label: 'Pending Orders', value: String(pendingOrders),
      sub: 'Awaiting confirmation', color: '#6A1B9A',
      bg: '#F5F0FF', trend: null,
    },
  ];

  return (
    <div>
      {/* DATE RANGE PICKER */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '24px', background: '#fff', border: '1px solid #EDE8E2', borderRadius: '16px', padding: '16px 20px', boxShadow: '0 2px 8px rgba(130,62,11,0.06)' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {DATE_PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                border: rangeLabel === p.label ? '1.5px solid #823E0B' : '1px solid #EDE8E2',
                background: rangeLabel === p.label ? '#823E0B' : '#fff',
                color: rangeLabel === p.label ? '#fff' : '#A89688',
                transition: 'all 0.15s',
              }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <input type="date" value={toInputDate(dateRange.start)} max={toInputDate(dateRange.end)} onChange={e => { const v = e.target.value ? new Date(e.target.value) : dateRange.start; setDateRange(pr => ({ ...pr, start: v })); setRangeLabel('Custom'); }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #EDE8E2', fontSize: '0.78rem', fontFamily: 'inherit', color: '#3D2B1F' }} />
          <span style={{ color: '#A89688', fontSize: '0.78rem' }}>to</span>
          <input type="date" value={toInputDate(dateRange.end)} min={toInputDate(dateRange.start)} onChange={e => { const v = e.target.value ? new Date(e.target.value) : dateRange.end; setDateRange(pr => ({ ...pr, end: v })); setRangeLabel('Custom'); }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #EDE8E2', fontSize: '0.78rem', fontFamily: 'inherit', color: '#3D2B1F' }} />
        </div>
      </div>

      {/* STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px', marginBottom: '28px' }}>
        {statCards.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(130,62,11,0.12)' }}
            style={{
              background: '#fff', border: '1px solid #EDE8E2',
              borderRadius: '16px', padding: '22px 24px',
              boxShadow: '0 2px 8px rgba(130,62,11,0.06)',
              cursor: 'default', transition: 'box-shadow 0.2s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', letterSpacing: '0.03em', textTransform: 'uppercase' }}>{stat.label}</div>
            </div>
            <div style={{ fontSize: '1.9rem', fontWeight: 700, color: 'var(--text-dark)', fontFamily: 'var(--font-serif)', marginBottom: '6px', lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {stat.trend && (
                <span style={{
                  fontSize: '0.75rem', fontWeight: 700,
                  color: stat.trendPositive ? '#2E7D32' : '#C62828',
                  background: stat.trendPositive ? '#F0FDF4' : '#FEF2F2',
                  padding: '2px 7px', borderRadius: '999px',
                }}>{stat.trend}</span>
              )}
              <span style={{ fontSize: '0.78rem', color: '#A89688' }}>{stat.sub}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* MONTHLY REVENUE CHART */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.4 }}
        style={{ background: '#fff', border: '1px solid #EDE8E2', borderRadius: '16px', padding: '28px 28px 36px', boxShadow: '0 2px 8px rgba(130,62,11,0.06)', marginBottom: '24px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '2px' }}>Monthly Revenue</h3>
            <p style={{ fontSize: '0.8rem', color: '#A89688' }}>
              {rangeLabel === 'This Year' || rangeLabel === 'All Time'
                ? `${now.getFullYear()} overview`
                : `${toInputDate(dateRange.start)} — ${toInputDate(dateRange.end)}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '180px', paddingBottom: '28px', position: 'relative' }}>
          {monthlyData.map((m, i) => {
            const barH = Math.max((m.revenue / maxRevenue) * 150, m.revenue > 0 ? 8 : 3);
            // For multi-year ranges, parse month+year from label; otherwise use index
            const isCurrentMonth = spanYears
              ? m.name === `${monthNames[now.getMonth()]} ${now.getFullYear()}`
              : i + rangeStartMonth === now.getMonth() && rangeStartYear === now.getFullYear();
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', height: '100%', justifyContent: 'flex-end' }}>
                {m.revenue > 0 && (
                  <span style={{ fontSize: '0.65rem', color: isCurrentMonth ? 'var(--primary-color)' : '#A89688', fontWeight: 600, marginBottom: '4px' }}>
                    ₱{(m.revenue / 1000).toFixed(1)}k
                  </span>
                )}
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: barH }}
                  transition={{ delay: 0.4 + i * 0.04, duration: 0.5, ease: 'easeOut' }}
                  style={{
                    width: '100%', maxWidth: '44px',
                    background: isCurrentMonth
                      ? 'linear-gradient(180deg, #A0501A 0%, #823E0B 100%)'
                      : '#E8E0D8',
                    borderRadius: '6px 6px 3px 3px',
                    boxShadow: isCurrentMonth ? '0 2px 8px rgba(130,62,11,0.3)' : 'none',
                  }}
                />
                <span style={{ fontSize: '0.7rem', color: isCurrentMonth ? 'var(--primary-color)' : '#A89688', position: 'absolute', bottom: '-22px', fontWeight: isCurrentMonth ? 700 : 400 }}>{m.name}</span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* TOP PRODUCTS + RECENT LISTINGS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* Top Products */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44, duration: 0.4 }}
          style={{ background: '#fff', border: '1px solid #EDE8E2', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(130,62,11,0.06)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark)' }}>Top Products by Revenue</h3>
            <button onClick={() => setActivePanel('listings')} style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              View All <ArrowUpRight size={13} />
            </button>
          </div>
          {topProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FDF5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <ShoppingBag size={26} color="#823E0B" />
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-dark)', fontWeight: 600, marginBottom: '4px' }}>No sales yet</p>
              <p style={{ fontSize: '0.82rem', color: '#A89688', marginBottom: '16px' }}>Your top products will appear here once you start selling.</p>
              <button onClick={() => setActivePanel('listings')} style={{ padding: '9px 18px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, background: '#823E0B', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Manage Listings
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topProducts.map(([name, revenue], i) => {
                // Look up the product image by matching name
                const matchedProduct = products.find(p =>
                  p.name.toLowerCase() === name.toLowerCase() ||
                  p.name.toLowerCase().includes(name.toLowerCase()) ||
                  name.toLowerCase().includes(p.name.toLowerCase())
                );
                const imgSrc = matchedProduct?.image;
                const rankColors = ['#823E0B', '#7B7B7B', '#A0672A'];
                return (
                  <motion.div
                    key={i}
                    whileHover={{ x: 4, background: '#FDF5EE' }}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#FAFAF9', borderRadius: '10px', transition: 'all 0.15s', border: '1px solid #F0EBE4' }}
                  >
                    {/* Product image with rank badge */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '8px', overflow: 'hidden', background: '#E8E0D8', border: '1px solid #EDE8E2' }}>
                        {imgSrc
                          ? <img src={imgSrc} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={18} style={{ color: '#B8A89A' }} /></div>
                        }
                      </div>
                      {/* Rank badge */}
                      <div style={{
                        position: 'absolute', bottom: '-4px', right: '-4px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: rankColors[i] ?? '#A89688',
                        color: '#fff', fontSize: '0.6rem', fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid #fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }}>
                        {i + 1}
                      </div>
                    </div>

                    <span style={{ flex: 1, fontWeight: 500, color: 'var(--text-dark)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '0.875rem', flexShrink: 0 }}>₱{revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Recent Listings */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.52, duration: 0.4 }}
          style={{ background: '#fff', border: '1px solid #EDE8E2', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(130,62,11,0.06)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark)' }}>Recent Listings</h3>
            <button onClick={() => setActivePanel('listings')} style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Manage All <ArrowUpRight size={13} />
            </button>
          </div>
          {products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FDF5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Package size={26} color="#823E0B" />
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-dark)', fontWeight: 600, marginBottom: '4px' }}>No listings yet</p>
              <p style={{ fontSize: '0.82rem', color: '#A89688', marginBottom: '16px' }}>Showcase your crafts to thousands of buyers.</p>
              <button onClick={() => navigate('/admin')} style={{ padding: '9px 18px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, background: '#823E0B', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Add Your First Product
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {products.slice(0, 5).map((item) => (
                <motion.div
                  key={item.id}
                  whileHover={{ x: 4, background: '#FDF5EE' }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#FAFAF9', borderRadius: '10px', border: '1px solid #F0EBE4', transition: 'all 0.15s' }}
                >
                  <div style={{ width: '44px', height: '44px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, background: '#E8E0D8', border: '1px solid #EDE8E2' }}>
                    {item.image
                      ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={18} style={{ color: '#B8A89A' }} /></div>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#A89688', marginTop: '1px' }}>{item.category} · Listed {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent-color)', fontSize: '0.875rem' }}>₱{(productPrices[item.id] ?? item.price ?? 0).toLocaleString()}</span>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '2px 7px', borderRadius: '999px',
                      background: item.status === 'active' ? '#ECFDF5' : '#FEF9C3',
                      color: item.status === 'active' ? '#065F46' : '#854D0E',
                    }}>{item.status}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
function ListingsPanel({ products, productPrices, onProductsUpdated, loadingProducts }: { products: Product[]; productPrices: Record<string, number>; onProductsUpdated: (updated: Product[]) => void; loadingProducts: boolean }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<{ materials: string; technique: string }>({ materials: '', technique: '' });
  const [saving, setSaving] = useState(false);
  const [variations, setVariations] = useState<{ id?: string; dimensions: string; height: string; openingDiameter: string; price: string; stock: string }[]>([]);
  const [editError, setEditError] = useState('');
  const [archiveError, setArchiveError] = useState('');

  async function openEdit(p: Product) {
    setEditing(p);
    setForm({
      materials: p.materials || '',
      technique: p.technique || '',
    });

    const { data } = await supabase
      .from('product_variations')
      .select('*')
      .eq('product_id', p.id)
      .order('sort_order');
    if (data) {
      setVariations(data.map((v: any) => ({
        id: v.id, dimensions: v.dimensions, height: v.height, openingDiameter: v.opening_diameter,
        price: v.price != null ? String(v.price) : '', stock: String(v.stock),
      })));
    } else {
      setVariations([]);
    }
  }

  function addVariation() {
    setVariations(prev => [...prev, { dimensions: '', height: '', openingDiameter: '', price: '', stock: '' }]);
  }

  function updateVariation(index: number, field: string, value: string) {
    setVariations(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }

  function removeVariation(index: number) {
    setVariations(prev => prev.filter((_, i) => i !== index));
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setEditError('');
    const { error } = await supabase
      .from('products')
      .update({
        materials: form.materials,
        technique: form.technique,
      })
      .eq('id', editing.id);
    if (error) { setEditError('Failed to save: ' + error.message); setSaving(false); return; }

    for (const v of variations) {
      if (!v.dimensions.trim() && !v.height.trim() && !v.openingDiameter.trim()) continue;
      if (v.id) {
        await supabase.from('product_variations').update({
          dimensions: v.dimensions.trim() || 'N/A',
          height: v.height.trim() || 'N/A',
          opening_diameter: v.openingDiameter.trim() || 'N/A',
          price: v.price ? Number(v.price) : null, stock: Number(v.stock) || 0,
        }).eq('id', v.id);
      } else {
        await supabase.from('product_variations').insert({
          product_id: editing.id,
          dimensions: v.dimensions.trim() || 'N/A',
          height: v.height.trim() || 'N/A',
          opening_diameter: v.openingDiameter.trim() || 'N/A',
          price: v.price ? Number(v.price) : null, stock: Number(v.stock) || 0,
          sort_order: variations.indexOf(v),
        });
      }
    }

    const existingIds = variations.filter(v => v.id).map(v => v.id);
    if (existingIds.length > 0) {
      await supabase.from('product_variations').delete()
        .eq('product_id', editing.id)
        .not('id', 'in', `(${existingIds.join(',')})`);
    } else {
      await supabase.from('product_variations').delete().eq('product_id', editing.id);
    }

    // Recompute product-level stock from variations
    const newTotalStock = await recomputeProductStock(editing.id);

    setSaving(false);
    const updated = products.map(p => p.id === editing.id ? { ...p, ...form, stock: newTotalStock, inStock: newTotalStock > 0 } : p);
    onProductsUpdated(updated);
    setEditing(null);
  }

  async function archiveProduct(p: Product) {
    if (!confirm(`Archive "${p.name}"? It will be hidden from the gallery.`)) return;
    setArchiveError('');
    const { error } = await supabase
      .from('products')
      .update({ status: 'archived' })
      .eq('id', p.id);
    if (error) { setArchiveError('Failed to archive: ' + error.message); return; }
    onProductsUpdated(products.filter(item => item.id !== p.id));
  }

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>My Listings</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>Manage and track all your listings</p>
      </div>

      {(editError || archiveError) && (
        <div style={{ padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', background: '#FEE2E2', color: '#991B1B', fontSize: '0.9rem', fontWeight: 500, border: '1px solid #FECACA' }}>
          {editError || archiveError}
        </div>
      )}

      {loadingProducts ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '16px 18px', border: '1px solid #eee', borderRadius: '10px', background: '#fff' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-secondary)' }}>
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ height: '16px', width: '60%', borderRadius: '4px', background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                <div style={{ height: '12px', width: '40%', borderRadius: '4px', marginTop: '8px', background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                <div style={{ height: '24px', width: '60px', borderRadius: '4px', background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '48px 20px' }}>No listings yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {products.map((item) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: '18px',
              padding: '16px 18px', border: '1px solid #eee', borderRadius: '10px',
              background: '#fff'
            }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '8px',
                overflow: 'hidden', flexShrink: 0, background: 'var(--bg-secondary)'
              }}>
                <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-dark)', marginBottom: '2px' }}>{item.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginBottom: '6px' }}>{item.category}</div>
                <div style={{ fontSize: '0.78rem', color: item.stock === 0 ? '#d32f2f' : item.stock <= 3 ? '#E67E22' : 'var(--text-light)' }}>
                  Stock: {item.stock}
                  {item.stock === 0 && ' (Out of Stock)'}
                  {item.stock > 0 && item.stock <= 3 && ' (Low)'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent-color)', marginBottom: '6px' }}>₱{(productPrices[item.id] ?? item.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                    fontSize: '0.72rem', fontWeight: 600, textTransform: 'capitalize',
                    background: item.status === 'active' ? '#E8F5E9' : '#FFF3E0',
                    color: item.status === 'active' ? '#2E7D32' : '#E65100'
                  }}>{item.status}</span>
                </div>
                <button onClick={() => openEdit(item)} style={{
                  padding: '8px 16px', border: '1.5px solid var(--primary-color)', borderRadius: '8px',
                  background: 'transparent', color: 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>Edit</button>
                <button onClick={() => archiveProduct(item)} style={{
                  padding: '8px 16px', border: '1.5px solid #d32f2f', borderRadius: '8px',
                  background: 'transparent', color: '#d32f2f', fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>Archive</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }} onClick={() => setEditing(null)}>
          <div style={{
            background: '#fff', borderRadius: '16px', width: '900px', maxWidth: '100%',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '24px 32px', borderBottom: '1px solid #E8E0D8', flexShrink: 0,
            }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2C1810', margin: 0 }}>Edit Listing</h2>
                <p style={{ fontSize: '0.82rem', color: '#8C7B6E', margin: '4px 0 0' }}>{editing.name}</p>
              </div>
              <button onClick={() => setEditing(null)} style={{
                width: '36px', height: '36px', borderRadius: '10px', border: '1.5px solid #E8E0D8',
                background: '#fff', fontSize: '1.2rem', cursor: 'pointer', color: '#8C7B6E',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#d32f2f'; e.currentTarget.style.color = '#d32f2f'; e.currentTarget.style.background = '#fdecea'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E0D8'; e.currentTarget.style.color = '#8C7B6E'; e.currentTarget.style.background = '#fff'; }}
              >&#x2715;</button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

              {/* Section: Product Specifications */}
              <div style={{ marginBottom: '28px' }}>
                <h3 style={{
                  fontSize: '0.78rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: '16px', paddingBottom: '10px',
                  borderBottom: '1px solid #F0EBE5',
                }}>Product Specifications</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#5A4A3E', marginBottom: '6px' }}>Material</label>
                    <input type="text" value={form.materials} onChange={e => setForm({ ...form, materials: e.target.value })}
                      placeholder="e.g. Terracotta Clay"
                      style={{
                        width: '100%', padding: '11px 14px', border: '1.5px solid #E8E0D8', borderRadius: '10px',
                        fontSize: '0.88rem', boxSizing: 'border-box', color: '#2C1810', background: '#FAF8F5',
                        outline: 'none', transition: 'border-color 0.15s',
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                      onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#5A4A3E', marginBottom: '6px' }}>Technique</label>
                    <input type="text" value={form.technique} onChange={e => setForm({ ...form, technique: e.target.value })}
                      placeholder="e.g. Handcrafted &amp; Kiln-Fired"
                      style={{
                        width: '100%', padding: '11px 14px', border: '1.5px solid #E8E0D8', borderRadius: '10px',
                        fontSize: '0.88rem', boxSizing: 'border-box', color: '#2C1810', background: '#FAF8F5',
                        outline: 'none', transition: 'border-color 0.15s',
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                      onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                    />
                  </div>
                </div>
              </div>

              {/* Section: Variations */}
              <div>
                <h3 style={{
                  fontSize: '0.78rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: '16px', paddingBottom: '10px',
                  borderBottom: '1px solid #F0EBE5',
                }}>Variations</h3>

                {variations.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    {variations.map((v, i) => (
                      <div key={i} style={{
                        border: '1.5px solid #E8E0D8', borderRadius: '12px', padding: '16px',
                        background: '#FAF8F5', position: 'relative',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 700, color: '#823E0B', textTransform: 'uppercase',
                            letterSpacing: '0.06em', background: 'rgba(130,62,11,0.08)', padding: '3px 10px',
                            borderRadius: '6px',
                          }}>Variation {i + 1}</span>
                          <button type="button" onClick={() => removeVariation(i)} style={{
                            background: 'none', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                            color: '#d32f2f', cursor: 'pointer', padding: '5px 12px', fontSize: '0.78rem',
                            fontWeight: 600, transition: 'all 0.15s',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#d32f2f'; e.currentTarget.style.background = '#fdecea'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E0D8'; e.currentTarget.style.background = 'none'; }}
                          >Remove</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Dimensions</label>
                            <input value={v.dimensions} onChange={e => updateVariation(i, 'dimensions', e.target.value)} placeholder="e.g. 15cm x 10cm"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Height</label>
                            <input value={v.height} onChange={e => updateVariation(i, 'height', e.target.value)} placeholder="e.g. 20cm"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Opening Diameter</label>
                            <input value={v.openingDiameter} onChange={e => updateVariation(i, 'openingDiameter', e.target.value)} placeholder="e.g. 8cm"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Price</label>
                            <input type="number" value={v.price} onChange={e => updateVariation(i, 'price', e.target.value)} placeholder="0.00"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#8C7B6E', marginBottom: '5px' }}>Stock</label>
                            <input type="number" value={v.stock} onChange={e => updateVariation(i, 'stock', e.target.value)} placeholder="0"
                              style={{
                                width: '100%', padding: '9px 12px', border: '1.5px solid #E8E0D8', borderRadius: '8px',
                                fontSize: '0.85rem', boxSizing: 'border-box', color: '#2C1810', background: '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = '#823E0B'}
                              onBlur={e => e.currentTarget.style.borderColor = '#E8E0D8'}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: '#B8A89A', marginBottom: '16px' }}>No variations added yet. Add a variation below.</p>
                )}

                <button type="button" onClick={addVariation} style={{
                  width: '100%', padding: '12px', border: '2px dashed #D4C8BB', borderRadius: '10px',
                  background: 'transparent', color: '#823E0B', fontWeight: 600, fontSize: '0.88rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.background = 'rgba(130,62,11,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add New Variation
                </button>
              </div>
            </div>

            {/* Sticky Footer */}
            <div style={{
              display: 'flex', gap: '12px', justifyContent: 'flex-end', padding: '16px 32px',
              borderTop: '1px solid #E8E0D8', background: '#fff', flexShrink: 0,
              borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px',
            }}>
              <button onClick={() => setEditing(null)} style={{
                padding: '11px 24px', border: '1.5px solid #D4C8BB', borderRadius: '10px',
                background: '#fff', color: '#5A4A3E', fontSize: '0.88rem', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.color = '#823E0B'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4C8BB'; e.currentTarget.style.color = '#5A4A3E'; }}
              >Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{
                padding: '11px 28px', border: 'none', borderRadius: '10px',
                background: saving ? '#B8A89A' : '#823E0B', color: '#fff', fontSize: '0.88rem', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                boxShadow: saving ? 'none' : '0 2px 8px rgba(130,62,11,0.25)',
              }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#6B3209'; }}
                onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#823E0B'; }}
              >{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VaultPanel({ products, productPrices, onProductsUpdated }: { products: Product[]; productPrices: Record<string, number>; onProductsUpdated: (updated: Product[]) => void }) {
  const archived = products.filter(p => p.status === 'archived');
  const [restoreError, setRestoreError] = useState('');

  async function restoreProduct(p: Product) {
    setRestoreError('');
    const { error } = await supabase
      .from('products')
      .update({ status: 'active' })
      .eq('id', p.id);
    if (error) { setRestoreError('Failed to restore: ' + error.message); return; }
    onProductsUpdated(products.map(item => item.id === p.id ? { ...item, status: 'active' } : item));
  }

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>Design Vault</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>Archived listings — restore them to make visible again</p>
      </div>
      {restoreError && (
        <div style={{ padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', background: '#FEE2E2', color: '#991B1B', fontSize: '0.9rem', fontWeight: 500 }}>
          {restoreError}
        </div>
      )}
      {archived.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#D4C8BB" strokeWidth="1.5" style={{ width: '56px', height: '56px', margin: '0 auto 16px' }}>
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>No archived listings. Archive a product from "My Listings" to see it here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {archived.map((item) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: '18px',
              padding: '16px 18px', border: '1px solid #eee', borderRadius: '10px',
              background: '#fff', opacity: 0.8,
            }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '8px',
                overflow: 'hidden', flexShrink: 0, background: 'var(--bg-secondary)'
              }}>
                <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(30%)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-dark)', marginBottom: '2px' }}>{item.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginBottom: '6px' }}>{item.category}</div>
                <div style={{ fontSize: '0.78rem', color: item.stock === 0 ? '#d32f2f' : item.stock <= 3 ? '#E67E22' : 'var(--text-light)' }}>
                  Stock: {item.stock}
                  {item.stock === 0 && ' (Out of Stock)'}
                  {item.stock > 0 && item.stock <= 3 && ' (Low)'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent-color)', marginBottom: '6px' }}>₱{(productPrices[item.id] ?? item.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                    fontSize: '0.72rem', fontWeight: 600, textTransform: 'capitalize',
                    background: '#FFF3E0', color: '#E65100'
                  }}>archived</span>
                </div>
                <button onClick={() => restoreProduct(item)} style={{
                  padding: '8px 16px', border: '1.5px solid #2E7D32', borderRadius: '8px',
                  background: 'transparent', color: '#2E7D32', fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>Restore</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestsPanel() {
  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>Requests</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>Custom order requests from buyers</p>
      </div>
      <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '48px 20px' }}>No requests yet.</p>
    </div>
  );
}

function OrdersPanel({ shopId, shopName, loadingOrders, setLoadingOrders }: { shopId: string | null; shopName?: string; loadingOrders: boolean; setLoadingOrders: (v: boolean) => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [updateError, setUpdateError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { if (shopId) fetchOrders(); }, [shopId, shopName]);

  // Realtime: listen for new/updated orders for this shop
  useEffect(() => {
    if (!shopId || !shopName) return;

    const channel = supabase
          .channel(`shop-orders:${shopId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'orders', filter: `shop_id=eq.${shopId}` },
            (payload) => {
              setOrders(prev => [payload.new, ...prev]);
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders', filter: `shop_id=eq.${shopId}` },
            (payload) => {
              setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
            }
          )
          .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, shopName]);

  useEffect(() => {
    const orderId = searchParams.get('orderId');
    if (orderId && orders.length > 0) {
      const match = orders.find((o) => o.id === orderId);
      if (match) {
        setSelectedOrder(match);
        const params = new URLSearchParams(searchParams);
        params.delete('orderId');
        setSearchParams(params, { replace: true });
      }
    }
  }, [orders, searchParams]);

  async function fetchOrders() {
    setLoadingOrders(true);
    try {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (!data) return;

      const shopOrders: any[] = [];
      for (const order of data) {
        const items = order.items || [];
        const shopItems = items.filter((i: any) => i.shop_id === shopId || (!!shopName && i.shop_name === shopName));
        if (shopItems.length > 0) {
          for (const item of shopItems) {
            const paymentStatus = order.status || 'pending';
            shopOrders.push({
              id: order.id,
              item_name: item.product_name || '',
              item_image: item.image || '',
              item_qty: item.qty || 1,
              item_price: item.price || 0,
              item_variation: item.variation || '',
              payment_status: paymentStatus === 'pending' ? 'Pending' : paymentStatus === 'paid' || paymentStatus === 'completed' ? 'Paid' : paymentStatus === 'refunded' ? 'Refunded' : 'Cancelled',
              delivery_status: order.delivery_status || 'pending',
              total: order.total,
              shipping_fee: order.shipping_fee || 0,
              subtotal: order.subtotal || 0,
              delivery_option: order.delivery_option || 'pickup',
              created_at: order.created_at,
              user_name: order.user_name || '',
              user_phone: order.user_phone || '',
              user_address: order.user_address || '',
              buyer_email: order.buyer_email || '',
            });
          }
        }
      }
      setOrders(shopOrders);
    } catch (e) {
      console.error('Orders fetch error:', e);
    } finally {
      setLoadingOrders(false);
    }
  }

  async function updateDeliveryStatus(orderId: string, newStatus: string) {
    setUpdateError('');
    const updates: Record<string, string> = {};
    if (newStatus === 'cancelled') {
      updates.status = 'cancelled';
    } else {
      updates.delivery_status = newStatus;
      if (newStatus === 'completed') updates.status = 'completed';
    }
    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId);
    if (error) { setUpdateError('Failed: ' + error.message); return; }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...(newStatus === 'cancelled' ? { status: 'cancelled' } : { delivery_status: newStatus, ...(newStatus === 'completed' ? { status: 'completed' } : {}) }) } : o));

    // Create notification for buyer (non-blocking, toast on failure)
    createBuyerNotification(orderId, newStatus).catch(err => {
      console.error('Failed to create notification:', err);
      toast.error('Order updated but notification failed to send');
    });
  }

  const deliveryBadge = (status: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
      pending: { bg: '#FFF3E0', color: '#E65100' },
      preparing: { bg: '#E3F2FD', color: '#1565C0' },
      shipped: { bg: '#F3E5F5', color: '#6A1B9A' },
      delivered: { bg: '#E8F5E9', color: '#2E7D32' },
      completed: { bg: '#E8F5E9', color: '#1B5E20' },
      cancelled: { bg: '#FFEBEE', color: '#C62828' },
    };
    const s = styles[status] || styles.pending;
    return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: s.bg, color: s.color, textTransform: 'capitalize' }}>{status}</span>;
  };

  const paymentBadge = (status: string) => {
    const bg = status === 'Paid' ? '#E8F5E9' : status === 'Cancelled' ? '#FFEBEE' : '#FFF3E0';
    const color = status === 'Paid' ? '#2E7D32' : status === 'Cancelled' ? '#C62828' : '#E65100';
    return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: bg, color: color }}>{status}</span>;
  };

  const filtered = orders
    .filter(o => {
      if (filterStatus === 'cancelled' && o.status !== 'cancelled') return false;
      if (filterStatus !== 'all' && filterStatus !== 'cancelled' && o.delivery_status !== filterStatus) return false;
      if (search && !o.item_name.toLowerCase().includes(search.toLowerCase()) && !o.id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => sortOrder === 'newest' ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>Shop Orders</h1>
      </div>

      {updateError && (
        <div style={{ padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', background: '#FEE2E2', color: '#991B1B', fontSize: '0.9rem', fontWeight: 500, border: '1px solid #FECACA' }}>
          {updateError}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2.5" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', height: '15px', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search order..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 38px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', background: '#fff', color: 'var(--text-dark)', boxSizing: 'border-box' }} />
        </div>
<select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
        style={{ padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', background: '#fff', color: 'var(--text-dark)', cursor: 'pointer' }}>
  <option value="all">Filter Order Status</option>
  <option value="pending">Pending</option>
  <option value="preparing">Preparing</option>
  <option value="shipped">Shipped</option>
  <option value="delivered">Delivered</option>
  <option value="completed">Completed</option>
  <option value="cancelled">Cancelled</option>
</select>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}
          style={{ padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem', outline: 'none', background: '#fff', color: 'var(--text-dark)', cursor: 'pointer' }}>
          <option value="newest">Sort (Newest)</option>
          <option value="oldest">Sort (Oldest)</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E8E0D8', textAlign: 'left' }}>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order ID</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Item</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-light)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingOrders ? (
              [1,2,3,4,5].map(i => (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f0eb' }}>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton" style={{ height: '16px', width: '60px', borderRadius: '4px' }}></div></td>
                      <td style={{ padding: '14px 18px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div className="shimmer-skeleton" style={{ width: '44px', height: '44px', borderRadius: '6px' }}></div></div></td>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton" style={{ height: '20px', width: '80px', borderRadius: '20px' }}></div></td>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton" style={{ height: '20px', width: '80px', borderRadius: '20px' }}></div></td>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton" style={{ height: '20px', width: '80px', borderRadius: '4px' }}></div></td>
                      <td style={{ padding: '14px 18px' }}><div className="shimmer-skeleton-warm" style={{ height: '30px', width: '100px', borderRadius: '6px' }}></div></td>
                    </tr>
                  ))
              ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '48px 18px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FDF5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <ShoppingBag size={26} color="#823E0B" />
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-dark)', fontWeight: 600, marginBottom: '4px' }}>No orders found</p>
                  <p style={{ fontSize: '0.82rem', color: '#A89688' }}>Try adjusting your filters or date range.</p>
                </div>
              </td></tr>
            ) : filtered.map((order) => (
              <tr key={`${order.id}-${order.item_name}`} onClick={() => setSelectedOrder(order)} style={{ borderBottom: '1px solid #f5f0eb', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FDF8F4')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-dark)', fontSize: '0.82rem' }}>{order.id.slice(0, 8).toUpperCase()}</td>
                <td style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={order.item_image} alt={order.item_name} style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, background: 'var(--bg-secondary)' }} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '2px' }}>{order.item_name}</div>
                      {order.item_variation && <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '2px' }}>{displayVariation(order.item_variation)}</div>}
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>Qty: {order.item_qty}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 18px' }}>{paymentBadge(order.payment_status)}</td>
                <td style={{ padding: '14px 18px' }}>{deliveryBadge(order.delivery_status)}</td>
                <td style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--accent-color)' }}>{'\u20B1'}{(order.item_price * order.item_qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: '14px 18px' }}>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {/* Cancelled orders: show Remove Order button */}
                                    {(order.payment_status === 'Cancelled' || order.status === 'cancelled') && (
                                      <button onClick={(e) => { e.stopPropagation(); if (confirm('Are you sure you want to remove this order? This action cannot be undone.')) { updateDeliveryStatus(order.id, 'cancelled'); } }}
                                        style={{ padding: '5px 12px', border: '1.5px solid #d32f2f', borderRadius: '6px', background: '#d32f2f', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Remove Order</button>
                                    )}
                                    {/* Active orders: show action buttons based on delivery status */}
                                    {order.delivery_status === 'pending' && order.payment_status !== 'Cancelled' && order.status !== 'cancelled' && (
                                      <>
                                        <button onClick={(e) => { e.stopPropagation(); updateDeliveryStatus(order.id, 'preparing'); }}
                                          style={{ padding: '5px 12px', border: '1.5px solid #1565C0', borderRadius: '6px', background: '#1565C0', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Confirm Order</button>
                                      </>
                                    )}
                    {order.delivery_status === 'preparing' && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); updateDeliveryStatus(order.id, 'shipped'); }}
                          style={{ padding: '5px 12px', border: '1.5px solid #ED6C02', borderRadius: '6px', background: '#ED6C02', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Hand to Courier</button>
                      </>
                    )}
                    {order.delivery_status === 'shipped' && (
                      <button onClick={(e) => { e.stopPropagation(); updateDeliveryStatus(order.id, 'delivered'); }}
                        style={{ padding: '5px 12px', border: '1.5px solid #2E7D32', borderRadius: '6px', background: '#2E7D32', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Mark Delivered</button>
                    )}
                    {order.delivery_status === 'delivered' && (
                      <button onClick={(e) => { e.stopPropagation(); updateDeliveryStatus(order.id, 'completed'); }}
                        style={{ padding: '5px 12px', border: '1.5px solid #1B5E20', borderRadius: '6px', background: '#1B5E20', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Complete</button>
                    )}
                    {order.delivery_status === 'completed' && (
                      <span style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#2E7D32' }}>Completed</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Buyer Detail Modal */}
      {selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setSelectedOrder(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '420px', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #E8E0D8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Order #{selectedOrder.id.slice(0, 8).toUpperCase()}</h3>
                <button onClick={() => setSelectedOrder(null)}
                  style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8C7B6E', fontSize: '1.1rem' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#d32f2f'; e.currentTarget.style.color = '#d32f2f'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E0D8'; e.currentTarget.style.color = '#8C7B6E'; }}>&#x2715;</button>
              </div>
            </div>

            {/* Buyer Info */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid #E8E0D8', background: '#FDF8F4' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Buyer Information</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#8C7B6E', width: '60px', flexShrink: 0 }}>Name</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)' }}>{selectedOrder.user_name || '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#8C7B6E', width: '60px', flexShrink: 0 }}>Phone</span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-dark)' }}>{selectedOrder.user_phone || '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#8C7B6E', width: '60px', flexShrink: 0 }}>Address</span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-dark)', lineHeight: 1.4 }}>{selectedOrder.user_address || '—'}</span>
                </div>
              </div>
            </div>

            {/* Item Summary */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid #E8E0D8' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8C7B6E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Item Summary</div>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <img src={selectedOrder.item_image} alt="" style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #E8E0D8' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '2px' }}>{selectedOrder.item_name}</div>
                  {selectedOrder.item_variation && <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{displayVariation(selectedOrder.item_variation)}</div>}
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>Qty: {selectedOrder.item_qty}</div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--accent-color)', fontSize: '1rem' }}>{'\u20B1'}{(selectedOrder.item_price * selectedOrder.item_qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              {(selectedOrder.shipping_fee > 0 || selectedOrder.delivery_option === 'courier') && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #E8E0D8' }}>
                  <span style={{ fontSize: '0.82rem', color: '#8C7B6E' }}>Shipping Fee{selectedOrder.delivery_option === 'pickup' ? ' (Pickup)' : ''}</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)' }}>{'\u20B1'}{(selectedOrder.shipping_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            {/* Status Row */}
            <div style={{ padding: '20px 28px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#8C7B6E', marginBottom: '4px' }}>Payment</div>
                {(() => {
                  const bg = selectedOrder.payment_status === 'Paid' ? '#E8F5E9' : selectedOrder.payment_status === 'Cancelled' ? '#FFEBEE' : '#FFF3E0';
                  const color = selectedOrder.payment_status === 'Paid' ? '#2E7D32' : selectedOrder.payment_status === 'Cancelled' ? '#C62828' : '#E65100';
                  return <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, background: bg, color: color }}>{selectedOrder.payment_status}</span>;
                })()}
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#8C7B6E', marginBottom: '4px' }}>Delivery</div>
                {(() => {
                  const styles: Record<string, { bg: string; color: string }> = {
                    pending: { bg: '#FFF3E0', color: '#E65100' }, preparing: { bg: '#E3F2FD', color: '#1565C0' },
                    shipped: { bg: '#F3E5F5', color: '#6A1B9A' }, delivered: { bg: '#E8F5E9', color: '#2E7D32' },
                    completed: { bg: '#E8F5E9', color: '#1B5E20' }, cancelled: { bg: '#FFEBEE', color: '#C62828' },
                  };
                  const s = styles[selectedOrder.delivery_status] || styles.pending;
                  return <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, background: s.bg, color: s.color, textTransform: 'capitalize' }}>{selectedOrder.delivery_status}</span>;
                })()}
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#8C7B6E', marginBottom: '4px' }}>Order Total</div>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark)' }}>{'\u20B1'}{selectedOrder.total?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '—'}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '16px 28px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedOrder(null)}
                style={{ padding: '10px 24px', borderRadius: '8px', border: '1.5px solid #E8E0D8', background: '#fff', color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Close</button>
              {(selectedOrder.payment_status === 'Cancelled' || selectedOrder.status === 'cancelled') && (
                <button onClick={() => { if (confirm('Are you sure you want to remove this order? This action cannot be undone.')) { updateDeliveryStatus(selectedOrder.id, 'cancelled'); setSelectedOrder(null); } }}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#d32f2f', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Remove Order</button>
              )}
              {selectedOrder.delivery_status === 'pending' && selectedOrder.payment_status !== 'Cancelled' && selectedOrder.status !== 'cancelled' && (
                <button onClick={() => { updateDeliveryStatus(selectedOrder.id, 'preparing'); setSelectedOrder(null); }}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Confirm Order</button>
              )}
              {selectedOrder.delivery_status === 'preparing' && (
                <button onClick={() => { updateDeliveryStatus(selectedOrder.id, 'shipped'); setSelectedOrder(null); }}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#6A1B9A', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Hand to Courier</button>
              )}
              {selectedOrder.delivery_status === 'shipped' && (
                <button onClick={() => { updateDeliveryStatus(selectedOrder.id, 'delivered'); setSelectedOrder(null); }}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#2E7D32', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Mark Delivered</button>
              )}
              {selectedOrder.delivery_status === 'delivered' && (
                <button onClick={() => { updateDeliveryStatus(selectedOrder.id, 'completed'); setSelectedOrder(null); }}
                  style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#1565C0', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Complete</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessagesPanel({ shopId, loadingMessages, setLoadingMessages }: { shopId: string | null; loadingMessages: boolean; setLoadingMessages: (v: boolean) => void }) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [artisanUserId, setArtisanUserId] = useState<string | null>(null);
  const [convSearch, setConvSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => { init(); }, [shopId]);
  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv.id);
      // Scroll to bottom after switching conversation
      setTimeout(() => {
        const container = document.querySelector('.chat-messages-area');
        if (container) container.scrollTop = container.scrollHeight;
      }, 100);
    }
  }, [selectedConv]);
  useEffect(() => {
    const container = document.querySelector('.chat-messages-area');
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom || messages.length <= 1) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    }
  }, [messages]);

  // Real-time: subscribe to messages for active conversation
  useEffect(() => {
    if (!selectedConv) return;
    const channel = supabase
      .channel(`artisan-messages:${selectedConv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConv.id}` }, async (payload) => {
        const newMsg = payload.new as any;
        setMessages(prev => {
          if (prev.some((m: any) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        // Incoming (buyer) message → increment this artisan's unread counter.
        if (artisanUserId && newMsg.sender_id !== artisanUserId) {
          await supabase.from('conversations').update({ artisan_unread: (selectedConv.artisan_unread || 0) + 1 }).eq('id', selectedConv.id);
        }
        setConversations(prev => prev.map((c: any) => c.id === selectedConv.id ? { ...c, last_message: newMsg.text, last_message_at: newMsg.created_at } : c));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConv?.id]);

  // When a conversation is opened, mark it read for the artisan.
    useEffect(() => {
      async function markAsRead() {
        if (selectedConv && selectedConv.artisan_unread > 0) {
          setConversations(prev => prev.map((c: any) => c.id === selectedConv.id ? { ...c, artisan_unread: 0 } : c));
          await supabase.from('conversations').update({ artisan_unread: 0 }).eq('id', selectedConv.id);
        }
      }
      markAsRead();
    }, [selectedConv?.id, selectedConv?.artisan_unread]);

  async function init() {
        try {
          if (user) setArtisanUserId(user.id);
          if (shopId) {
            const { data } = await supabase
              .from('conversations').select('*, buyer_id').eq('shop_id', shopId)
              .order('last_message_at', { ascending: false });
            if (data) {
              // Enrich conversations with fresh buyer names from user_metadata
              const enriched = await Promise.all(data.map(async (c: any) => {
                if (c.buyer_name && c.buyer_name !== 'Buyer') return c;
                // Fetch fresh name from auth.users via RPC or fallback
                const { data: userData } = await supabase.auth.admin.getUserById(c.buyer_id);
                const userMeta = userData?.user?.user_metadata || {};
                const freshName = userMeta.name || userData?.user?.email || 'Buyer';
                return { ...c, buyer_name: freshName };
              }));
              setConversations(enriched);
            }
          }
        } catch (e) {
          console.error('Messages init error:', e);
        } finally {
          setLoadingMessages(false);
        }
      }

    // Realtime: listen for new conversations for this shop
    useEffect(() => {
      if (!shopId) return;
      const channel = supabase
        .channel(`shop-conversations:${shopId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations', filter: `shop_id=eq.${shopId}` }, (payload) => {
          const newConv = payload.new as any;
          setConversations(prev => [newConv, ...prev]);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `shop_id=eq.${shopId}` }, (payload) => {
          const updated = payload.new as any;
          setConversations(prev => prev.map(c => c.id === updated.id ? { ...c, last_message: updated.last_message, last_message_at: updated.last_message_at } : c));
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }, [shopId]);

  async function fetchMessages(convId: string) {
    const { data } = await supabase
      .from('messages').select('*').eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  }

  async function sendMessage() {
    if ((!newMessage.trim() && !pendingImage) || !selectedConv || !artisanUserId) return;
    const text = newMessage.trim();
    setNewMessage('');
    setUploading(true);
    try {
      let imageUrl: string | null = null;
      if (pendingImage) {
        const path = `chat/${selectedConv.id}/${Date.now()}-${pendingImage.name.replace(/[^a-zA-Z0-9.\-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('products').upload(path, pendingImage, { cacheControl: '3600', upsert: false });
        if (upErr) { console.error('Upload failed:', upErr.message); setUploading(false); return; }
        const { data } = supabase.storage.from('products').getPublicUrl(path);
        imageUrl = data.publicUrl;
      }
      const { data } = await supabase
        .from('messages')
        .insert({ conversation_id: selectedConv.id, sender_id: artisanUserId, text, image_url: imageUrl })
        .select().single();
      if (data) {
        setMessages(prev => [...prev, data]);
        await supabase.from('conversations').update({ last_message: text || '📷 Image', last_message_at: new Date().toISOString() }).eq('id', selectedConv.id);
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, last_message: text || '📷 Image', last_message_at: new Date().toISOString() } : c));
      }
    } finally {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setPendingImage(null);
      setImagePreview(null);
      setUploading(false);
    }
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPendingImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
    if (e.target) e.target.value = '';
  }

  async function deleteConversation(convId: string) {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    await supabase.from('messages').delete().eq('conversation_id', convId);
    await supabase.from('conversations').delete().eq('id', convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (selectedConv?.id === convId) { setSelectedConv(null); setMessages([]); }
  }


  const filteredConvs = conversations.filter(c => {
    const q = convSearch.toLowerCase();
    return !q || c.buyer_name?.toLowerCase().includes(q) || c.buyer_id?.toLowerCase().includes(q);
  });

  // ── Responsive breakpoints ──
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile  = winW < 768;   // single pane
  const isTablet  = winW < 1100;  // hide right info panel
  const showList  = !isMobile || !selectedConv;
  const showChat  = !isMobile || !!selectedConv;

  // Sidebar width shrinks on tablet
  const listW = isMobile ? '100%' : isTablet ? '240px' : '280px';
  const infoW = '240px';


  return (
    <div style={{
      display: 'flex',
      height: isMobile ? 'calc(100vh - 140px)' : 'calc(100vh - 160px)',
      background: '#F7F3EE', borderRadius: '16px',
      overflow: 'hidden', border: '1px solid #EDE8E2',
      boxShadow: '0 2px 12px rgba(130,62,11,0.06)',
    }}>

      {/* ── LEFT: Conversation List ── */}
      {showList && (
      <div style={{ width: listW, background: '#fff', borderRight: isMobile ? 'none' : '1px solid #EDE8E2', display: 'flex', flexDirection: 'column', flexShrink: 0, transition: 'width 0.2s' }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid #F0EBE4' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-dark)', margin: '0 0 12px', letterSpacing: '-0.01em' }}>Messages</h2>
          <div style={{ position: 'relative' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#B8A89A" strokeWidth="2.5" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text" placeholder="Search conversations..." value={convSearch}
              onChange={e => setConvSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #EDE8E2', borderRadius: '10px', fontSize: '0.82rem', outline: 'none', background: '#FAFAF9', color: 'var(--text-dark)', boxSizing: 'border-box', fontFamily: 'var(--font-sans)' }}
            />
          </div>
        </div>

        {/* Conversation items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingMessages ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 18px', borderBottom: '1px solid #F7F3EE' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(90deg, #F0EBE4 25%, #F7F3EE 50%, #F0EBE4 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ height: '14px', width: '50%', background: 'linear-gradient(90deg, #F0EBE4 25%, #F7F3EE 50%, #F0EBE4 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '4px' }} />
                    <div style={{ height: '12px', width: '70%', marginTop: '4px', background: 'linear-gradient(90deg, #F0EBE4 25%, #F7F3EE 50%, #F0EBE4 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConvs.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', color: '#A89688' }}>
              <MessageSquare size={40} style={{ opacity: 0.25, marginBottom: '10px' }} />
              <p style={{ fontSize: '0.85rem' }}>No conversations yet.</p>
            </div>
          ) : (
            filteredConvs.map(conv => {
              const isActive = selectedConv?.id === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConv(conv)}
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '13px 18px', cursor: 'pointer',
                    transition: 'background 0.15s', borderBottom: '1px solid #F7F3EE',
                    background: isActive ? '#FDF5EE' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--primary-color)' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#FAFAF9'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Avatar */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {conv.buyer_avatar
                      ? <img src={conv.buyer_avatar} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }} />
                      : <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem' }}>{(conv.buyer_name || 'B').charAt(0)}</div>
                    }
                  </div>

                  {/* Name + preview */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.buyer_name || 'Buyer'}</span>
                      <span style={{ fontSize: '0.68rem', color: '#A89688', flexShrink: 0, marginLeft: '8px' }}>{formatTime(conv.last_message_at)}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#A89688', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '20px' }}>
                      {conv.last_message || 'Start a conversation'}
                    </div>
                  </div>

                  {conv.artisan_unread > 0 && (
                    <span style={{ position: 'absolute', top: '12px', right: '40px', minWidth: '18px', height: '18px', padding: '0 5px', borderRadius: '9px', background: '#E53935', color: '#fff', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>{conv.artisan_unread > 99 ? '99+' : conv.artisan_unread}</span>
                  )}

                  {/* Delete button */}
                  <button
                    onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                    title="Delete conversation"
                    style={{ position: 'absolute', top: '10px', right: '10px', width: '22px', height: '22px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#A89688', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s, color 0.15s, background 0.15s', padding: 0, zIndex: 1 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#d32f2f'; e.currentTarget.style.background = '#fdecea'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.color = '#A89688'; e.currentTarget.style.background = 'none'; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* ── CENTER: Chat ── */}
      {showChat && (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: '#F7F3EE' }}>
        {selectedConv ? (
          <>
            {/* Chat header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #EDE8E2', background: '#fff', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, boxShadow: '0 1px 4px rgba(130,62,11,0.05)' }}>
              {/* Back button — mobile only */}
              {isMobile && (
                <button
                  onClick={() => setSelectedConv(null)}
                  style={{ width: '34px', height: '34px', borderRadius: '8px', border: 'none', background: '#F7F3EE', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
              )}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {selectedConv.buyer_avatar
                  ? <img src={selectedConv.buyer_avatar} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem' }}>{(selectedConv.buyer_name || 'B').charAt(0)}</div>
                }
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-dark)' }}>{selectedConv.buyer_name || 'Buyer'}</div>
                <div style={{ fontSize: '0.72rem', color: '#8C7B6E', fontWeight: 500 }}>Active now</div>
              </div>
            </div>

            {/* Messages area */}
            <div className="chat-messages-area">
              {messages.length === 0 && (
                <div className="chat-empty-state-inner">
                  {selectedConv.buyer_avatar
                    ? <img src={selectedConv.buyer_avatar} alt="" style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', marginBottom: '12px' }} />
                    : <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.5rem', marginBottom: '12px' }}>{(selectedConv.buyer_name || 'B').charAt(0)}</div>
                  }
                  <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', color: 'var(--primary-color)', marginBottom: '4px' }}>Chat with {selectedConv.buyer_name || 'Buyer'}</h3>
                  <p style={{ fontSize: '0.85rem', color: '#A89688' }}>Send a message to start the conversation.</p>
                </div>
              )}

              <div className="msg-list">
                {(() => {
                  // Group consecutive messages by sender
                  const groups: { senderId: string; msgs: any[] }[] = [];
                  for (const msg of messages) {
                    const last = groups[groups.length - 1];
                    if (last && last.senderId === msg.sender_id) {
                      last.msgs.push(msg);
                    } else {
                      groups.push({ senderId: msg.sender_id, msgs: [msg] });
                    }
                  }

                  return groups.map((group, gi) => {
                    const isOut = group.senderId === artisanUserId;
                    const dir = isOut ? 'out' : 'in';
                    const lastMsg = group.msgs[group.msgs.length - 1];
                    const timestamp = new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div key={`g-${gi}`} className={`msg-group msg-group--${dir}`}>

                        {/* Bubbles */}
                        {group.msgs.map((msg: any, mi: number) => {
                          let productData: any = null;
                          let designData: any = null;
                          let text = msg.text;
                          try {
                            const p = JSON.parse(msg.text);
                            if (p.type === 'design_submission' || p.design) {
                              designData = p;
                              text = p.message;
                            } else if (p.type === 'product_inquiry') {
                              productData = p;
                              text = p.message;
                            }
                          } catch {}

                          const isLast = mi === group.msgs.length - 1;

                          return (
                            <div key={msg.id} className={`msg-row msg-row--${dir} msg-fade-in`}>

                              {/* Avatar — incoming only */}
                              {!isOut && (
                                isLast
                                  ? (
                                    <div className="msg-avatar">
                                      {selectedConv.buyer_avatar
                                        ? <img src={selectedConv.buyer_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.75rem' }}>{(selectedConv.buyer_name || 'B').charAt(0)}</span>
                                      }
                                    </div>
                                  )
                                  : <div className="msg-avatar-spacer" />
                              )}

                              {/* Product card + bubble */}
                              <div className={`msg-bubble-wrap msg-bubble-wrap--${dir}`}>
                                {designData ? (
                                  <DesignMessageCard data={designData} />
                                ) : productData?.productId ? (
                                  <a href={`/product/${productData.productId}`} target="_blank" rel="noopener noreferrer" className="chat-product-card">
                                    <img src={productData.productImage} alt={productData.productName} className="chat-product-img" />
                                    <div className="chat-product-info">
                                      <span className="chat-product-name">{productData.productName}</span>
                                      {productData.variantDimensions && <span className="chat-product-variant">{productData.variantDimensions}</span>}
                                      <span className="chat-product-price">{fmt(productData.productPrice || 0)}</span>
                                    </div>
                                  </a>
                                ) : null}
                                <div className={`msg-bubble msg-bubble--${dir}`}>
                                  {msg.image_url && (
                                    <a href={msg.image_url} target="_blank" rel="noopener noreferrer" className="chat-image-bubble">
                                      <img src={msg.image_url} alt="attachment" style={{ maxWidth: '220px', maxHeight: '220px', borderRadius: '12px', display: 'block', border: '1px solid rgba(0,0,0,0.08)' }} />
                                    </a>
                                  )}
                                  {text}
                                </div>
                              </div>

                            </div>
                          );
                        })}

                        {/* Timestamp — once per group */}
                        <div className={`msg-ts msg-ts--${dir}`}>
                          <span>{timestamp}</span>
                          {isOut && (
                            <span className="msg-ts-check">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          )}
                        </div>

                      </div>
                    );
                  });
                })()}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input bar */}
            <div style={{ padding: '12px 20px', background: '#fff', borderTop: '1px solid #EDE8E2', flexShrink: 0 }}>
              {imagePreview && (
                <div style={{ position: 'relative', display: 'inline-block', marginBottom: '10px' }}>
                  <img src={imagePreview} alt="preview" style={{ width: '96px', height: '96px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #EDE8E2' }} />
                  <button onClick={() => { URL.revokeObjectURL(imagePreview); setPendingImage(null); setImagePreview(null); }} style={{ position: 'absolute', top: '-8px', right: '-8px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#d32f2f', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>×</button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label title="Attach image" style={{ width: '42px', height: '42px', borderRadius: '50%', border: '1.5px solid #EDE8E2', background: '#FAFAF9', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                  <input type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
                </label>
                <input
                  type="text" placeholder="Type a message..." value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  style={{ flex: 1, padding: '10px 18px', border: '1.5px solid #EDE8E2', borderRadius: '24px', fontSize: '0.875rem', outline: 'none', background: '#FAFAF9', color: 'var(--text-dark)', fontFamily: 'var(--font-sans)', transition: 'border-color 0.15s' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--primary-color)'}
                  onBlur={e => e.currentTarget.style.borderColor = '#EDE8E2'}
                />
                <button
                  onClick={sendMessage} disabled={(!newMessage.trim() && !pendingImage) || uploading}
                  style={{ width: '42px', height: '42px', borderRadius: '50%', border: 'none', background: ((newMessage.trim() || pendingImage) && !uploading) ? 'var(--primary-color)' : '#D4C8BB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: ((newMessage.trim() || pendingImage) && !uploading) ? 'pointer' : 'not-allowed', flexShrink: 0, transition: 'background 0.15s', boxShadow: ((newMessage.trim() || pendingImage) && !uploading) ? '0 2px 8px rgba(130,62,11,0.3)' : 'none' }}
                >
                  {uploading ? <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'chatSpin 0.8s linear infinite' }} /> : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#A89688' }}>
            <MessageSquare size={56} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', color: 'var(--primary-color)', marginBottom: '4px' }}>Select a Conversation</h3>
            <p style={{ fontSize: '0.875rem' }}>Choose a buyer from the left to start replying.</p>
          </div>
        )}
      </div>
      )}

      {/* ── RIGHT: Buyer Info — hidden on tablet/mobile ── */}
      {!isTablet && (
      <div style={{ width: infoW, background: '#fff', borderLeft: '1px solid #EDE8E2', display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0 }}>
        {selectedConv ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 20px' }}>
            {selectedConv.buyer_avatar
              ? <img src={selectedConv.buyer_avatar} alt="" style={{ width: '76px', height: '76px', borderRadius: '50%', objectFit: 'cover', marginBottom: '12px', border: '3px solid #EDE8E2' }} />
              : <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.8rem', marginBottom: '12px' }}>{(selectedConv.buyer_name || 'B').charAt(0)}</div>
            }
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-dark)', marginBottom: '4px', textAlign: 'center' }}>{selectedConv.buyer_name || 'Buyer'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#8C7B6E', fontWeight: 500, marginBottom: '24px', justifyContent: 'center' }}>
              Active now
            </div>

            {/* Conversation info */}
            <div style={{ width: '100%', padding: '14px 16px', background: '#FAFAF9', borderRadius: '12px', marginBottom: '12px', border: '1px solid #F0EBE4' }}>
              <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#8C7B6E', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Conversation Info</h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dark)', lineHeight: 1.8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#A89688' }}>Started</span>
                  <span style={{ fontWeight: 500 }}>{new Date(selectedConv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#A89688' }}>Messages</span>
                  <span style={{ fontWeight: 500 }}>{messages.length}</span>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ width: '100%', padding: '14px 16px', background: '#FAFAF9', borderRadius: '12px', border: '1px solid #F0EBE4' }}>
              <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#8C7B6E', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick Actions</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button style={{ padding: '10px 14px', background: '#fff', border: '1.5px solid var(--primary-color)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 600, cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-sans)', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-color)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = 'var(--primary-color)'; }}
                >
                  View User Profile
                </button>
                <button style={{ padding: '10px 14px', background: '#fff', border: '1.5px solid #EDE8E2', borderRadius: '10px', fontSize: '0.8rem', color: '#C0392B', fontWeight: 500, cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-sans)', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#C0392B'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#EDE8E2'; }}
                >
                  Block Buyer
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#A89688', padding: '40px 20px', textAlign: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '48px', height: '48px', opacity: 0.25, marginBottom: '12px' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '4px', color: 'var(--primary-color)' }}>No Buyer Selected</h3>
            <p style={{ fontSize: '0.82rem' }}>Select a conversation to view details.</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
function ShopSettingsPanel({ shopData, onShopUpdated }: { shopData: any; onShopUpdated: (d: any) => void }) {
  const [name, setName] = useState(shopData?.name || '');
  const [description, setDescription] = useState(shopData?.description || '');
  const [about, setAbout] = useState(shopData?.about || '');
  const [location, setLocation] = useState(shopData?.location || '');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState(shopData?.image || '');
  const [coverPreview, setCoverPreview] = useState(shopData?.banner || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function uploadImage(file: File, folder: string): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `shop/${folder}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('products').upload(fileName, file);
    if (error) { console.error('Upload error:', error); return null; }
    const { data: urlData } = supabase.storage.from('products').getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  function handleProfileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileFile(file);
    setProfilePreview(URL.createObjectURL(file));
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!shopData?.id) return;
    setSaving(true);
    setMessage('');

    let imageUrl = shopData.image || '';
    let bannerUrl = shopData.banner || '';

    if (profileFile) {
      const url = await uploadImage(profileFile, 'profile');
      if (url) imageUrl = url;
    }
    if (coverFile) {
      const url = await uploadImage(coverFile, 'banner');
      if (url) bannerUrl = url;
    }

    const { error } = await supabase
      .from('shops')
      .update({ name, description, about, image: imageUrl, banner: bannerUrl, location })
      .eq('id', shopData.id);

    setSaving(false);
    if (error) { setMessage('Error: ' + error.message); return; }
    setMessage('Shop profile updated successfully!');
    onShopUpdated({ ...shopData, name, description, about, image: imageUrl, banner: bannerUrl, location });
  }

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>Shop Profile</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>Update your shop's profile information, cover photo, and branding.</p>
      </div>

      {message && (
        <div style={{ padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', background: message.startsWith('Error') ? '#FEE2E2' : '#DCFCE7', color: message.startsWith('Error') ? '#991B1B' : '#166534', fontSize: '0.9rem', fontWeight: 500 }}>
          {message}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: '12px', overflow: 'hidden' }}>

        {/* Cover Photo - Full Width */}
        <div style={{ position: 'relative', width: '100%', height: '260px', overflow: 'hidden', background: 'var(--bg-secondary)', borderBottom: '1px solid #E8E0D8', cursor: 'pointer' }} onClick={() => document.getElementById('shop-cover-input')?.click()}>
          {coverPreview ? (
            <img src={coverPreview} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-light)', gap: '8px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '36px', height: '36px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span style={{ fontSize: '0.85rem' }}>Click to upload cover photo</span>
            </div>
          )}
          {coverPreview && (
            <div style={{ position: 'absolute', bottom: '16px', right: '16px', padding: '8px 20px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>Change Cover Photo</div>
          )}
          <input id="shop-cover-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverChange} />
        </div>

        {/* Profile Photo + Form Fields */}
        <div style={{ padding: '32px' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-dark)', marginBottom: '8px' }}>Profile Photo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px' }}>
            <div style={{ width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-secondary)', border: '3px solid #E8E0D8', flexShrink: 0, cursor: 'pointer' }} onClick={() => document.getElementById('shop-profile-input')?.click()}>
              {profilePreview ? (
                <img src={profilePreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-light)', fontSize: '0.85rem' }}>Add Photo</div>
              )}
            </div>
            <div>
              <button type="button" style={{ padding: '10px 24px', borderRadius: '8px', border: '1.5px solid var(--primary-color)', background: 'transparent', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }} onClick={() => document.getElementById('shop-profile-input')?.click()}>Upload Photo</button>
              <p style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-light)' }}>JPG, PNG or WEBP. Max 5MB.</p>
            </div>
            <input id="shop-profile-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfileChange} />
          </div>

          {/* Shop Name */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-dark)', marginBottom: '6px' }}>Shop Name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', maxWidth: '500px', padding: '12px 16px', borderRadius: '8px', border: '1px solid #D4C8BB', fontSize: '0.9rem', color: 'var(--text-dark)', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-dark)', marginBottom: '6px' }}>Short Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ width: '100%', maxWidth: '500px', padding: '12px 16px', borderRadius: '8px', border: '1px solid #D4C8BB', fontSize: '0.9rem', color: 'var(--text-dark)', background: '#fff', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          {/* About */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-dark)', marginBottom: '6px' }}>About</label>
            <textarea value={about} onChange={e => setAbout(e.target.value)} rows={5} style={{ width: '100%', maxWidth: '500px', padding: '12px 16px', borderRadius: '8px', border: '1px solid #D4C8BB', fontSize: '0.9rem', color: 'var(--text-dark)', background: '#fff', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          {/* Location */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-dark)', marginBottom: '6px' }}>Shop Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Manila, Philippines" style={{ width: '100%', maxWidth: '500px', padding: '12px 16px', borderRadius: '8px', border: '1px solid #D4C8BB', fontSize: '0.9rem', color: 'var(--text-dark)', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            {location && (
              <div style={{ marginTop: '12px', width: '100%', maxWidth: '500px', height: '240px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #E8E0D8' }}>
                <iframe
                  title="Shop Location"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(location)}&output=embed`}
                />
              </div>
            )}
          </div>

          {/* Save Button */}
          <button onClick={handleSave} disabled={saving} style={{ padding: '14px 36px', borderRadius: '10px', border: 'none', background: saving ? '#ccc' : 'var(--primary-color)', color: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

async function createBuyerNotification(orderId: string, status: string) {
  const { data: order } = await supabase.from('orders').select('user_id, items, id').eq('id', orderId).single();
  if (!order || !order.user_id) return;
  const firstItem = (order.items || [])[0] || {};
  const productImage = firstItem.image || '';
  const notifications: Record<string, { title: string; message: string }> = {
    preparing: { title: 'Order is Being Prepared', message: `Your order #${orderId.slice(-6)} is being prepared by the seller.` },
    shipped: { title: 'Shipped Out', message: `Your order #${orderId.slice(-6)} has been shipped out by the seller.` },
    delivered: { title: 'Received Order?', message: `Your order #${orderId.slice(-6)} has been delivered. Please confirm receipt.` },
    completed: { title: 'Your Order is Completed', message: `Your order #${orderId.slice(-6)} has been completed. Thank you!` },
    cancelled: { title: 'Order Cancelled', message: `Your order #${orderId.slice(-6)} has been cancelled by the seller.` },
  };
  const notif = notifications[status];
  if (!notif) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const { data: authData } = await supabase.auth.getSession();
  const token = authData.session?.access_token;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/notifications`, {
    method: 'POST', headers, credentials: 'include',
    body: JSON.stringify({ user_id: order.user_id, type: status, title: notif.title, message: notif.message, order_id: orderId, product_image: productImage }),
  });
  if (!res.ok) throw new Error(`Notification failed: ${res.status}`);
}

function NotificationsPanel({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    async function fetchNotifications() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (!cancelled && data) setNotifications(data);
      if (!cancelled) setLoading(false);
    }
    fetchNotifications();
    const channel = supabase
      .channel(`artisan-notifs:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, fetchNotifications)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [userId]);

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function deleteNotif(id: string) {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const orderUnread = notifications.filter(n => !n.read && n.order_id).length;
  const messageUnread = notifications.filter(n => !n.read && n.type === 'message').length;
  const systemUnread = notifications.filter(n => !n.read && !n.order_id && n.type !== 'message').length;
  const [filter, setFilter] = useState<'all' | 'orders' | 'messages' | 'system'>('all');
  const filtered = notifications.filter(n =>
    filter === 'all' ? true :
    filter === 'orders' ? !!n.order_id :
    filter === 'messages' ? n.type === 'message' :
    !n.order_id && n.type !== 'message'
  );
  const filterTabs = [
    { key: 'all', label: 'All', count: unreadCount },
    { key: 'orders', label: 'Orders', count: orderUnread },
    { key: 'messages', label: 'Messages', count: messageUnread },
    { key: 'system', label: 'System', count: systemUnread },
  ] as const;
  const timeAgo = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); return `${d}d ago`;
  };
  const typeConfig: Record<string, { bg: string; color: string }> = {
    preparing: { bg: '#E3F2FD', color: '#1565C0' },
    shipped: { bg: '#F3E5F5', color: '#6A1B9A' },
    delivered: { bg: '#E8F5E9', color: '#2E7D32' },
    completed: { bg: '#FFF3E0', color: '#C1570D' },
    cancelled: { bg: '#FFEBEE', color: '#D32F2F' },
    message: { bg: '#F5F5F5', color: '#616161' },
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>Notifications</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{ padding: '8px 16px', border: '1.5px solid var(--primary-color)', borderRadius: '8px', background: 'transparent', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-color)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--primary-color)'; }}>
            Mark All as Read
          </button>
        )}
      </div>

      {/* Horizontal filter tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid #EDE8E2' }}>
        {filterTabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.88rem', fontWeight: filter === t.key ? 700 : 500, color: filter === t.key ? 'var(--primary-color)' : 'var(--text-light)', borderBottom: `2px solid ${filter === t.key ? 'var(--accent-color)' : 'transparent'}`, marginBottom: '-1px', transition: 'color 0.15s' }}>
            {t.label}
            {t.count > 0 && (
              <span style={{ minWidth: '18px', height: '18px', padding: '0 5px', borderRadius: '9px', background: filter === t.key ? 'var(--accent-color)' : '#E0A06A', color: '#fff', fontSize: '0.66rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: '10px', overflow: 'hidden' }}>
        {loading ? (
          [1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', gap: '14px', padding: '18px 20px', borderBottom: '1px solid #F0EBE4' }}>
              <div className="shimmer-skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="shimmer-skeleton" style={{ height: '13px', width: '70%', borderRadius: '4px' }} />
                <div className="shimmer-skeleton" style={{ height: '11px', width: '40%', borderRadius: '4px' }} />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-light)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#FAF5EF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Bell size={28} color="var(--primary-color)" strokeWidth={1.5} />
            </div>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '4px' }}>No notifications yet</p>
            <p style={{ fontSize: '0.85rem' }}>You'll be notified about order updates and messages.</p>
          </div>
        ) : (
          filtered.map(n => {
            const tc = typeConfig[n.type] || { bg: '#F5F5F5', color: '#666' };
            return (
              <div key={n.id} onClick={() => { markRead(n.id); if (n.order_id) navigate(`/artisan-dashboard?panel=orders&orderId=${n.order_id}`); }}
                style={{ display: 'flex', gap: '14px', padding: '16px 20px', borderBottom: '1px solid #F0EBE4', background: n.read ? 'transparent' : '#FDF8F4', transition: 'background 0.15s', alignItems: 'flex-start', cursor: n.order_id ? 'pointer' : 'default' }}
                onMouseEnter={e => (e.currentTarget.style.background = n.read ? '#FAF7F4' : '#FBEFE6')}
                onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : '#FDF8F4')}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bell size={18} color={tc.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: n.read ? 500 : 700, color: 'var(--text-dark)' }}>{n.title}</span>
                    {!n.read && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C1570D', flexShrink: 0 }} />}
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', margin: 0, lineHeight: 1.4 }}>{n.message}</p>
                  <span style={{ fontSize: '0.72rem', color: '#aaa', marginTop: '4px', display: 'block' }}>{timeAgo(n.created_at)}{n.order_id ? '  ·  View order →' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {!n.read && (
                    <button onClick={() => markRead(n.id)} title="Mark as read" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-color)', padding: '4px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600 }}>Read</button>
                  )}
                  <button onClick={() => deleteNotif(n.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: '4px', borderRadius: '4px', transition: 'color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#d32f2f')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
