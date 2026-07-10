---
name: chat-system
description: Real-time chat and messaging system for LikhArtisan
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: supabase-realtime
---

## What I do
- Guide real-time chat implementation
- Handle Supabase Realtime subscriptions
- Manage conversation and message CRUD
- Implement chat UI patterns

## When to use me
Use this when modifying chat functionality.

## Tech stack
- Supabase Realtime for live updates
- Supabase DB for conversations/messages
- React state for UI

## Database schema
```sql
-- Conversations
conversations (
  id UUID PRIMARY KEY,
  buyer_id UUID REFERENCES auth.users(id),
  shop_id UUID REFERENCES shops(id),
  shop_name TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  buyer_unread INT DEFAULT 0,
  artisan_unread INT DEFAULT 0
)

-- Messages
messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  sender_id UUID REFERENCES auth.users(id),
  content TEXT,
  type TEXT DEFAULT 'text', -- text, product, design
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Realtime subscription
```tsx
useEffect(() => {
  const channel = supabase
    .channel('messages')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    }, (payload) => {
      setMessages(prev => [...prev, payload.new]);
      scrollToBottom();
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [conversationId]);
```

## Auto-scroll pattern
```tsx
const containerRef = useRef<HTMLDivElement>(null);
function scrollToBottom() {
  if (!containerRef.current) return;
  const el = containerRef.current;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  if (nearBottom) {
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }
}
```

## Message grouping
- Consecutive messages from same sender grouped
- Avatar shown once per group
- Timestamp shown on first message of group
