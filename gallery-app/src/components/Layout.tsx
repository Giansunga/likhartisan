import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, Component, type ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

class LayoutErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: any) { console.error('Page error:', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '40px', textAlign: 'center' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--primary-color)', marginBottom: '8px' }}>Something went wrong</h2>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '20px' }}>An unexpected error occurred.</p>
            <button onClick={() => { this.setState({ hasError: false }); window.location.href = '/'; }}
              style={{ padding: '10px 24px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
              Go Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Layout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isArtisan = location.pathname.startsWith('/artisan-dashboard');
  const isFreeform = location.pathname === '/freeform';
  const hideNavPadding = isAdmin || isArtisan || isFreeform;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <LayoutErrorBoundary>
      <div className="min-h-screen bg-cream">
        <a href="#main-content" style={{
          position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden',
        }} onFocus={(e) => {
          e.currentTarget.style.position = 'fixed';
          e.currentTarget.style.left = '16px';
          e.currentTarget.style.top = '16px';
          e.currentTarget.style.width = 'auto';
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.overflow = 'visible';
          e.currentTarget.style.zIndex = '9999';
          e.currentTarget.style.padding = '12px 24px';
          e.currentTarget.style.background = 'var(--primary-color)';
          e.currentTarget.style.color = '#fff';
          e.currentTarget.style.borderRadius = '8px';
          e.currentTarget.style.fontWeight = '600';
          e.currentTarget.style.textDecoration = 'none';
        }} onBlur={(e) => {
          e.currentTarget.style.position = 'absolute';
          e.currentTarget.style.left = '-10000px';
          e.currentTarget.style.width = '1px';
          e.currentTarget.style.height = '1px';
          e.currentTarget.style.overflow = 'hidden';
        }}>
          Skip to content
        </a>
        <Navbar />
        <main id="main-content" className={hideNavPadding ? '' : 'pt-16 md:pt-20'}>
          <Outlet />
        </main>
        {!isFreeform && <Footer />}
      </div>
    </LayoutErrorBoundary>
  );
}
