import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { getCartCount, onCartUpdate } from '../data/store';
import { supabase } from '../lib/supabase';
import { signOutWithActivity } from '../lib/activityApi';
import { ADMIN_EMAILS, SHOP_EMAILS } from '../lib/constants';
import AuthModal from './AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { consumeCartCheckoutAuthPending } from '../lib/cartCheckout';
import NotificationDropdown from './notifications/NotificationDropdown';
import { useNotifications } from '../hooks/useNotifications';
import { notificationDestination, notificationViewAllDestination } from '../lib/notifications';
import type { NotificationContext, NotificationRecord } from '../types/notifications';

function CartAction({ count, isMobile }: { count: number; isMobile: boolean }) {
  return (
    <Link to="/cart" data-cart-animation-target aria-label={`Shopping cart with ${count} ${count === 1 ? 'item' : 'items'}`} className="nav-icon-btn relative rounded-full flex items-center justify-center text-brown-medium hover:bg-cream-secondary hover:text-accent transition-all" style={{ width: isMobile ? '36px' : '44px', height: isMobile ? '36px' : '44px' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
      {count > 0 ? (
        <span className="absolute bg-accent text-white font-bold rounded-full flex items-center justify-center border-2 border-white" style={{ top: isMobile ? '0' : '2px', right: isMobile ? '0' : '2px', width: isMobile ? '16px' : '18px', height: isMobile ? '16px' : '18px', fontSize: isMobile ? '0.6rem' : '0.7rem' }}>
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = location.pathname.startsWith('/admin');
  const isArtisanDashboard = location.pathname.startsWith('/artisan-dashboard');
  const isFreeform = location.pathname.startsWith('/freeform');

  const [authOpen, setAuthOpen] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const [authView, setAuthView] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState('');
  const [shopDisplayName, setShopDisplayName] = useState('Shop');
  const [shopInitials, setShopInitials] = useState('SN');
  const [shopImage, setShopImage] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [cartCount, setCartCount] = useState(getCartCount);
  const [hasShopRole, setHasShopRole] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const { user } = useAuth();
  const loggedIn = !!user;
  const notificationContext: NotificationContext = isArtisanDashboard ? 'artisan' : 'buyer';
  const notificationData = useNotifications(user?.id, notificationContext, 10);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    const draft = consumeCartCheckoutAuthPending();
    if (draft) navigate('/checkout', { state: { checkoutDraft: draft } });
  }, [navigate, user]);

  useEffect(() => {
    const unsubscribe = onCartUpdate(() => setCartCount(getCartCount()));
    return unsubscribe;
  }, []);

  useEffect(() => {
    setUserEmail(user?.email ?? null);
    setUserAvatar(user?.user_metadata?.avatar_url || '');
    setHasShopRole(false);
    setIsSuperAdmin(false);
    if (user) {
      const normalizedEmail = user.email?.trim().toLowerCase();
      const emailMatch = Boolean(normalizedEmail) && ADMIN_EMAILS.some(
        (e: string) => e.trim().toLowerCase() === normalizedEmail,
      );
      if (!emailMatch) {
        supabase.from('user_roles').select('id').eq('user_id', user.id).eq('role', 'super_admin').maybeSingle()
          .then(({ data, error }) => { if (!error && data) setIsSuperAdmin(true); });
      } else {
        setIsSuperAdmin(true);
      }
    }
    if (user?.email && SHOP_EMAILS.includes(user.email)) {
      const name = user.user_metadata?.name || user.email;
      setShopDisplayName(name);
      setShopInitials(name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2));
      setHasShopRole(true);
      supabase.from('shops').select('image').eq('email', user.email).single().then(({ data: shopData }) => {
        if (shopData?.image) setShopImage(shopData.image);
      });
    } else if (user) {
      // Check user_roles for shop_owner role (user may have multiple rows, so don't use .single())
      supabase.from('user_roles').select('role').eq('user_id', user.id).then(({ data }) => {
        if (data && data.some(r => r.role === 'shop_owner')) {
          setHasShopRole(true);
          const name = user.user_metadata?.name || user.email || 'Shop';
          setShopDisplayName(name);
          setShopInitials(name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2));
        }
      });
      setShopImage('');
    } else {
      setShopImage('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    function handleOpenAuth(e: Event) {
      const detail = (e as CustomEvent).detail;
      const view = typeof detail === 'string' ? detail : detail?.view || 'signin';
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
      const t = e.target as Node;
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(t) &&
          !(notifPanelRef.current && notifPanelRef.current.contains(t))) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleAuthChange(email?: string) {
    const userEmailStr = email || userEmail || '';
    if (SHOP_EMAILS.includes(userEmailStr) || hasShopRole) {
      navigate('/artisan-dashboard');
    } else {
      window.location.reload();
    }
  }

  async function handleLogout() {
    await signOutWithActivity();
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
  const closeNotifications = (restoreFocus = false) => {
    setShowNotifications(false);
    if (restoreFocus) requestAnimationFrame(() => notificationButtonRef.current?.focus());
  };

  const openNotification = (notification: NotificationRecord) => {
    if (!notification.read) void notificationData.markRead(notification.id);
    closeNotifications();
    navigate(notificationDestination(notification));
  };

  const notifDropdown = (
    <div ref={notifPanelRef}>
      <NotificationDropdown
        context={notificationContext}
        notifications={notificationData.notifications}
        unreadCount={notificationData.unreadCount}
        loading={notificationData.loading}
        error={notificationData.error}
        onClose={closeNotifications}
        onRetry={() => void notificationData.reload()}
        onMarkAllRead={() => void notificationData.markAllRead()}
        onViewAll={() => { closeNotifications(); navigate(notificationViewAllDestination(notificationContext)); }}
        onOpenNotification={openNotification}
      />
    </div>
  );

  return (
    <nav className="fixed top-0 left-0 w-full h-[var(--nav-height)] bg-white/95 backdrop-blur-sm z-50 shadow-[var(--shadow-sm)]" id="main-navbar" aria-label="Main navigation">
      <div className="christmas-navbar-snowflakes" aria-hidden="true">
        <span>❄</span>
        <span>❄</span>
        <span>❄</span>
        <span>❄</span>
      </div>
      {isArtisanDashboard ? (
        <div className="h-full flex items-center justify-between" style={{ padding: '0 24px' }}>
          <Link to="/" className="logo flex items-center gap-2">
            <img className="christmas-logo-hat" src="/images/christmas-santa-hat.png" alt="" aria-hidden="true" />
            <img src="/images/likhartisan-brown-wordmark.png" alt="LikhArtisan" style={{ height: isMobile ? '34px' : '46px', width: 'auto' }} />
          </Link>
          <div className="flex items-center gap-4">
            <div ref={notifDropdownRef} className="relative">
              <button ref={notificationButtonRef} onClick={() => setShowNotifications(current => !current)} aria-label="Notifications" aria-expanded={showNotifications} aria-controls="navbar-notification-panel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '6px', borderRadius: '6px', position: 'relative' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {notificationData.unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: '0', right: '0', width: '18px', height: '18px', background: '#E53935', color: '#fff', fontSize: '0.75rem', fontWeight: 700, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                    {notificationData.unreadCount > 99 ? '99+' : notificationData.unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (isMobile ? createPortal(notifDropdown, document.body) : notifDropdown)}
            </div>
            <div ref={profileDropdownRef} className="relative">
              <button onClick={() => setShowProfileDropdown(!showProfileDropdown)} className="flex items-center gap-2 cursor-pointer" style={{ background: 'none', border: 'none' }}>
                <div className="rounded-full overflow-hidden flex items-center justify-center border-2 border-cream-tertiary" style={{ width: isMobile ? '34px' : '38px', height: isMobile ? '34px' : '38px' }}>
                  {shopImage ? (
                    <img src={shopImage} alt={shopDisplayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-accent font-semibold" style={{ fontSize: isMobile ? '0.75rem' : '0.85rem' }}>{shopInitials}</span>
                  )}
                </div>
                {!isMobile && <span className="font-semibold text-[0.95rem] text-brown-dark">{shopDisplayName}</span>}
              </button>
              {showProfileDropdown && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', border: '1px solid #E8E0D8', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', minWidth: '180px', zIndex: 100, padding: '6px 0' }}>
                  <button onClick={handleLogout} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-dark)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className={`${isFreeform ? 'w-full' : 'max-w-[var(--container-width)] mx-auto'} h-full flex items-center justify-between relative`} style={{ padding: isMobile ? '0 16px' : '0 32px' }}>
          {/* Mobile: hamburger left, logo center-left. Desktop: logo left */}


          <Link to="/" className="logo flex items-center" style={{ flexShrink: 0 }}>
            <img className="christmas-logo-hat" src="/images/christmas-santa-hat.png" alt="" aria-hidden="true" />
            <img src="/images/likhartisan-brown-wordmark.png" alt="LikhArtisan" style={{ height: isMobile ? '34px' : '46px', width: 'auto' }} />
          </Link>

          {/* Desktop nav links */}
          {!isMobile && (
            <ul className="nav-links absolute left-1/2 -translate-x-1/2 items-center list-none flex" style={{ margin: 0, padding: 0, gap: '36px' }}>
              {links.map(link => (
                <li key={link.to}>
                  <Link to={link.to}
                    className={`text-[1rem] font-semibold relative py-1.5 transition-colors after:content-[''] after:absolute after:bottom-0 after:left-1/2 after:w-0 after:h-[2px] after:bg-accent after:transition-all after:duration-300 after:-translate-x-1/2 hover:text-accent ${
                      location.pathname === link.to ? 'text-accent after:w-full' : 'text-brown-dark'
                    }`}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Action icons */}
          <div className="flex items-center" style={{ gap: isMobile ? '4px' : '20px' }}>
            <CartAction count={cartCount} isMobile={isMobile} />
            {loggedIn ? (
              <>
                <div ref={notifDropdownRef} className="relative">
                  <button ref={notificationButtonRef} onClick={() => setShowNotifications(current => !current)} aria-label="Notifications" aria-expanded={showNotifications} aria-controls="navbar-notification-panel" className="nav-icon-btn relative rounded-full flex items-center justify-center text-brown-medium hover:bg-cream-secondary hover:text-accent transition-all" style={{ width: isMobile ? '36px' : '44px', height: isMobile ? '36px' : '44px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {notificationData.unreadCount > 0 && (
                      <span className="absolute bg-accent text-white font-bold rounded-full flex items-center justify-center border-2 border-white" style={{ top: isMobile ? '0' : '2px', right: isMobile ? '0' : '2px', width: isMobile ? '16px' : '18px', height: isMobile ? '16px' : '18px', fontSize: isMobile ? '0.55rem' : '0.65rem' }}>
                        {notificationData.unreadCount > 99 ? '99+' : notificationData.unreadCount}
                      </span>
                    )}
                  </button>
                  {showNotifications && (isMobile ? createPortal(notifDropdown, document.body) : notifDropdown)}
                </div>

                <Link to="/chat" aria-label="Chat" className="nav-icon-btn relative rounded-full flex items-center justify-center text-brown-medium hover:bg-cream-secondary hover:text-accent transition-all" style={{ width: isMobile ? '36px' : '44px', height: isMobile ? '36px' : '44px' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </Link>

                {!isMobile && isSuperAdmin && (
                  <Link to="/admin" aria-label="Admin dashboard" className="nav-icon-btn relative rounded-full flex items-center justify-center text-brown-medium hover:bg-cream-secondary hover:text-accent transition-all" style={{ width: '44px', height: '44px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                  </Link>
                )}

                {/* Profile: tap-based on mobile, hover on desktop */}
                {isMobile ? (
                  <div ref={profileDropdownRef} className="relative">
                    <button onClick={() => setShowProfileDropdown(!showProfileDropdown)} aria-label="User menu" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <div className="rounded-full bg-[#D9D9D9] border-2 border-cream-tertiary overflow-hidden" style={{ width: '34px', height: '34px' }}>
                        {userAvatar ? (
                          <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                            {(userEmail || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </button>
                    {showProfileDropdown && (
                      <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', border: '1px solid #E8E0D8', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', minWidth: '180px', zIndex: 100, padding: '6px 0' }}>
                        {(userEmail && (SHOP_EMAILS.includes(userEmail) || hasShopRole)) && (
                          <Link to="/artisan-dashboard" onClick={() => setShowProfileDropdown(false)} className="block w-full text-left px-4 py-2.5 text-[0.9rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">Shop Dashboard</Link>
                        )}
                        <Link to="/dashboard?tab=account" onClick={() => setShowProfileDropdown(false)} className="block w-full text-left px-4 py-2.5 text-[0.9rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">My Account</Link>
                        <Link to="/dashboard?tab=purchases" onClick={() => setShowProfileDropdown(false)} className="block w-full text-left px-4 py-2.5 text-[0.9rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">My Purchase</Link>
                        <hr className="border-0 border-t border-cream-secondary my-1.5" />
                        <button onClick={handleLogout} className="block w-full text-left px-4 py-2.5 text-[0.9rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">Sign Out</button>
                      </div>
                    )}
                  </div>
                ) : (
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
                      {(userEmail && (SHOP_EMAILS.includes(userEmail) || hasShopRole)) && (
                        <Link to="/artisan-dashboard" className="block w-full text-left px-4 py-2.5 text-[0.95rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">Shop Dashboard</Link>
                      )}
                      <Link to="/dashboard?tab=account" className="block w-full text-left px-4 py-2.5 text-[0.95rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">My Account</Link>
                      <Link to="/dashboard?tab=purchases" className="block w-full text-left px-4 py-2.5 text-[0.95rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">My Purchase</Link>
                      <hr className="border-0 border-t border-cream-secondary my-1.5" />
                      <button onClick={handleLogout} className="block w-full text-left px-4 py-2.5 text-[0.95rem] font-medium text-brown-dark hover:bg-cream-secondary hover:text-accent">Sign Out</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button onClick={() => setAuthOpen(true)}
                className="bg-primary text-white font-semibold px-4 py-2 rounded-[10px] shadow-[var(--shadow-sm)] hover:bg-accent hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
                style={{ fontSize: isMobile ? '0.8rem' : '1rem' }}>
                SIGN IN
              </button>
            )}
          </div>
        </div>
      )}

      {authOpen && createPortal(
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthChange={handleAuthChange} initialView={authView} />,
        document.body
      )}


    </nav>
  );
}
