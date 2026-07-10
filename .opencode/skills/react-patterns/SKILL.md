---
name: react-patterns
description: React component patterns and conventions for LikhArtisan
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: react
---

## What I do
- Guide React component development following LikhArtisan patterns
- Enforce consistent styling (inline styles, CSS variables)
- Handle Supabase data fetching patterns
- Manage auth state and protected routes

## When to use me
Use this when creating or modifying React components.

## Tech stack
- React 19 + React Router v7 + StrictMode
- TypeScript strict mode
- Vite for build
- Supabase for auth/database/storage
- Inline styles (no CSS modules)

## Component patterns
```tsx
// Auth check pattern
const [user, setUser] = useState<any>(null);
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user ?? null);
  });
}, []);
if (!user) return <Navigate to="/" />;

// Data fetching pattern
const [data, setData] = useState<any[]>([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetchData();
}, []);
async function fetchData() {
  const { data, error } = await supabase.from('table').select('*');
  if (error) console.error(error);
  else setData(data);
  setLoading(false);
}
```

## Styling conventions
- Use inline styles with CSS variables: `color: var(--color-primary)`
- System colors: `#823E0B` (primary), `#F7F3EE` (background), `#FFF7ED` (card)
- Fonts: Times New Roman for headings, system-ui for body
- No emojis in code
