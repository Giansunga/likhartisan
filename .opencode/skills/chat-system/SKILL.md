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

---

## React Native (Mobile) patterns

### Realtime subscription
```tsx
useEffect(() => {
  const channel = supabase
    .channel(`chat-${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        const newMsg = payload.new as any;
        setMessages((prev) => [...prev, {
          id: newMsg.id,
          conversationId: newMsg.conversation_id,
          senderId: newMsg.sender_id,
          text: newMsg.text,
          imageUrl: newMsg.image_url,
          createdAt: newMsg.created_at,
        }]);
      }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [conversationId]);
```

### Send message
```ts
await supabase.from('messages').insert({
  conversation_id: conversationId,
  sender_id: userId,
  text: messageText,
});
// Update conversation last message
await supabase
  .from('conversations')
  .update({ last_message: messageText, last_message_at: new Date().toISOString() })
  .eq('id', conversationId);
```

### Auto-scroll with FlatList
```tsx
const flatListRef = useRef<FlatList>(null);

<FlatList
  ref={flatListRef}
  data={messages}
  keyExtractor={(item) => item.id}
  renderItem={renderMessage}
  onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
/>

// Scroll on new message
useEffect(() => {
  flatListRef.current?.scrollToEnd();
}, [messages.length]);
```

### Message bubble
```tsx
const isMe = item.senderId === userId;
<View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
  <Text style={[styles.text, isMe ? styles.myText : styles.theirText]}>
    {item.text}
  </Text>
</View>
```

### Typing indicator (via Presence)
```ts
const channel = supabase.channel(`typing-${conversationId}`);

channel.on('presence', { event: 'sync' }, () => {
  const state = channel.presenceState();
  setTypingUsers(Object.values(state).flat());
});

await channel.track({ userId, typing: true });
```
