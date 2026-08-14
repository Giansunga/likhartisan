import { Link, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Home, Grid3X3, Store, Palette } from 'lucide-react';
import { useVisualViewportBottomOffset } from '../hooks/useVisualViewportBottomOffset';

const navItems = [
  { name: 'Home', path: '/', icon: Home },
  { name: 'Gallery', path: '/gallery', icon: Grid3X3 },
  { name: 'Shops', path: '/shops', icon: Store },
  { name: 'Design', path: '/freeform', icon: Palette },
] as const;

export default function BottomNav() {
  const location = useLocation();
  useVisualViewportBottomOffset();

  if (location.pathname.startsWith('/artisan-dashboard')) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return createPortal(
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {navItems.map((item) => {
        const active = isActive(item.path);
        return (
          <Link
            key={item.name}
            to={item.path}
            className={`bottom-nav-item ${active ? 'bottom-nav-item--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <item.icon strokeWidth={active ? 2.5 : 1.8} aria-hidden="true" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>,
    document.body,
  );
}
