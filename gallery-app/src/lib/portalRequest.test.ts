import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { portalRequest } from './portalRequest';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth } }));
beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'current' } }, error: null });
  auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'refreshed' } }, error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('authenticated portal transport', () => {
  it('refreshes a rejected read once and uses the new token', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"error":"Expired"}', { status: 401 })).mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);
    await expect(portalRequest('/api/orders')).resolves.toEqual({ ok: true });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch.mock.calls[1][1].headers as Headers).get('Authorization')).toBe('Bearer refreshed');
  });
  it.each(['POST', 'PATCH', 'DELETE'])('never automatically repeats a %s write', async method => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"error":"Expired"}', { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    await expect(portalRequest('/api/orders/one', { method })).rejects.toThrow('Expired');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it('preserves the session during a verification outage and sends no request', async () => {
    auth.getSession.mockResolvedValue({ data: {}, error: { status: 503 } });
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(portalRequest('/api/orders')).rejects.toThrow('could not be verified');
    expect(auth.signOut).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed success data rather than confirming a write', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Proxy error</html>')));
    await expect(portalRequest('/api/save', { method: 'POST' })).rejects.toThrow('invalid response');
  });
});
