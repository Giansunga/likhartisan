import { supabase } from './supabase';
import { createSessionAccessManager } from './authSession';
import { getErrorMessage } from './portalErrors';

const sessionAccess = createSessionAccessManager(supabase.auth, () => undefined);

export async function portalRequest<T>(url: string, init: RequestInit = {}, tokenProvider = sessionAccess, responseType: 'json' | 'pdf' = 'json'): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const request = async (forceRefresh = false) => {
    const token = await tokenProvider({ forceRefresh });
    if (!token) throw new Error('Please sign in again to continue.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...init, headers });
    const isPdf = responseType === 'pdf' && response.ok && response.headers.get('content-type')?.split(';')[0] === 'application/pdf';
    const body: unknown = response.status === 204 ? null : isPdf ? await response.blob() : await response.json().catch(() => null);
    if(responseType==='pdf' && response.ok && !isPdf) throw new Error('The server did not return a receipt PDF. Please try again.');
    return { response, body };
  };
  let result = await request();
  // Reads are safe to retry. A write may already have committed: leave retry to the user.
  if (result.response.status === 401 && ['GET', 'HEAD'].includes(method)) result = await request(true);
  if (!result.response.ok) {
    const body = result.body;
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : '';
    throw new Error(message || getErrorMessage(body, 'The request failed. Please try again.'));
  }
  if (result.body == null && result.response.status !== 204) throw new Error('The server returned an invalid response. Please reload before retrying.');
  return result.body as T;
}
