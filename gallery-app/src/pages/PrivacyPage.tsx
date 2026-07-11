import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  useEffect(() => { document.title = 'Privacy Policy | LikhArtisan'; }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px 80px' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: 32 }}>Last updated: July 2026</p>

      <div style={{ fontSize: '0.93rem', lineHeight: 1.7, color: 'var(--text-dark)' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>1. Information We Collect</h2>
        <p style={{ marginBottom: 10 }}>
          When you create an account, we collect your email address and display name through Supabase Authentication.
          When you place an order, we collect your full name, phone number, and delivery address.
          Payment information is processed by PayMongo and is never stored on our servers.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>2. How We Use Your Information</h2>
        <p style={{ marginBottom: 10 }}>
          We use your information to process orders, communicate with you about your purchases,
          deliver products through our shipping partner Lalamove, and improve our marketplace.
          We do not sell or rent your personal information to third parties.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>3. Third-Party Services</h2>
        <p style={{ marginBottom: 10 }}>
          We use Supabase for authentication and database, PayMongo for payment processing,
          Lalamove for delivery, and Google Maps for address lookup. Each service has its own
          privacy policy governing how your data is handled.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>4. Cookies</h2>
        <p style={{ marginBottom: 10 }}>
          We use essential cookies to maintain your session and preferences. We do not use
          tracking or advertising cookies.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>5. Data Security</h2>
        <p style={{ marginBottom: 10 }}>
          We implement industry-standard security measures including HTTPS encryption,
          row-level security policies, and regular security audits. However, no method
          of transmission over the Internet is 100% secure.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>6. Your Rights</h2>
        <p style={{ marginBottom: 10 }}>
          You may request access to, correction of, or deletion of your personal data at any time
          by contacting us. You can also update your account information through your dashboard.
        </p>

        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 28, marginBottom: 10 }}>7. Contact Us</h2>
        <p>
          For privacy-related inquiries, contact us at{' '}
          <a href="mailto:privacy@likhartisan.ph" style={{ color: 'var(--primary-color)' }}>privacy@likhartisan.ph</a>
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
