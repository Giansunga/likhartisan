---
name: react-native-expo
description: React Native Expo mobile app patterns for LikhArtisan
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: react-native
---

## What I do
- Guide React Native Expo development for the mobile app
- Handle Expo Router file-based navigation
- Manage React Native Paper UI components
- Implement Zustand state management
- Follow Expo SDK 57 conventions

## When to use me
Use this when creating or modifying the mobile app (`mobile-app/`).

## Tech stack
- Expo SDK 57 with Expo Router v4
- React Native 0.86
- React Native Paper for UI
- Zustand for state management
- Supabase JS client (same as web)
- TypeScript strict mode

## Project structure
```
mobile-app/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root layout (PaperProvider)
│   ├── (auth)/             # Auth group (redirects if logged in)
│   ├── (tabs)/             # Main tabs (redirects if not logged in)
│   ├── product/[id].tsx    # Dynamic routes with brackets
│   └── chat/
│       ├── index.tsx       # /chat
│       └── [id].tsx        # /chat/:id
├── src/
│   ├── types/index.ts      # TypeScript interfaces
│   ├── constants/index.ts  # Colors, spacing, config
│   ├── lib/                # Supabase, API, utils
│   ├── stores/             # Zustand stores
│   └── hooks/              # Custom hooks
```

## Navigation patterns
```tsx
// Link navigation
import { Link, router } from 'expo-router';
<Link href="/product/123" asChild>
  <TouchableOpacity>...</TouchableOpacity>
</Link>

// Programmatic navigation
router.push('/cart');
router.back();

// Dynamic routes
const { id } = useLocalSearchParams<{ id: string }>();
```

## Styling conventions
```tsx
// StyleSheet (not inline styles)
import { StyleSheet } from 'react-native';
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.text },
});

// Use constants for consistency
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants';
```

## Component patterns
```tsx
// FlatList for lists (not ScrollView + map)
<FlatList
  data={items}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <Card item={item} />}
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
/>

// KeyboardAvoidingView for forms
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
>
  <TextInput ... />
</KeyboardAvoidingView>
```

## State management (Zustand)
```tsx
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const useStore = create<MyState>()(
  persist(
    (set, get) => ({ /* state and actions */ }),
    { name: 'storage-key', storage: createJSONStorage(() => AsyncStorage) }
  )
);
```

## Path aliases
- Use `@/` alias for `src/` imports
- Example: `import { COLORS } from '@/constants'`

## Key differences from web
- No CSS variables — use constant objects
- No `className` — use `style` prop
- No `window`/`document` — use React Native APIs
- No `<a>` — use `<Link>` or `router.push()`
- Images via `<Image source={{ uri }} />` (not `<img>`)
- ScrollViews for static content, FlatLists for long lists
