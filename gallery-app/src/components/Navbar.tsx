import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { getCartCount } from '../data/store';
import { supabase } from '../lib/supabase';
import { ADMIN_EMAIL, SHOP_EMAILS } from '../lib/constants';
import AuthModal from './AuthModal';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = location.pathname.startsWith('/admin');
  const isArtisanDashboard = location.pathname.startsWith('/artisan-dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<{ id: string; type: string; text: string; time: string; read: boolean }[]>([]);
  const [authView, setAuthView] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [loggedIn, setLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState('');
  const [shopDisplayName, setShopDisplayName] = useState('Shop');
  const [shopInitials, setShopInitials] = useState('SN');
  const [shopImage, setShopImage] = useState('');

  async function fetchBuyerNotifications() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setNotifications([]);
      return;
    }

    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, message, created_at, read')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setNotifications(data.map((n: any) => ({
        id: n.id,
        type: n.type || 'notification',
        text: n.title ? `${n.title}: ${n.message || ''}` : n.message || 'New notification',
        time: n.created_at,
        read: !!n.read,
      })));
    }
  }

  async function markNotificationRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setLoggedIn(!!session);
      setUserEmail(session?.user?.email ?? null);
      setUserAvatar(session?.user?.user_metadata?.avatar_url || '');
      if (session?.user?.email && SHOP_EMAILS.includes(session.user.email)) {
        const name = session.user.user_metadata?.name || session.user.email;
        setShopDisplayName(name);
        setShopInitials(name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2));
        const { data: shopData } = await supabase.from('shops').select('image').eq('email', session.user.email).single();
        if (shopData?.image) setShopImage(shopData.image);
      } else if (session) {
        fetchBuyerNotifications();
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoggedIn(!!session);
      setUserEmail(session?.user?.email ?? null);
      setUserAvatar(session?.user?.user_metadata?.avatar_url || '');
      if (session?.user?.email && SHOP_EMAILS.includes(session.user.email)) {
        const name = session.user.user_metadata?.name || session.user.email;
        setShopDisplayName(name);
        setShopInitials(name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2));
        const { data: shopData } = await supabase.from('shops').select('image').eq('email', session.user.email).single();
        if (shopData?.image) setShopImage(shopData.image);
      } else {
        setShopImage('');
        if (session) fetchBuyerNotifications();
        else setNotifications([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleOpenAuth(e: Event) {
      const view = (e as CustomEvent).detail?.view || 'signin';
      setAuthView(view);
      setAuthOpen(true);
    }
    window.addEventListener('open-auth', handleOpenAuth);
    return () => window.removeEventListener('open-auth', handleOpenAuth);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isArtisanDashboard || !userEmail || !SHOP_EMAILS.includes(userEmail)) return;
    async function fetchNotifications() {
      const notifs: { id: string; type: string; text: string; time: string; read: boolean }[] = [];

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return;

      const { data: shop } = await supabase.from('shops').select('id').eq('email', userEmail).maybeSingle();
      if (!shop) return;

      const { data: orders } = await supabase.from('orders').select('id, user_name, total, created_at, status').order('created_at', { ascending: false }).limit(10);
      if (orders) {
        orders.filter((o: any) => {
          const items = o.items || [];
          return items.some((i: any) => i.shop_id === shop.id);
        }).forEach((o: any) => {
          notifs.push({
            id: o.id, type: 'order',
            text: `New order from ${o.user_name || 'Customer'} — ₱${(o.total || 0).toLocaleString()}`,
            time: o.created_at, read: o.status !== 'pending',
          });
        });
      }

      const { data: convs } = await supabase.from('conversations').select('id, buyer_id, last_message, last_message_at, buyer_unread').eq('shop_id', shop.id).order('last_message_at', { ascending: false }).limit(10);
      if (convs) {
        convs.filter((c: any) => (c.buyer_unread || 0) > 0).forEach((c: any) => {
          notifs.push({
            id: c.id, type: 'message',
            text: c.last_message || 'New message',
            time: c.last_message_at, read: false,
          });
        });
      }

      notifs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setNotifications(notifs.slice(0, 10));
    }
    fetchNotifications();
  }, [isArtisanDashboard, userEmail]);

  useEffect(() => {
    if (!loggedIn || isArtisanDashboard || !userEmail || SHOP_EMAILS.includes(userEmail)) return;
    fetchBuyerNotifications();
  }, [loggedIn, isArtisanDashboard, userEmail, location.pathname]);

  function handleAuthChange(email?: string) {
    setLoggedIn(true);
    const userEmailStr = email || userEmail || '';
    if (SHOP_EMAILS.includes(userEmailStr)) {
      navigate('/artisan-dashboard');
    } else {
      window.location.reload();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setLoggedIn(false);
    window.location.reload();
  }

  if (isAdmin) return null;

  const links = isArtisanDashboard ? [] : [
    { to: '/', label: 'Home' },
    { to: '/gallery', label: 'Gallery' },
    { to: '/freeform', label: 'Design' },
    { to: '/artisans', label: 'Artisans' },
    { to: '/shops', label: 'Shops' },
    { to: '/about', label: 'About' },
  ];
  const unreadNotifications = notifications.filter(n => !n.read).length;

  return (
    <nav className="fixed top-0 left-0 w-full h-[var(--nav-height)] bg-white/95 backdrop-blur-sm z-50 shadow-[var(--shadow-sm)]" id="main-navbar">
      {isArtisanDashboard ? (
        <div className="h-full flex items-center justify-between" style={{ padding: '0 24px' }}>
          <Link to="/" className="logo flex items-center gap-2">
            <img src="/images/Orange.png" alt="LikhArtisan" className="h-[48px] w-auto" style={{ height: '180px', width: 'auto' }} />
          </Link>
          <div className="flex items-center gap-6">
            <div ref={notifDropdownRef} className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '6px', borderRadius: '6px', position: 'relative' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {notifications.filter(n => !n.read).length > 0 && (
                  <span style={{ position: 'absolute', top: '0', right: '0', width: '18px', height: '18px', background: '#E53935', color: '#fff', fontSize: '0.65rem', fontWeight: 700, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', border: '1px solid #E8E0D8', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', width: '360px', zIndex: 100 }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8E0D8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-dark)' }}>Notifications</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{notifications.filter(n => !n.read).length} unread</span>
                  </div>
                  <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-light)', fontSize: '0.88rem' }}>No notifications yet</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F5F0EB', display: 'flex', gap: '12px', alignItems: 'flex-start', background: n.read ? 'transparent' : '#FDF8F4', cursor: 'pointer' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: n.type === 'order' ? 'var(--primary-color)' : 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                            {n.type === 'order' ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: '16px', height: '16px' }}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: '16px', height: '16px' }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-dark)', lineHeight: 1.4, margin: 0 }}>{n.text}</p>
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginTop: '4px', margin: 0 }}>{new Date(n.time).toLocaleString()}</p>
                          </div>
                          {!n.read && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E53935', flexShrink: 0, marginTop: '6px' }} />}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div ref={profileDropdownRef} className="relative">
              <button onClick={() => setShowProfileDropdown(!showProfileDropdown)} className="flex items-center gap-2.5 cursor-pointer" style={{ background: 'none', border: 'none' }}>
                <div className="w-[38px] h-[38px] rounded-full bg-[var(--bg-secondary)] overflow-hidden flex items-center justify-center border-2 border-cream-tertiary">
                  {shopImage ? (
                    <img src={shopImage} alt={shopDisplayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-accent font-semibold text-[0.85rem]">{shopInitials}</span>
                  )}
                </div>
                <span className="font-semibold text-[0.95rem] text-brown-dark">{shopDisplayName}</span>
              </button>
              {showProfileDropdown && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', border: '1px solid #E8E0D8', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', minWidth: '180px', zIndex: 100, padding: '6px 0' }}>
                  <button onClick={handleLogout} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-dark)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-[var(--container-width)] mx-auto px-6 h-full flex items-center justify-between">
          <Link to="/" className="logo flex items-center gap-2">
            <img src="/images/Orange.png" alt="LikhArtisan" className="h-[48px] w-auto" style={{ height: '180px', width: 'auto' }} />
          </Link>

          <ul className={`nav-links items-center gap-10 list-none hidden md:flex ${mobileOpen ? 'active' : ''}`} id="nav-links-menu">
            {links.map(link => (
              <li key={link.to}>
                <Link to={link.to}
                  className={`text-[1.125rem] font-semibold relative py-1.5 transition-colors after:content-[''] after:absolute after:bottom-0 after:left-1/2 after:w-0 after:h-[2px] after:bg-accent after:transition-all after:duration-300 after:-translate-x-1/2 hover:text-accent ${
                    location.pathname === link.to ? 'text-accent after:w-full' : 'text-brown-dark'
                  }`}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="nav-actions flex items-center gap-6">
            {loggedIn ? (
              <>
                <Link to="/cart" className="nav-icon-btn relative w-11 h-11 rounded-full flex items-center justify-center text-brown-medium hover:bg-cream-secondary hover:text-accent transition-all">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                  </svg>
                  <span className="absolute top-1 right-1 w-[18px] h-[18px] bg-accent text-white text-[0.75rem] font-bold rounded-full flex items-center justify-center border-2 border-white">
                    {getCartCount()}
                  </span>
                </Link>

                <div ref={notifDropdownRef} className="relative">
                  <button onClick={() => setShowNotifications(!showNotifications)} className="nav-icon-btn relative w-11 h-11 rounded-full flex items-center justify-center text-brown-medium hover:bg-cream-secondary hover:text-accent transition-all">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {unreadNotifications > 0 && (
                      <span className="absolute top-1 right-1 w-[18px] h-[18px] bg-accent text-white text-[0.7rem] font-bold rounded-full flex items-center justify-center border-2 border-white">
                        {unreadNotifications > 9 ? '9+' : unreadNotifications}
                      </span>
                    )}
                  </button>
                  {showNotifications && (
                    <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 10px)', background: '#fff', border: '1px solid #E8E0D8', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', width: '360px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 110px)', zIndex: 100, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8E0D8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-dark)' }}>Notifications</span>
                        <button onClick={() => { setShowNotifications(false); navigate('/dashboard?tab=notifications'); }} style={{ border: 'none', background: 'none', color: 'var(--primary-color)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                          View all
                        </button>
                      </div>
                      <div style={{ maxHeight: '360px', overflowY: 'auto', paddingBottom: '6px' }}>
                        {notifications.length === 0 ? (
                          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-light)', fontSize: '0.88rem' }}>No notifications yet</div>
                        ) : (
                          notifications.map(n => (
                            <button key={n.id} onClick={() => { markNotificationRead(n.id); setShowNotifications(false); navigate('/dashboard?tab=notifications'); }}
                              style={{ width: '100%', padding: '12px 16px', border: 'none', borderBottom: '1px solid #F5F0EB', display: 'flex', gap: '12px', alignItems: 'flex-start', background: n.read ? 'transparent' : '#FDF8F4', cursor: 'pointer', textAlign: 'left' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                  <path d="M13.73 21a2 2 0 01-3.46 0"/>
                                </svg>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-dark)', lineHeight: 1.4, margin: 0 }}>{n.text}</p>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginTop: '4px', marginBottom: 0 }}>{new Date(n.time).toLocaleString()}</p>
                              </div>
                              {!n.read && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E53935', flexShrink: 0, marginTop: '6px' }} />}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Link to="/chat" className="nav-icon-btn relative w-11 h-11 rounded-full flex items-center justify-center text-brown-medium hover:bg-cream-secondary hover:text-accent transition-all">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </Link>

                {userEmail === ADMIN_EMAIL && (
                  <Link to="/admin" className="nav-icon-btn relative w-11 h-11 rounded-full flex items-center justify-center text-brown-medium hover:bg-cream-secondary hover:text-accent transition-all">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                  </Link>
                )}

                <div className="user-profile relative cursor-pointer group">
                  <div className="w-[46px] h-[46px] rounded-full bg-[#D9D9D9] border-2 border-cream-tertiary overflow-hidden transition-all hover:border-accent hover:scale-105">
                    {userAvatar ? (
                      <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                        {(userEmail || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="absolute top-full right-0 mt-2.5 bg-white rounded-[10px] shadow-[var(--shadow-lg)] w-[200px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all translate-y-2 group-hover:translate-y-0 border border-black/5 py-2 z-50">
                    {userEmail && SHOP_EMAILS.includes(userEmail) && (
                      <Link to="/artisan-dashboard" className="block w-full text-left px-4 py-2.5 text-[0.95rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">Shop Dashboard</Link>
                    )}
                    <Link to="/dashboard?tab=account" className="block w-full text-left px-4 py-2.5 text-[0.95rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">My Account</Link>
                    <Link to="/dashboard?tab=purchases" className="block w-full text-left px-4 py-2.5 text-[0.95rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">My Purchase</Link>
                    <hr className="border-0 border-t border-cream-secondary my-1.5" />
                    <button onClick={handleLogout} className="block w-full text-left px-4 py-2.5 text-[0.95rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">Sign Out</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <button onClick={() => setAuthOpen(true)}
                  className="bg-primary text-white font-semibold text-base px-6 py-2.5 rounded-[10px] shadow-[var(--shadow-sm)] hover:bg-accent hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all">
                  SIGN IN
                </button>
              </>
            )}

            <button className="mobile-toggle hidden md:hidden text-[1.8rem] text-brown-dark" id="btn-mobile-toggle"
              onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle Navigation">
              {mobileOpen ? '×' : '\u2261'}
            </button>
          </div>
        </div>
      )}

      {authOpen && createPortal(
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthChange={handleAuthChange} initialView={authView} />,
        document.body
      )}

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white shadow-[var(--shadow-md)] absolute top-[var(--nav-height)] left-0 w-full">
          {links.map(link => (
            <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}
              className={`block text-center py-4 border-b border-cream-secondary text-base font-semibold ${
                location.pathname === link.to ? 'text-accent' : 'text-brown-dark'
              }`}>
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
