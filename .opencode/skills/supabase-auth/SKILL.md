---
name: supabase-auth
description: Supabase authentication patterns for web and mobile
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: supabase-auth
---

## What I do
- Guide Supabase Auth implementation across web and mobile
- Handle session management and token refresh
- Implement role-based access control (RBAC)
- Manage auth flows (sign up, sign in, password reset, OAuth)

## When to use me
Use this when modifying authentication logic or auth-protected routes.

## Supabase client setup

### Web (gallery-app)
```ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### Mobile (mobile-app)
```ts
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

## Auth flows

### Sign up
```ts
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { name: 'User Name' } },
});
```

### Sign in
```ts
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});
```

### Sign out
```ts
await supabase.auth.signOut();
```

### Password reset
```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'likhartisan://reset-password',
});
```

## Session management

### Web (React Context)
```tsx
const [session, setSession] = useState(null);
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
  });
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => setSession(session)
  );
  return () => subscription.unsubscribe();
}, []);
```

### Mobile (Zustand)
```ts
const useAuthStore = create((set) => ({
  session: null,
  user: null,
  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    set({ session });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
    });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
```

## Role-based access control

### Database roles table
```sql
CREATE TABLE user_roles (
  user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'artisan', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Helper functions
```sql
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_shop_owner(shop_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM shops WHERE id = shop_uuid AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

### Frontend role check
```ts
const { data } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .single();
const isAdmin = data?.role === 'admin';
const isArtisan = data?.role === 'artisan';
```

## Protected routes

### Web (React Router)
```tsx
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/" />;
  return <>{children}</>;
}
```

### Mobile (Expo Router)
```tsx
// In (tabs)/_layout.tsx
const { session, initialized } = useAuthStore();
if (!initialized) return <Loading />;
if (!session) return <Redirect href="/(auth)/sign-in" />;
return <Tabs>...</Tabs>;
```

## User metadata
Access user info:
```ts
const user = session?.user;
const name = user?.user_metadata?.name;
const email = user?.email;
```

## Common issues
1. **Session expired** — Supabase auto-refreshes; handle `onAuthStateChange`
2. **RLS blocks queries** — Ensure user is authenticated and RLS policy allows access
3. **Mobile session persistence** — Must use AsyncStorage (not localStorage)
4. **Password reset redirect** — Set `redirectTo` to app deep link scheme
