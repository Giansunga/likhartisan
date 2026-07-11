import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import GalleryPage from './pages/GalleryPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ArtisansPage from './pages/ArtisansPage';
import ShopsPage from './pages/ShopsPage';
import ShopPage from './pages/ShopPage';
import CartPage from './pages/CartPage';
import CheckoutSuccessPage from './pages/CheckoutSuccessPage';
import AboutPage from './pages/AboutPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import OrderDetailPage from './pages/OrderDetailPage';
import LikhAIDock from './components/LikhAIDock';
import AdminLayout from './components/admin/AdminLayout';

// Lazy-loaded heavy pages
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const FreeformPage = lazy(() => import('./pages/FreeformPage'));
const ArtisanDashboardPage = lazy(() => import('./pages/artisan/ArtisanDashboardPage'));

// Admin lazy pages
const AdminDashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const ProductListPage = lazy(() => import('./pages/admin/ProductListPage'));
const ProductCreatePage = lazy(() => import('./pages/admin/ProductCreatePage'));
const ShopCreatePage = lazy(() => import('./pages/admin/ShopCreatePage'));
const ThemeCustomizer = lazy(() => import('./pages/admin/ThemeCustomizer'));
const ArtisanManagePage = lazy(() => import('./pages/admin/ArtisanManagePage'));
const ModelManagePage = lazy(() => import('./pages/admin/ModelManagePage'));

function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
    }}>
      <div style={{
        width: '40px', height: '40px',
        border: '3px solid #E8E0D8',
        borderTopColor: 'var(--primary-color)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LikhAIDock />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="gallery" element={<GalleryPage />} />
            <Route path="product/:id" element={<ProductDetailPage />} />
            <Route path="artisans" element={<ArtisansPage />} />
            <Route path="shops" element={<ShopsPage />} />
            <Route path="shop/:id" element={<ShopPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="checkout/success" element={<CheckoutSuccessPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="order/:id" element={<OrderDetailPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="signin" element={<SignInPage />} />
            <Route path="signup" element={<SignUpPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="freeform" element={<FreeformPage />} />
            <Route path="artisan-dashboard" element={<ArtisanDashboardPage />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="products" element={<ProductListPage />} />
            <Route path="products/create" element={<ProductCreatePage />} />
            <Route path="shops/create" element={<ShopCreatePage />} />
            <Route path="theme" element={<ThemeCustomizer />} />
            <Route path="artisans" element={<ArtisanManagePage />} />
            <Route path="models" element={<ModelManagePage />} />
          </Route>
          <Route path="*" element={<Layout />}>
            <Route path="*" element={<HomePage />} />
          </Route>
        </Routes>
      </Suspense>
      <SpeedInsights />
    </BrowserRouter>
  );
}