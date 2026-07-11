import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div style={{
      minHeight: '70vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center'
    }}>
      <svg viewBox="0 0 120 120" fill="none" style={{ width: 120, height: 120, marginBottom: 24, opacity: 0.6 }}>
        <circle cx="60" cy="60" r="55" stroke="var(--primary-color)" strokeWidth="3" strokeDasharray="8 4" />
        <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle"
          fontSize="40" fontWeight="700" fill="var(--primary-color)">404</text>
        <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle"
          fontSize="11" fill="var(--text-light)">not found</text>
      </svg>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: 8 }}>
        Page Not Found
      </h1>
      <p style={{ fontSize: '0.95rem', color: 'var(--text-light)', marginBottom: 28, maxWidth: 400 }}>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'var(--primary-color)', color: '#fff',
        padding: '12px 28px', borderRadius: 10, textDecoration: 'none',
        fontWeight: 600, fontSize: '0.95rem', transition: 'opacity 0.15s'
      }} onMouseEnter={e => e.currentTarget.style.opacity = '0.85'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Go Home
      </Link>
    </div>
  );
}
