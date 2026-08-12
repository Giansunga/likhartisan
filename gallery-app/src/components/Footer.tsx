import { Phone } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';

const EXPLORE_LINKS = [
  { label: 'Gallery', to: '/gallery' },
  { label: 'Shops', to: '/shops' },
  { label: 'Artisans', to: '/artisans' },
  { label: 'About', to: '/about' },
];

const SHOP_CATEGORIES = ['Vases', 'Planters', 'Jars', 'Amphoras', 'Tea Light Vases'];

export default function Footer() {
  const location = useLocation();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const currentYear = new Date().getFullYear();

  if (
    isMobile
    || location.pathname.startsWith('/admin')
    || location.pathname.startsWith('/artisan-dashboard')
  ) {
    return null;
  }

  const openAuth = (view: 'signin' | 'signup') => {
    window.dispatchEvent(new CustomEvent('open-auth', { detail: { view } }));
  };

  return (
    <footer className="footer" id="main-footer">
      <div className="footer-container">
        <div className="footer-grid">
          <section className="footer-brand">
            <Link to="/" className="footer-logo-link" aria-label="LikhArtisan home">
              <img
                src="/images/likhartisan-brown-wordmark.png"
                alt="LikhArtisan"
                className="footer-logo"
                loading="lazy"
              />
            </Link>
            <a href="tel:+639676711111" className="footer-contact-link">
              <Phone aria-hidden="true" />
              <span>
                <small>Contact us</small>
                +63 967 671 1111
              </span>
            </a>
          </section>

          <nav className="footer-col" aria-labelledby="footer-explore-heading">
            <h2 className="footer-heading" id="footer-explore-heading">Explore</h2>
            <ul className="footer-links">
              {EXPLORE_LINKS.map(({ label, to }) => (
                <li key={label}>
                  <Link to={to}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="footer-col" aria-labelledby="footer-shop-heading">
            <h2 className="footer-heading" id="footer-shop-heading">Shop</h2>
            <ul className="footer-links">
              {SHOP_CATEGORIES.map((category) => (
                <li key={category}>
                  <Link to={`/gallery?category=${encodeURIComponent(category)}`}>{category}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="footer-col" aria-labelledby="footer-account-heading">
            <h2 className="footer-heading" id="footer-account-heading">Create &amp; Account</h2>
            <ul className="footer-links">
              <li>
                <Link to="/freeform">Design Studio</Link>
              </li>
              {user ? (
                <>
                  <li>
                    <Link to="/dashboard?tab=account">My Account</Link>
                  </li>
                  <li>
                    <Link to="/dashboard?tab=purchases">My Purchases</Link>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <button type="button" className="footer-link-btn" onClick={() => openAuth('signin')}>
                      Sign in
                    </button>
                  </li>
                  <li>
                    <button type="button" className="footer-link-btn" onClick={() => openAuth('signup')}>
                      Create account
                    </button>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>

        <div className="footer-bottom">
          <p className="copyright">© {currentYear} LikhArtisan</p>
          <nav className="footer-legal" aria-label="Legal information">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms and Conditions</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
