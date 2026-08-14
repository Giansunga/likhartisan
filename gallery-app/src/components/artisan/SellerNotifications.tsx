import NotificationCenter from '../notifications/NotificationCenter';
import { useNotifications } from '../../hooks/useNotifications';
import { useArtisanPortal } from './artisanContextValue';

export default function SellerNotifications() {
  const { userId } = useArtisanPortal();
  const notifications = useNotifications(userId, 'artisan');
  return <NotificationCenter context="artisan" data={notifications} />;
}
