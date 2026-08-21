import type { Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSessionAccessManager, SessionAccessError } from './authSession';

function session(accessToken: string, expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  return {
    access_token: accessToken,
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: { id: 'customer-id' },
  } as Session;
}

function authClient({ current = session('current-token'), refreshed = session('refreshed-token'), refreshError = null as unknown } = {}) {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session: current }, error: null }),
    refreshSession: vi.fn().mockResolvedValue({ data: { session: refreshError ? null : refreshed }, error: refreshError }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe('session access manager', () => {
  it('returns the current signed-in access token', async () => {
    const auth = authClient();
    const getAccessToken = createSessionAccessManager(auth as never, vi.fn());
    await expect(getAccessToken()).resolves.toBe('current-token');
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes a token that is close to expiry', async () => {
    const auth = authClient({ current: session('old-token', Math.floor(Date.now() / 1000) + 30) });
    const onSession = vi.fn();
    const getAccessToken = createSessionAccessManager(auth as never, onSession);
    await expect(getAccessToken()).resolves.toBe('refreshed-token');
    expect(onSession).toHaveBeenLastCalledWith(expect.objectContaining({ access_token: 'refreshed-token' }));
  });

  it('shares one refresh operation between concurrent callers', async () => {
    const auth = authClient({ current: session('old-token', Math.floor(Date.now() / 1000) + 30) });
    let resolveRefresh: (value: unknown) => void = () => {};
    auth.refreshSession.mockImplementation(() => new Promise(resolve => { resolveRefresh = resolve; }));
    const getAccessToken = createSessionAccessManager(auth as never, vi.fn());

    const first = getAccessToken();
    const second = getAccessToken();
    await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledOnce());
    resolveRefresh({ data: { session: session('shared-token') }, error: null });

    await expect(Promise.all([first, second])).resolves.toEqual(['shared-token', 'shared-token']);
  });

  it('clears a confirmed invalid saved session', async () => {
    const auth = authClient({ refreshError: { status: 400, code: 'refresh_token_not_found' } });
    const onSession = vi.fn();
    const getAccessToken = createSessionAccessManager(auth as never, onSession);
    await expect(getAccessToken({ forceRefresh: true })).rejects.toMatchObject({ kind: 'invalid' } satisfies Partial<SessionAccessError>);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(onSession).toHaveBeenLastCalledWith(null);
  });

  it('keeps the signed-in state during a temporary verification failure', async () => {
    const auth = authClient({ refreshError: { status: 503, code: 'service_unavailable' } });
    const onSession = vi.fn();
    const getAccessToken = createSessionAccessManager(auth as never, onSession);
    await expect(getAccessToken({ forceRefresh: true })).rejects.toMatchObject({ kind: 'unavailable' } satisfies Partial<SessionAccessError>);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(onSession).not.toHaveBeenCalledWith(null);
  });
});
