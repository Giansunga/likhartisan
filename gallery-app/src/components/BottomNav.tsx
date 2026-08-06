import { Link, useLocation } from 'react-router-dom';
import { Home, Grid3X3, Store, Palette } from 'lucide-react';

export default function BottomNav() {
  const location = useLocation();

  if (location.pathname.startsWith('/artisan-dashboard')) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const navItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Gallery', path: '/gallery', icon: Grid3X3 },
    { name: 'Shops', path: '/shops', icon: Store },
    { name: 'Design', path: '/freeform', icon: Palette },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const active = item.path ? isActive(item.path) : false;
        return (
          <Link
            key={item.name}
            to={item.path}
            className={`bottom-nav-item ${active ? 'bottom-nav-item--active' : ''}`}
          >
            <item.icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
