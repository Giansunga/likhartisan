import { Link, useLocation } from 'react-router-dom';
import { Home, Grid, Brush, User, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function MobileBottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  
  // Hide on admin routes, chat, freeform, artisan dashboard, or specific checkout flows
  if (
    location.pathname.startsWith('/admin') || 
    location.pathname.startsWith('/chat') ||
    location.pathname.startsWith('/artisan-dashboard') ||
    location.pathname.startsWith('/checkout')
  ) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const navItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Gallery', path: '/gallery', icon: Grid },
    { name: 'Design', path: '/freeform', icon: Brush },
    { name: 'Profile', path: user ? '/dashboard' : '', action: !user ? 'open-auth' : undefined, icon: user ? User : LogIn }
  ];

  const handleAction = (e: React.MouseEvent, item: any) => {
    if (item.action === 'open-auth') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('open-auth', { detail: 'signin' }));
    }
  };

  return (
    <div 
      className="fixed bottom-0 left-0 w-full bg-white border-t border-cream-secondary flex items-center justify-around pb-[env(safe-area-inset-bottom)] z-50 md:hidden"
      style={{ position: 'fixed', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 9999, backgroundColor: '#ffffff', borderTop: '1px solid #F7F0E9', display: 'flex' }}
    >
      {navItems.map((item) => {
        const active = item.path ? isActive(item.path) : false;
        return (
          <Link
            key={item.name}
            to={item.path}
            onClick={(e) => handleAction(e, item)}
            className={`flex flex-col items-center justify-center w-full py-3 gap-1 transition-colors ${active ? 'text-accent' : 'text-brown-medium hover:text-brown-dark'}`}
          >
            <item.icon size={22} strokeWidth={active ? 2.5 : 2} />
            <span className={`text-[0.65rem] font-medium ${active ? 'font-bold' : ''}`}>
              {item.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
