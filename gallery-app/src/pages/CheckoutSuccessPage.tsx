import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { clearCart } from '../data/store';

const PAYMONGO_API_URL = import.meta.env.VITE_PAYMONGO_API_URL || 'http://localhost:3001';

export default function CheckoutSuccessPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    // Clear cart immediately on success page load — user already passed PayMongo
    clearCart();
    localStorage.removeItem('likhartisan_checkout_session_id');

    async function markOrderPaid() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setMessage('You are not logged in. Please log in and check your orders.');
          setStatus('success');
          return;
        }

        // Get session ID from URL param, falling back to localStorage
        let checkoutSessionId = searchParams.get('session_id');
        if (!checkoutSessionId || checkoutSessionId === '{checkout_session.id}') {
          checkoutSessionId = localStorage.getItem('likhartisan_checkout_session_id');
        }

        // Call server endpoint to verify payment and update order status
        try {
          const res = await fetch(`${PAYMONGO_API_URL}/api/confirm-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: checkoutSessionId,
              userId: session.user.id,
            }),
          });

          const result = await res.json();
          console.log('[CheckoutSuccess] Server response:', res.status, result);

          if (res.ok && result.success) {
            setStatus('success');
            setMessage('Payment confirmed!');
            return;
          }
        } catch (e) {
          console.warn('[CheckoutSuccess] Server confirm-payment call failed:', e);
        }

        // Retry if order might not be inserted yet
        if (attempts < MAX_ATTEMPTS) {
          attempts++;
          setTimeout(markOrderPaid, 2000);
          return;
        }

        // All strategies exhausted
        setStatus('success');
        setMessage('Payment is being processed. Your order will update shortly.');
      } catch (err) {
        console.error('[CheckoutSuccess] Error:', err);
        setStatus('success');
        setMessage('Payment is being processed. Check your orders shortly.');
      }
    }

    markOrderPaid();
  }, [searchParams]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '48px 40px', maxWidth: '480px', width: '100%',
        textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}>
        {status === 'loading' && (
          <>
            <div style={{ width: '64px', height: '64px', margin: '0 auto 20px', border: '4px solid #E8E0D8', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--text-dark)', marginBottom: '8px' }}>Processing Payment...</h2>
            <p style={{ color: '#929090', fontSize: '0.9rem' }}>Please wait while we confirm your payment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%', background: '#E8F5E9',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="3" style={{ width: '36px', height: '36px' }}>
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--text-dark)', marginBottom: '8px' }}>Payment Successful!</h2>
            <p style={{ color: '#929090', fontSize: '0.9rem', marginBottom: '24px' }}>
              {message || 'Thank you for your order. Your payment has been confirmed.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Link to="/dashboard" style={{
                display: 'block', padding: '14px', background: 'var(--primary-color)', color: '#fff',
                borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none',
              }}>
                View My Orders
              </Link>
              <Link to="/gallery" style={{
                display: 'block', padding: '14px', background: 'transparent', color: 'var(--primary-color)',
                border: '1.5px solid var(--primary-color)', borderRadius: '10px', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none',
              }}>
                Continue Shopping
              </Link>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%', background: '#FFEBEE',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#D32F2F" strokeWidth="3" style={{ width: '36px', height: '36px' }}>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--text-dark)', marginBottom: '8px' }}>Payment Issue</h2>
            <p style={{ color: '#929090', fontSize: '0.9rem', marginBottom: '24px' }}>
              There was an issue with your payment. Please check your orders or try again.
            </p>
            <Link to="/cart" style={{
              display: 'block', padding: '14px', background: 'var(--primary-color)', color: '#fff',
              borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none',
            }}>
              Return to Cart
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
