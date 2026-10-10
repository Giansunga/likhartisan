import { useLocation } from 'react-router-dom';
import { useMediaQuery } from '../hooks/useMediaQuery';
import LikhAIDock from './LikhAIDock';

export default function LikhAIRouteDock() {
  const { pathname } = useLocation();
  const mobile = useMediaQuery('(max-width: 768px)');
  const portal = ['/admin', '/artisan-dashboard'].some(root => pathname === root || pathname.startsWith(`${root}/`));
  const mobilePage = pathname.startsWith('/product/') || pathname.startsWith('/shop/')
    || ['/checkout', '/cart', '/chat', '/dashboard'].includes(pathname);
  if (portal || ['/likhai', '/update-password'].includes(pathname) || (mobile && mobilePage)) return null;
  return <LikhAIDock />;
}
