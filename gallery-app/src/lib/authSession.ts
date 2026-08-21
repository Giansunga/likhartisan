import type { Session, SupabaseClient } from '@supabase/supabase-js';

type SupabaseAuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'refreshSession' | 'signOut'>;

export type SessionAccessFailureKind = 'invalid' | 'unavailable';

export class SessionAccessError extends Error {
  kind: SessionAccessFailureKind;

  constructor(message: string, kind: SessionAccessFailureKind) {
    super(message);
    this.name = 'SessionAccessError';
    this.kind = kind;
  }
}

const INVALID_SESSION_CODES = new Set([
  'bad_jwt',
  'invalid_token',
  'jwt_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'user_not_found',
]);

export function classifySessionAccessError(error: unknown): SessionAccessFailureKind {
  if (error instanceof SessionAccessError) return error.kind;
  const details = error as { status?: unknown; code?: unknown } | null;
  const status = Number(details?.status);
  const code = String(details?.code || '').toLowerCase();
  if (INVALID_SESSION_CODES.has(code) || [400, 401, 403, 422].includes(status)) return 'invalid';
  return 'unavailable';
}

function wrapSessionError(error: unknown) {
  const kind = classifySessionAccessError(error);
  return new SessionAccessError(
    kind === 'invalid'
      ? 'Your saved session is no longer valid.'
      : 'Your session could not be verified right now.',
    kind,
  );
}

export function createSessionAccessManager(
  auth: SupabaseAuthClient,
  onSession: (session: Session | null) => void,
  minimumValiditySeconds = 60,
) {
  let refreshInFlight: Promise<Session | null> | null = null;

  async function refreshSession() {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const { data, error } = await auth.refreshSession();
        if (error) throw wrapSessionError(error);
        if (!data.session?.access_token) throw new SessionAccessError('Your saved session is no longer valid.', 'invalid');
        onSession(data.session);
        return data.session;
      })().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  return async function getAccessToken(options: { forceRefresh?: boolean } = {}) {
    try {
      const { data, error } = await auth.getSession();
      if (error) throw wrapSessionError(error);
      let current = data.session;
      if (!current) {
        onSession(null);
        return null;
      }

      const expiresSoon = typeof current.expires_at === 'number'
        && current.expires_at <= Math.floor(Date.now() / 1000) + minimumValiditySeconds;
      if (options.forceRefresh || expiresSoon) current = await refreshSession();
      else onSession(current);
      return current?.access_token || null;
    } catch (error) {
      const wrapped = error instanceof SessionAccessError ? error : wrapSessionError(error);
      if (wrapped.kind === 'invalid') {
        onSession(null);
        try { await auth.signOut({ scope: 'local' }); } catch { /* local state is already cleared */ }
      }
      throw wrapped;
    }
  };
}
