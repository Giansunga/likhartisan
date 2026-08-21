import { useState, useEffect, type JSX } from 'react';
import { NavLink, Link, Outlet, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ADMIN_EMAILS } from '../../lib/constants';
import { useAuth } from '../../contexts/AuthContext';
import { PortalRealtimeProvider } from '../../realtime/PortalRealtimeProvider';
import { signOutWithActivity } from '../../lib/activityApi';
import '../portal.css';
import './admin.css';

interface NavLinkItem {
  to: string;
  label: string;
  exact?: boolean;
  icon: JSX.Element;
  section: string;
}

const navLinks: NavLinkItem[] = [
  { to: '/admin', label: 'Dashboard', exact: true, section: 'main', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
  { to: '/admin/orders', label: 'Orders', section: 'main', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg> },
  { to: '/admin/products', label: 'Products', section: 'main', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg> },
  { to: '/admin/artisans', label: 'Artisans', section: 'main', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
  { to: '/admin/models', label: '3D Models', section: 'main', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg> },
  { to: '/admin/theme', label: 'Theme Customizer', section: 'main', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg> },
  { to: '/admin/roles', label: 'Role Assignment', section: 'main', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
  { to: '/admin/analytics', label: 'Analytics', section: 'analytics', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12" /></svg> },
  { to: '/admin/activity', label: 'Activity Logs', section: 'system', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg> },
];

const SIDEBAR_WIDTH = 232;
const HEADER_HEIGHT = 72;

export default function AdminLayout() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    async function checkAdminAccess() {
      try {
        if (!user) { if (active) setIsAdmin(false); return; }
        const normalizedEmail = user.email?.trim().toLowerCase();
        const isConfiguredAdmin = Boolean(normalizedEmail) && ADMIN_EMAILS.some(
          (email: string) => email.trim().toLowerCase() === normalizedEmail,
        );
        if (isConfiguredAdmin) { if (active) setIsAdmin(true); return; }
        const { data, error } = await supabase.from('user_roles').select('id').eq('user_id', user.id).eq('role', 'super_admin').maybeSingle();
        if (active) setIsAdmin(!error && Boolean(data));
      } catch (e) {
        console.error('Admin access check error:', e);
        if (active) setIsAdmin(false);
      } finally {
        if (active) setLoading(false);
      }
    }
    void checkAdminAccess();
    return () => { active = false; };
  }, [authLoading, user]);

  if (loading) {
    return (
      <div style={{ background: '#FAF7F2', fontFamily: 'var(--font-sans)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#77716B', fontSize: '0.95rem' }}>Loading...</div>
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  function isActiveRoute(to: string, exact?: boolean) {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  }

  const sections = [
    { key: 'main', label: 'MAIN NAVIGATION' },
    { key: 'analytics', label: 'ANALYTICS' },
    { key: 'system', label: 'SYSTEM' },
  ];

  let lastSection = '';

  return (
    <PortalRealtimeProvider topics={['admin:portal']}>
    <div className="admin-shell" style={{ background: '#FAF7F2', fontFamily: 'var(--font-sans)', minHeight: '100vh' }}>
      {/* ── HEADER ── */}
      <header className="admin-header" style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: `${HEADER_HEIGHT}px`,
        background: '#fff', borderBottom: '1px solid #E9DED2',
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: '24px', paddingRight: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/images/likhartisan-brown-wordmark.png" alt="LikhArtisan" style={{ height: '44px', width: 'auto', objectFit: 'contain' }} />
        </div>
      </header>

      <div className="admin-content-frame" style={{ display: 'flex', marginTop: `${HEADER_HEIGHT}px`, minHeight: `calc(100vh - ${HEADER_HEIGHT}px)` }}>
        {/* ── SIDEBAR ── */}
        <aside className="admin-sidebar" style={{
          width: `${SIDEBAR_WIDTH}px`, minWidth: `${SIDEBAR_WIDTH}px`,
          background: '#fff', borderRight: '1px solid #E9DED2',
          position: 'fixed', top: `${HEADER_HEIGHT}px`, left: 0,
          height: `calc(100vh - ${HEADER_HEIGHT}px)`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto', zIndex: 40,
        }}>
          {/* Nav sections */}
          <nav style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {navLinks.map((link) => {
              if (link.section !== lastSection) {
                lastSection = link.section;
                const section = sections.find(s => s.key === link.section);
                return (
                  <div key={`section-${link.section}`}>
                    {link.section !== 'main' && <div style={{ height: '1px', background: '#E9DED2', margin: '12px 0 8px' }} />}
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#A89688', letterSpacing: '0.08em', textTransform: 'uppercase' as const, padding: '8px 12px 4px' }}>
                      {section?.label}
                    </p>
                    <SidebarLink link={link} isActive={isActiveRoute(link.to, link.exact)} />
                  </div>
                );
              }
              return <SidebarLink key={link.to} link={link} isActive={isActiveRoute(link.to, link.exact)} />;
            })}
          </nav>

          {/* Bottom */}
          <div style={{ padding: '12px', borderTop: '1px solid #E9DED2' }}>
            <Link
              to="/"
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', textDecoration: 'none',
                color: '#77716B', fontSize: '0.85rem', fontWeight: 500,
                borderRadius: '10px', transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8EFE5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Back to Store
            </Link>
            <button
              onClick={async () => { await signOutWithActivity(); window.location.href = '/'; }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', border: 'none', background: 'transparent',
                color: '#DC2626', fontSize: '0.85rem', fontWeight: 500,
                cursor: 'pointer', borderRadius: '10px', width: '100%', textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="admin-main" style={{
          flex: 1, padding: 0, background: '#FAF7F2',
          minWidth: 0, marginLeft: `${SIDEBAR_WIDTH}px`, height: `calc(100vh - ${HEADER_HEIGHT}px)`, overflow: 'hidden',
        }}>
          <div className="admin-route-workspace"><Outlet /></div>
        </main>
      </div>
    </div>
    </PortalRealtimeProvider>
  );
}

function SidebarLink({ link, isActive }: { link: NavLinkItem; isActive: boolean }) {
  return (
    <NavLink
      to={link.to}
      end={link.exact}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 12px', textDecoration: 'none',
        background: isActive ? '#934308' : 'transparent',
        color: isActive ? '#fff' : '#77716B',
        fontSize: '0.85rem', fontWeight: isActive ? 600 : 500,
        borderRadius: '10px', width: '100%', textAlign: 'left',
        transition: 'background 0.18s, color 0.18s',
      }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#F8EFE5'; e.currentTarget.style.color = '#934308'; }}}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#77716B'; }}}
    >
      {link.icon}
      {link.label}
    </NavLink>
  );
}
