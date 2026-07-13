import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface DashboardStats {
  totalOrders: number;
  revenue: number;
  totalProducts: number;
  activeShops: number;
  totalViews: number;
  pendingOrders: number;
  completedOrders: number;
  monthlyRevenue: { month: string; revenue: number }[];
  recentOrders: {
    id: string;
    user_name: string;
    total: number;
    status: string;
    created_at: string;
    items: any[];
  }[];
  recentProducts: {
    id: string;
    name: string;
    image: string;
    price: number;
    shop_name: string;
    category: string;
    created_at: string;
  }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    revenue: 0,
    totalProducts: 0,
    activeShops: 0,
    totalViews: 0,
    pendingOrders: 0,
    completedOrders: 0,
    monthlyRevenue: [],
    recentOrders: [],
    recentProducts: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      const [productsRes, ordersRes, shopsRes, variationsRes] = await Promise.all([
        supabase.from('products').select('id, name, image, shop_name, category, views, created_at, status').order('created_at', { ascending: false }),
        supabase.from('orders').select('id, user_name, total, status, delivery_status, created_at, items').order('created_at', { ascending: false }),
        supabase.from('shops').select('id, name'),
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

      const totalViews = products.reduce((sum: number, p: any) => sum + (p.views || 0), 0);
      const totalRevenue = orders
        .filter((o: any) => o.status === 'paid' || o.status === 'completed')
        .reduce((sum: number, o: any) => sum + (o.total || 0), 0);
      const pendingOrders = orders.filter((o: any) => o.status === 'pending').length;
      const completedOrders = orders.filter((o: any) => o.status === 'paid' || o.status === 'completed').length;

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyMap: Record<string, number> = {};
      orders
        .filter((o: any) => o.status === 'paid' || o.status === 'completed')
        .forEach((o: any) => {
          const d = new Date(o.created_at);
          const key = monthNames[d.getMonth()];
          monthlyMap[key] = (monthlyMap[key] || 0) + (o.total || 0);
        });
      const monthlyRevenue = monthNames.map(m => ({ month: m, revenue: monthlyMap[m] || 0 }));

      setStats({
        totalOrders: orders.length,
        revenue: totalRevenue,
        totalProducts: products.length,
        activeShops: shops.length,
        totalViews,
        pendingOrders,
        completedOrders,
        monthlyRevenue,
        recentOrders: orders.slice(0, 5),
        recentProducts: products.slice(0, 5).map(p => ({
          id: p.id,
          name: p.name,
          image: p.image,
          price: productPrices[p.id] || 0,
          shop_name: p.shop_name,
          category: p.category,
          created_at: p.created_at,
        })),
      });
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e);
    } finally {
      setLoading(false);
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  const statCards = [
    {
      label: 'Total Orders', value: String(stats.totalOrders),
      sub: 'All time', color: '#1565C0',
      bg: '#EFF6FF', trend: null,
    },
    {
      label: 'Revenue', value: `₱${stats.revenue.toLocaleString()}`,
      sub: 'All time', color: '#823E0B',
      bg: '#FDF5EE', trend: null,
    },
    {
      label: 'Total Products', value: String(stats.totalProducts),
      sub: 'Active listings', color: '#2E7D32',
      bg: '#F0FDF4', trend: null,
    },
    {
      label: 'Active Shops', value: String(stats.activeShops),
      sub: 'Registered', color: '#6A1B9A',
      bg: '#F5F0FF', trend: null,
    },
    {
      label: 'Total Views', value: stats.totalViews.toLocaleString(),
      sub: 'Across all products', color: '#C1570D',
      bg: '#FFF3E0', trend: null,
    },
  ];

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#8C7B6E', fontSize: '0.95rem' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div>
      {/* Welcome bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        style={{ marginBottom: '28px' }}
      >
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px', fontFamily: 'var(--font-serif)' }}>
          {greeting}, Admin 👋
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#8C7B6E' }}>Here's a quick overview of your platform's performance today.</p>
      </motion.div>

      {/* STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '18px', marginBottom: '28px' }}>
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
                  color: '#2E7D32',
                  background: '#F0FDF4',
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
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.4 }}
        style={{
          background: '#fff', borderRadius: '16px', padding: '24px',
          border: '1px solid #EDE8E2', marginBottom: '28px',
          boxShadow: '0 2px 8px rgba(130,62,11,0.06)',
        }}
      >
        <h3 style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '20px', fontSize: '1rem', fontFamily: 'var(--font-serif)' }}>Monthly Revenue</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '180px', padding: '0 4px' }}>
          {stats.monthlyRevenue.map((m) => {
            const maxRev = Math.max(...stats.monthlyRevenue.map(x => x.revenue), 1);
            const height = (m.revenue / maxRev) * 140;
            return (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.7rem', color: '#A89688', fontWeight: 500 }}>
                  {m.revenue > 0 ? `₱${(m.revenue / 1000).toFixed(m.revenue >= 1000 ? 1 : 0)}k` : ''}
                </span>
                <div style={{ width: '100%', height: `${Math.max(height, 2)}px`, background: 'linear-gradient(180deg, #A0501A 0%, #823E0B 100%)', borderRadius: '6px 6px 2px 2px', transition: 'height 0.5s ease', minHeight: '2px' }} />
                <span style={{ fontSize: '0.7rem', color: '#A89688' }}>{m.month}</span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* BOTTOM GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Recent Orders */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48, duration: 0.4 }}
          style={{
            background: '#fff', borderRadius: '16px', padding: '24px',
            border: '1px solid #EDE8E2', boxShadow: '0 2px 8px rgba(130,62,11,0.06)',
          }}
        >
          <h3 style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '16px', fontSize: '1rem', fontFamily: 'var(--font-serif)' }}>Recent Orders</h3>
          {stats.recentOrders.length === 0 ? (
            <p style={{ fontSize: '0.88rem', color: '#A89688', padding: '16px 0', textAlign: 'center' }}>No orders yet.</p>
          ) : (
            <div>
              {stats.recentOrders.map(o => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', marginBottom: '4px', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FDF5EE')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <p style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-dark)' }}>{o.user_name || 'Customer'}</p>
                    <p style={{ fontSize: '0.78rem', color: '#A89688' }}>Order #{o.id.slice(-6)} · {(o.items?.[0]?.shop_name) || 'Shop'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)' }}>₱{(o.total || 0).toLocaleString()}</p>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 600,
                      color: o.status === 'paid' || o.status === 'completed' ? '#2E7D32' : o.status === 'pending' ? '#F57C00' : '#D32F2F',
                    }}>{(o.status || 'pending').charAt(0).toUpperCase() + (o.status || 'pending').slice(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recently Uploaded */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.56, duration: 0.4 }}
          style={{
            background: '#fff', borderRadius: '16px', padding: '24px',
            border: '1px solid #EDE8E2', boxShadow: '0 2px 8px rgba(130,62,11,0.06)',
          }}
        >
          <h3 style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '16px', fontSize: '1rem', fontFamily: 'var(--font-serif)' }}>Recently Uploaded</h3>
          {stats.recentProducts.length === 0 ? (
            <p style={{ fontSize: '0.88rem', color: '#A89688', padding: '16px 0', textAlign: 'center' }}>No products uploaded yet.</p>
          ) : (
            <div>
              {stats.recentProducts.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', marginBottom: '4px', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FDF5EE')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <img src={p.image} alt={p.name} style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'cover' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    <p style={{ fontSize: '0.78rem', color: '#A89688' }}>{p.shop_name} · {p.category}</p>
                  </div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-dark)', flexShrink: 0 }}>₱{(p.price || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
