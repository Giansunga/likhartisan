import { useState, useEffect } from 'react';
import { NavLink, Link, Outlet, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ADMIN_EMAILS } from '../../lib/constants';
import { useAuth } from '../../contexts/AuthContext';

const sidebarLinks = [
  { to: '/admin',           label: 'Dashboard',         exact: true },
  { to: '/admin/products',  label: 'Products' },
  { to: '/admin/artisans',  label: 'Artisans' },
  { to: '/admin/shops/create', label: 'Register Shop' },
  { to: '/admin/models',    label: '3D Models' },
  { to: '/admin/theme',     label: 'Theme Customizer' },
];

export default function AdminLayout() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    checkAdminAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  function checkAdminAccess() {
    try {
      if (user && user.email && ADMIN_EMAILS.includes(user.email)) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch (e) {
      console.error('Admin access check error:', e);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ background: '#F7F3EE', fontFamily: 'var(--font-sans)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#8C7B6E', fontSize: '0.95rem' }}>Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  function isActiveRoute(to: string, exact?: boolean) {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  }

  return (
    <div style={{ background: '#F7F3EE', fontFamily: 'var(--font-sans)', minHeight: '100vh' }}>
      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: 'var(--nav-height)',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
        zIndex: 50, boxShadow: '0 1px 4px rgba(130,62,11,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '2px', textDecoration: 'none' }}>
          <img src="/images/Orange.png" alt="LikhArtisan" style={{ height: '180px', width: 'auto' }} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontSize: '0.88rem', color: '#6B5D52', fontWeight: 500 }}>Admin</span>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'var(--primary-color)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.82rem', fontWeight: 700,
          }}>A</div>
        </div>
      </nav>

      <div style={{ display: 'flex', marginTop: 'var(--nav-height)', minHeight: 'calc(100vh - var(--nav-height))' }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width: '240px', minWidth: '240px',
          background: '#fff',
          borderRight: '1px solid #EDE8E2',
          position: 'fixed',
          top: 'var(--nav-height)',
          left: 0,
          height: 'calc(100vh - var(--nav-height))',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
          boxShadow: '2px 0 12px rgba(130,62,11,0.04)',
          zIndex: 40,
        }}>
          {/* Brand mark */}
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #F0EBE4' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: '#B8A89A', textTransform: 'uppercase' }}>Admin Portal</div>
          </div>

          {/* Nav items */}
          <nav style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {sidebarLinks.map((link) => {
              const active = isActiveRoute(link.to, link.exact);
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.exact}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '10px 14px',
                    border: 'none', textDecoration: 'none',
                    background: active ? 'var(--primary-color)' : 'transparent',
                    color: active ? '#fff' : '#6B5D52',
                    fontFamily: 'var(--font-sans)', fontSize: '0.875rem', fontWeight: active ? 600 : 500,
                    borderRadius: '10px', width: '100%', textAlign: 'left',
                    transition: 'background 0.18s, color 0.18s',
                    boxShadow: active ? '0 2px 8px rgba(130,62,11,0.25)' : 'none',
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = '#FDF5EE'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--primary-color)'; }}}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.color = '#6B5D52'; }}}
                >
                  {link.label}
                </NavLink>
              );
            })}
          </nav>

          {/* Bottom pinned items */}
          <div style={{ padding: '12px 12px', borderTop: '1px solid #F0EBE4', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <Link
              to="/"
              style={{
                display: 'flex', alignItems: 'center',
                padding: '10px 14px', border: 'none', textDecoration: 'none',
                background: 'transparent', color: '#6B5D52',
                fontFamily: 'var(--font-sans)', fontSize: '0.875rem', fontWeight: 500,
                borderRadius: '10px', width: '100%', textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget).style.background = '#FDF5EE'; }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; }}
            >
              Back to Store
            </Link>
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.href = '/'; }}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '10px 14px', border: 'none', background: 'transparent',
                color: '#C0392B',
                fontFamily: 'var(--font-sans)', fontSize: '0.875rem', fontWeight: 500,
                cursor: 'pointer', borderRadius: '10px', width: '100%', textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget).style.background = '#FEF2F2'; }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; }}
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex: 1, padding: '36px 40px', background: '#F7F3EE', minWidth: 0, marginLeft: '240px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
