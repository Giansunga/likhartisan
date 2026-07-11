import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function TermsPage() {
  useEffect(() => { document.title = 'Terms of Service | LikhArtisan'; }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px 80px' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: 32 }}>Last updated: July 2026</p>

      <div style={{ fontSize: '0.93rem', lineHeight: 1.7, color: 'var(--text-dark)' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>1. Marketplace Overview</h2>
        <p style={{ marginBottom: 10 }}>
          LikhArtisan is an online marketplace connecting buyers with Filipino pottery artisans.
          We facilitate transactions between buyers and independent artisans. All products are
          handmade by third-party sellers.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>2. Accounts</h2>
        <p style={{ marginBottom: 10 }}>
          You must be at least 18 years old to create an account. You are responsible for
          maintaining the security of your account credentials and for all activities under your account.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>3. Orders and Payments</h2>
        <p style={{ marginBottom: 10 }}>
          All payments are processed securely through PayMongo. Prices are in Philippine Pesos (PHP).
          Orders are subject to availability. We reserve the right to cancel orders at our discretion.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>4. Shipping and Delivery</h2>
        <p style={{ marginBottom: 10 }}>
          Shipping is handled by Lalamove for delivery orders. Pickup is available from artisan locations.
          Delivery times are estimates and may vary. Risk of loss transfers to you upon delivery.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>5. Returns and Refunds</h2>
        <p style={{ marginBottom: 10 }}>
          Due to the handmade nature of our products, minor variations are expected. Refunds
          are issued for items that arrive damaged or significantly different from the listing.
          Contact us within 7 days of delivery to request a refund.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>6. Intellectual Property</h2>
        <p style={{ marginBottom: 10 }}>
          All content on this platform, including images, text, and designs, is owned by LikhArtisan
          or its artisans. You may not reproduce or distribute content without written permission.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>7. Limitation of Liability</h2>
        <p style={{ marginBottom: 10 }}>
          LikhArtisan is not liable for indirect, incidental, or consequential damages.
          Our total liability shall not exceed the amount of the transaction in question.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>8. Changes to Terms</h2>
        <p style={{ marginBottom: 10 }}>
          We may update these terms from time to time. Continued use of the platform after
          changes constitutes acceptance of the updated terms.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>9. Contact Us</h2>
        <p>
          For questions about these terms, contact us at{' '}
          <a href="mailto:legal@likhartisan.ph" style={{ color: 'var(--primary-color)' }}>legal@likhartisan.ph</a>
          {' '}or call <a href="tel:+639676711111" style={{ color: 'var(--primary-color)' }}>+63 967 671 1111</a>.
        </p>
      </div>

      <Link to="/" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 40,
        color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem'
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Back to Home
      </Link>
    </div>
  );
}
