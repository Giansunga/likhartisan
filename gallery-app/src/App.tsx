import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import GalleryPage from './pages/GalleryPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ArtisansPage from './pages/ArtisansPage';
import ShopsPage from './pages/ShopsPage';
import ShopPage from './pages/ShopPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import CheckoutSuccessPage from './pages/CheckoutSuccessPage';
import DashboardPage from './pages/DashboardPage';
import AboutPage from './pages/AboutPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ChatPage from './pages/ChatPage';
import ArtisanDashboardPage from './pages/artisan/ArtisanDashboardPage';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/DashboardPage';
import ProductListPage from './pages/admin/ProductListPage';
import ProductCreatePage from './pages/admin/ProductCreatePage';
import ShopCreatePage from './pages/admin/ShopCreatePage';
import ThemeCustomizer from './pages/admin/ThemeCustomizer';
import ArtisanManagePage from './pages/admin/ArtisanManagePage';
import ModelManagePage from './pages/admin/ModelManagePage';
import FreeformPage from './pages/FreeformPage';
import OrderDetailPage from './pages/OrderDetailPage';
import LikhAIDock from './components/LikhAIDock';

export default function App() {
  return (
    <BrowserRouter>
      <LikhAIDock />
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
    </BrowserRouter>
  );
}
