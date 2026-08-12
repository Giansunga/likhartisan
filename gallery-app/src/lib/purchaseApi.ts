import { API_BASE } from './api';
import { supabase } from './supabase';

export async function purchaseApi<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in to view your purchases.');
  const response = await fetch(`${API_BASE}/api/orders${path}`, {
    ...init,
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Purchase request failed.');
  return body as T;
}
