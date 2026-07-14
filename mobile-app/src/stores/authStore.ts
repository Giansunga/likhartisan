import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,

  setSession: (session) => set({ session }),
  setUser: (user) => set({ user }),

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({ session, loading: false, initialized: true });

      if (session?.user) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        if (data) set({ user: data as User });
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ session });
        if (session?.user) {
          const { data } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();
          if (data) set({ user: data as User });
        } else {
          set({ user: null });
        }
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ loading: false, initialized: true });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
