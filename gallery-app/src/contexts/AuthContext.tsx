import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { recordSecurityActivity } from '../lib/activityApi';
import { createSessionAccessManager } from '../lib/authSession';

type AuthReadyState = { promise: Promise<void>; resolve: () => void; settled: boolean };

function createAuthReadyState(): AuthReadyState {
  let resolvePromise = () => {};
  const state: AuthReadyState = {
    promise: new Promise<void>(resolve => { resolvePromise = resolve; }),
    resolve: () => {},
    settled: false,
  };
  state.resolve = () => {
    if (state.settled) return;
    state.settled = true;
    resolvePromise();
  };
  return state;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  getAccessToken: async () => null,
});

// AuthProvider and its long-standing companion hook intentionally share this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const authReady = useMemo(() => createAuthReadyState(), []);
  const sessionAccess = useMemo(() => createSessionAccessManager(supabase.auth, setSession), []);

  const getAccessToken = useCallback(async (options?: { forceRefresh?: boolean }) => {
    await authReady.promise;
    return sessionAccess(options);
  }, [authReady, sessionAccess]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
    }).finally(() => {
      if (!active) return;
      setLoading(false);
      authReady.resolve();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (event === 'SIGNED_IN' && sess?.user) {
        const marker = `${sess.user.id}:${sess.expires_at || ''}`;
        if (sessionStorage.getItem('likhartisan:activity:last-signin') !== marker) {
          sessionStorage.setItem('likhartisan:activity:last-signin', marker);
          window.setTimeout(() => { void recordSecurityActivity('auth.signed_in'); }, 0);
        }
      }
    });

    return () => {
      active = false;
      authReady.resolve();
      sub.subscription.unsubscribe();
    };
  }, [authReady]);

  const user = session?.user ?? null;

  return (
    <AuthContext.Provider value={{ session, user, loading, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}
