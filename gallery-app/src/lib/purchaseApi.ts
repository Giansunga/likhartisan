import { API_BASE } from './api';
import { supabase } from './supabase';

async function getPurchaseAccessToken(forceRefresh = false) {
  const sessionResult = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();
  let token = sessionResult.data.session?.access_token;
  if (!token && !forceRefresh) {
    const refreshResult = await supabase.auth.refreshSession();
    token = refreshResult.data.session?.access_token;
  }
  if (!token) throw new Error('Please sign in to view your purchases.');
  return token;
}

export async function purchaseApi<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const request = async (forceRefresh = false) => {
    const token = await getPurchaseAccessToken(forceRefresh);
    const response = await fetch(`${API_BASE}/api/orders${path}`, {
      ...init,
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };

  let { response, body } = await request();
  const message = typeof body?.error === 'string' ? body.error : '';
  if (response.status === 401 && /invalid|expired/i.test(message)) {
    ({ response, body } = await request(true));
  }
  if (!response.ok) throw new Error(body.error || 'Purchase request failed.');
  return body as T;
}
