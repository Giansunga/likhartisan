import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clearCart, removeCartLines } from '../data/store';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../lib/api';
import { supabase } from '../lib/supabase';
import {
  clearCartCheckoutDraft,
  clearPendingPurchase,
  readPendingPurchase,
} from '../lib/cartCheckout';

export default function CheckoutSuccessPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [searchParams] = useSearchParams();
  const attemptRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);
  const MAX_ATTEMPTS = 6;
  const RETRY_DELAY = 3000; // 3 seconds between retries
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    // Wait until auth state is resolved before deciding anything.
    // Previously this ran with user=null on first paint and bailed out early
    // (Cause 1), consuming the saved session id before the user was known.
    if (authLoading) return;
    if (finishedRef.current) return;

    function scheduleRetry(fn: () => void, delay: number) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(fn, delay);
    }

    async function confirmPayment() {
      attemptRef.current++;
      const attempt = attemptRef.current;

      try {
        if (!user) {
          finishedRef.current = true;
          setMessage('You are not logged in. Please log in and check your orders.');
          setStatus('error');
          return;
        }

        const refParam = searchParams.get('ref');
        const orderId = searchParams.get('order_id') ||
          localStorage.getItem('likhartisan_checkout_order_id') ||
          sessionStorage.getItem('likhartisan_checkout_order_id') || '';
        let checkoutSessionId = searchParams.get('session_id') || '';
        if (!checkoutSessionId || !checkoutSessionId.startsWith('cs_')) {
          checkoutSessionId =
            localStorage.getItem('likhartisan_checkout_session_id') ||
            sessionStorage.getItem('likhartisan_checkout_session_id') ||
            '';
        }

        if (!orderId && !checkoutSessionId) {
          finishedRef.current = true;
          setStatus('error');
          setMessage(
            `No payment order was found. Please check your orders in the dashboard.` +
            (refParam ? ` (Reference: ${refParam})` : '')
          );
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Your sign-in expired. Please sign in and check your orders.');
        const legacy = !orderId;
        const endpoint = legacy
          ? `${API_BASE}/api/confirm-payment`
          : `${API_BASE}/api/orders/${encodeURIComponent(orderId)}/payment/verify`;
        console.log(`[CheckoutSuccess] Attempt ${attempt}/${MAX_ATTEMPTS} — ${legacy ? 'legacy session' : `order ${orderId}`}`);

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify(legacy ? { sessionId: checkoutSessionId } : {}),
        });

        const result = await res.json();
        console.log(`[CheckoutSuccess] Response: ${res.status}`, result);

        // Success — payment confirmed and order updated
        if (res.ok && result.success) {
          finishedRef.current = true;
          // Buy Now keeps the real cart intact. Cart checkout removes only the
          // purchased draft lines so pieces from other artisans remain saved.
          const purchaseKey = orderId || checkoutSessionId;
          const isBuyNow = sessionStorage.getItem('lk_buy_now') === '1';
          if (!isBuyNow) {
            const purchasedLineKeys = readPendingPurchase(purchaseKey);
            if (purchasedLineKeys.length > 0) removeCartLines(purchasedLineKeys);
            else clearCart(); // Backward compatibility for sessions created before scoped drafts.
            clearPendingPurchase(purchaseKey);
            clearCartCheckoutDraft();
          }
          sessionStorage.removeItem('lk_buy_now');
          localStorage.removeItem('likhartisan_checkout_order_id');
          sessionStorage.removeItem('likhartisan_checkout_order_id');
          localStorage.removeItem('likhartisan_checkout_session_id');
          sessionStorage.removeItem('likhartisan_checkout_session_id');
          setStatus('success');
          setMessage('Payment confirmed!');
          return;
        }

        // The server returns 202 only while PayMongo still reports the payment pending.
        if (res.status === 202 && attempt < MAX_ATTEMPTS) {
          console.log(`[CheckoutSuccess] Payment not verified yet, retrying in ${RETRY_DELAY / 1000}s...`);
          scheduleRetry(confirmPayment, RETRY_DELAY);
          return;
        }

        finishedRef.current = true;
        setStatus('error');
        setMessage(res.status === 202
          ? 'Payment verification is still pending. Please check your orders for the latest status.'
          : result.error || 'Unable to verify payment. Please check your orders in the dashboard.');

      } catch (err: unknown) {
        console.error(`[CheckoutSuccess] Error on attempt ${attempt}:`, err);

        finishedRef.current = true;
        setStatus('error');
        setMessage('Unable to verify payment. Please check your orders in the dashboard.');
      }
    }

    // Start first attempt after a short delay to give PayMongo time to process
    scheduleRetry(confirmPayment, 1500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [authLoading, user, searchParams]);

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
