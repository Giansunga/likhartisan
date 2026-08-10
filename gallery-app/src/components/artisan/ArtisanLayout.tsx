import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  ShoppingBag,
  Store,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ArtisanProvider from './ArtisanContext';
import { useArtisanPortal } from './artisanContextValue';
import '../portal.css';
import './artisan.css';

const navItems = [
  { to: '/artisan-dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/artisan-dashboard/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/artisan-dashboard/messages', label: 'Messages', icon: MessageSquare },
  { to: '/artisan-dashboard/listings', label: 'My Listings', icon: Package },
  { to: '/artisan-dashboard/requests', label: 'Requests', icon: Inbox },
  { to: '/artisan-dashboard/profile', label: 'Shop Profile', icon: Store },
  { to: '/artisan-dashboard/design-vault', label: 'Design Vault', icon: Layers },
  { to: '/artisan-dashboard/notifications', label: 'Notifications', icon: Bell },
];

function ArtisanShell() {
  const { shop } = useArtisanPortal();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  async function logout() {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  }

  return (
    <div className="seller-shell">
      <div className="seller-mobile-bar">
        <button className="seller-icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open seller navigation"><Menu /></button>
        <div><strong>Seller Portal</strong><span>{shop.name}</span></div>
      </div>
      {sidebarOpen ? <button className="seller-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close seller navigation" /> : null}
      <aside className={`seller-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Seller portal navigation">
        <div className="seller-sidebar__heading"><span>Seller Portal</span><button className="seller-icon-button seller-sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close seller navigation"><X /></button></div>
        <nav>
          {navItems.map(item => {
            const Icon = item.icon;
            return <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setSidebarOpen(false)}><Icon size={18} /><span>{item.label}</span></NavLink>;
          })}
        </nav>
        <div className="seller-sidebar__footer">
          <button onClick={() => navigate('/')}><Store size={18} /> Back to Store</button>
          <button className="is-danger" onClick={() => void logout()}><LogOut size={18} /> Logout</button>
        </div>
      </aside>
      <main className="seller-main"><Outlet /></main>
    </div>
  );
}

export default function ArtisanLayout() {
  return <ArtisanProvider><ArtisanShell /></ArtisanProvider>;
}
