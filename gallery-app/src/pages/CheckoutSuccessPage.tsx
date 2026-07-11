import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { clearCart } from '../data/store';

const PAYMONGO_API_URL = import.meta.env.VITE_PAYMONGO_API_URL || 'http://localhost:3001';

export default function CheckoutSuccessPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [searchParams] = useSearchParams();
  const attemptRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_ATTEMPTS = 6;
  const RETRY_DELAY = 3000; // 3 seconds between retries

  useEffect(() => {
    // Read localStorage BEFORE clearing it (needed as fallback for session ID)
    const savedSessionId = localStorage.getItem('likhartisan_checkout_session_id');

    // Clear cart — user already passed PayMongo checkout
    clearCart();
    localStorage.removeItem('likhartisan_checkout_session_id');

    function scheduleRetry(fn: () => void, delay: number) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(fn, delay);
    }

    async function confirmPayment() {
      attemptRef.current++;
      const attempt = attemptRef.current;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setMessage('You are not logged in. Please log in and check your orders.');
          setStatus('success'); // Show success-ish — payment likely went through
          return;
        }

        // Get session ID from URL param, falling back to saved localStorage value
        let checkoutSessionId = searchParams.get('session_id');
        if (!checkoutSessionId || checkoutSessionId === '{checkout_session.id}') {
          checkoutSessionId = savedSessionId;
        }

        if (!checkoutSessionId) {
          setStatus('error');
          setMessage('No checkout session ID found. Please check your orders in the dashboard.');
          return;
        }

        console.log(`[CheckoutSuccess] Attempt ${attempt}/${MAX_ATTEMPTS} — session: ${checkoutSessionId}`);

        const res = await fetch(`${PAYMONGO_API_URL}/api/confirm-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: checkoutSessionId,
            userId: session.user.id,
          }),
        });

        const result = await res.json();
        console.log(`[CheckoutSuccess] Response: ${res.status}`, result);

        // Success — payment confirmed and order updated
        if (res.ok && result.success) {
          setStatus('success');
          setMessage('Payment confirmed!');
          return;
        }

        // 402 = PayMongo hasn't marked payment as paid yet — retry after delay
        if (res.status === 402 && attempt < MAX_ATTEMPTS) {
          console.log(`[CheckoutSuccess] Payment not verified yet, retrying in ${RETRY_DELAY / 1000}s...`);
          scheduleRetry(confirmPayment, RETRY_DELAY);
          return;
        }

        // Other server errors — retry if attempts remain
        if (!res.ok && attempt < MAX_ATTEMPTS) {
          console.log(`[CheckoutSuccess] Server error ${res.status}, retrying...`);
          scheduleRetry(confirmPayment, RETRY_DELAY);
          return;
        }

        // All retries exhausted
        setStatus('error');
        setMessage(result.error || 'Payment verification timed out. Please check your orders in the dashboard.');

      } catch (err: any) {
        console.error(`[CheckoutSuccess] Error on attempt ${attempt}:`, err);

        // Network error — retry if attempts remain
        if (attempt < MAX_ATTEMPTS) {
          scheduleRetry(confirmPayment, RETRY_DELAY);
          return;
        }

        setStatus('error');
        setMessage('Unable to verify payment. Please check your orders in the dashboard.');
      }
    }

    // Start first attempt after a short delay to give PayMongo time to process
    scheduleRetry(confirmPayment, 1500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
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
              <Link to="/dashboard?tab=purchases" style={{
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
              width: '72px', height: '72px', borderRadius: '50%', background: '#FFF3E0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#E65100" strokeWidth="2.5" style={{ width: '36px', height: '36px' }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--text-dark)', marginBottom: '8px' }}>Verification Pending</h2>
            <p style={{ color: '#929090', fontSize: '0.9rem', marginBottom: '24px' }}>
              {message || 'We could not verify your payment right now. Your order has been saved — please check your orders for the latest status.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Link to="/dashboard?tab=purchases" style={{
                display: 'block', padding: '14px', background: 'var(--primary-color)', color: '#fff',
                borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none',
              }}>
                Check My Orders
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
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
