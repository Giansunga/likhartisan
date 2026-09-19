import { API_BASE } from './api';
import { supabase } from './supabase';

export async function checkoutDesignOrder(orderId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in to continue to payment.');
  const response = await fetch(`${API_BASE}/api/orders/${orderId}/checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const result = await response.json() as { checkoutUrl?: string; checkoutSessionId?: string; error?: string };
  if (!response.ok || !result.checkoutUrl || !result.checkoutSessionId) throw new Error(result.error || 'Unable to start checkout.');
  localStorage.setItem('likhartisan_order_id', orderId);
  localStorage.setItem('likhartisan_checkout_session_id', result.checkoutSessionId);
  window.location.assign(result.checkoutUrl);
}
