import { Navigate, useSearchParams } from 'react-router-dom';
import SellerOverview from '../../components/artisan/SellerOverview';
import ShopProfilePanel from '../../components/artisan/ShopProfilePanel';
import SellerMessages from '../../components/artisan/SellerMessages';
import SellerListings from '../../components/artisan/SellerListings';
import SellerDesignVault from '../../components/artisan/SellerDesignVault';
import SellerNotifications from '../../components/artisan/SellerNotifications';
import SellerRequests from '../../components/artisan/SellerRequests';
import { useArtisanPortal } from '../../components/artisan/artisanContextValue';
import {
  OrdersPanel,
} from './ArtisanDashboardPage';

const legacyPaths: Record<string, string> = {
  overview: '',
  orders: 'orders',
  messages: 'messages',
  listings: 'listings',
  requests: 'requests',
  settings: 'profile',
  vault: 'design-vault',
  notifications: 'notifications',
};

function PageFrame({ children, variant }: { children: React.ReactNode; variant?: 'messages' }) {
  return <div className={`seller-route-page${variant ? ` seller-route-page--${variant}` : ''}`}>{children}</div>;
}

export function ArtisanOverviewRoute() {
  const [params] = useSearchParams();
  const panel = params.get('panel');
  if (panel && legacyPaths[panel] !== undefined && panel !== 'overview') {
    const orderId = params.get('orderId');
    return <Navigate replace to={`/artisan-dashboard/${legacyPaths[panel]}${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''}`} />;
  }
  return <PageFrame><SellerOverview /></PageFrame>;
}

export function ArtisanOrdersRoute() {
  const portal = useArtisanPortal();
  return <PageFrame><OrdersPanel shopId={portal.shop.id} shopName={portal.shop.name} loadingOrders={portal.loadingOrders} setLoadingOrders={portal.setLoadingOrders} /></PageFrame>;
}

export function ArtisanMessagesRoute() {
  return <PageFrame variant="messages"><SellerMessages /></PageFrame>;
}

export function ArtisanListingsRoute() {
  return <PageFrame><SellerListings /></PageFrame>;
}

export function ArtisanVaultRoute() {
  return <PageFrame><SellerDesignVault /></PageFrame>;
}

export function ArtisanRequestsRoute() {
  return <PageFrame><SellerRequests /></PageFrame>;
}

export function ArtisanProfileRoute() {
  return <PageFrame><ShopProfilePanel /></PageFrame>;
}

export function ArtisanNotificationsRoute() {
  return <PageFrame><SellerNotifications /></PageFrame>;
}
