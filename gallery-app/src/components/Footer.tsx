import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useState, useEffect } from 'react';

const QUICK_LINKS_LEFT = [
  { label: 'Home', to: '/' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'Shops', to: '/shops' },
];

const QUICK_LINKS_RIGHT = [
  { label: 'About', to: '/about' },
  { label: 'Artisans', to: '/artisans' },
];

const CATEGORIES_LEFT = ['Vases', 'Planters', 'Jars', 'Amphoras'];
const CATEGORIES_RIGHT = ['Tea Light Vases', 'Decorative Pieces', 'Others'];

export default function Footer() {
  const location = useLocation();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/artisan-dashboard')) {
    return null;
  }

  return (
    <footer className="footer" id="main-footer">
      <div className="footer-container">
        <div className="footer-grid">
          {/* Contact */}
          <div className="footer-col">
            <h5 className="footer-heading">CONTACT US</h5>
            <div className="footer-contact">
              <svg viewBox="0 0 45 45" aria-hidden="true">
                <path
                  d="M17.6 25C16.2 22.8 15.2 20.4 14.7 17.7C14.2 15 14.2 12.2 14.9 9.4C15 9.1 15.1 8.8 15.4 8.6C15.7 8.4 16.1 8.3 16.4 8.4L20.6 9.3C20.9 9.4 21.2 9.5 21.4 9.8C21.6 10.1 21.7 10.3 21.7 10.7L21.4 15.5C21.3 15.7 21.3 15.9 21.2 16.1C21.1 16.2 20.9 16.4 20.8 16.5L17.6 18.6C17.9 19.4 18.2 20.3 18.5 21.1C18.9 21.9 19.3 22.7 19.8 23.5C20.3 24.3 20.9 25 21.5 25.6C22.1 26.3 22.8 26.9 23.5 27.4L26.6 25.3C26.8 25.2 27 25.2 27.2 25.1C27.4 25.1 27.6 25.1 27.8 25.2L32.3 26.8C32.6 26.9 32.9 27.1 33 27.4C33.2 27.7 33.2 28 33.2 28.3L32.4 32.5C32.3 32.9 32.1 33.1 31.8 33.3C31.5 33.5 31.2 33.6 30.8 33.5C28 33.1 25.5 32.1 23.2 30.5C20.9 29 19 27.1 17.6 25Z"
                  fill="currentColor"
                />
              </svg>
              <a href="tel:+639676711111" className="footer-contact-link">
                +63 967 671 1111
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="footer-col">
            <h5 className="footer-heading">QUICK LINKS</h5>
            <div className="footer-links-grid">
              <ul className="footer-links">
                {QUICK_LINKS_LEFT.map(({ label, to }) => (
                  <li key={label}>
                    <Link to={to}>{label}</Link>
                  </li>
                ))}
              </ul>
              <ul className="footer-links">
                {QUICK_LINKS_RIGHT.map(({ label, to }) => (
                  <li key={label}>
                    <Link to={to}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Categories */}
          <div className="footer-col">
            <h5 className="footer-heading">CATEGORIES</h5>
            <div className="footer-links-grid">
              <ul className="footer-links">
                {CATEGORIES_LEFT.map((label) => (
                  <li key={label}>
                    <Link to={`/gallery?category=${encodeURIComponent(label)}`}>{label}</Link>
                  </li>
                ))}
              </ul>
              <ul className="footer-links">
                {CATEGORIES_RIGHT.map((label) => (
                  <li key={label}>
                    <Link to={`/gallery?category=${encodeURIComponent(label)}`}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Customers */}
          <div className="footer-col">
            <h5 className="footer-heading">CUSTOMERS</h5>
            <ul className="footer-links">
              {loggedIn ? (
                <li>
                  <Link to="/dashboard?tab=account" className="footer-link-btn">
                    My Account
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <button type="button" className="footer-link-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }))}>
                      Log in
                    </button>
                  </li>
                  <li>
                    <button type="button" className="footer-link-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signup' } }))}>
                      Sign up
                    </button>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Useful Links */}
          <div className="footer-col">
            <h5 className="footer-heading">USEFUL LINKS</h5>
            <ul className="footer-links">
              <li>
                <Link to="/about">Privacy Policy</Link>
              </li>
              <li>
                <Link to="/about">Terms and Conditions</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="copyright">© LikhArtisan 2026</div>
        </div>
      </div>
    </footer>
  );
}
