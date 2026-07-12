import { Link, useLocation } from 'react-router-dom';
import { Home, Grid3X3, Brush, User, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();

  if (
    location.pathname.startsWith('/artisan-dashboard') ||
    location.pathname.startsWith('/chat')
  ) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const navItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Gallery', path: '/gallery', icon: Grid3X3 },
    { name: 'Design', path: '/freeform', icon: Brush },
    {
      name: 'Profile',
      path: user ? '/dashboard' : '',
      action: !user ? 'open-auth' : undefined,
      icon: user ? User : LogIn,
    },
  ];

  const handleAction = (e: React.MouseEvent, item: (typeof navItems)[number]) => {
    if (item.action === 'open-auth') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('open-auth', { detail: 'signin' }));
    }
  };

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const active = item.path ? isActive(item.path) : false;
        return (
          <Link
            key={item.name}
            to={item.path}
            onClick={(e) => handleAction(e, item)}
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
