---
name: push-notifications
description: Push notification system for LikhArtisan mobile app
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: expo-notifications
---

## What I do
- Guide Expo push notification implementation
- Handle push token registration and storage
- Manage notification channels and permissions
- Implement backend notification sending via Expo Push API

## When to use me
Use this when adding or modifying push notification functionality.

## Setup

### Install
```bash
npx expo install expo-notifications
```

### app.json config
```json
{
  "expo": {
    "plugins": [
      ["expo-notifications", {
        "icon": "./assets/notification-icon.png",
        "color": "#C1570D",
        "defaultChannel": "default"
      }]
    ]
  }
}
```

## Frontend (React Native)

### Register for notifications
```ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

async function registerForPushNotifications() {
  const { status } = await Notifications.getPermissionsAsync();
  let finalStatus = status;

  if (status !== 'granted') {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    finalStatus = newStatus;
  }

  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C1570D',
    });
  }

  return token.data;
}
```

### Handle foreground notifications
```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
```

### Listen for notifications
```ts
useEffect(() => {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    console.log('Received:', notification);
  });
  const resp = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (url) router.push(url);
  });
  return () => { sub.remove(); resp.remove(); };
}, []);
```

## Backend (Node.js/Express)

### Store push tokens in Supabase
```sql
CREATE TABLE user_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'ios' or 'android'
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, push_token)
);
```

### Send push notifications
```js
async function sendPushNotification(expoPushToken, title, body, data = {}) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}

// Send to multiple users
async function sendBulkNotifications(tokens, title, body, data = {}) {
  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
  }));

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
}
```

## Notification use cases

### Order status update
```js
// When order status changes
const { data: devices } = await supabase
  .from('user_devices')
  .select('push_token')
  .eq('user_id', order.customer_id);

const tokens = devices.map((d) => d.push_token);
await sendBulkNotifications(tokens, 'Order Update', `Your order is now ${status}`, {
  url: `/orders/${order.id}`,
});
```

### New message
```js
const { data: devices } = await supabase
  .from('user_devices')
  .select('push_token')
  .eq('user_id', recipientId);

await sendBulkNotifications(
  devices.map((d) => d.push_token),
  'New Message',
  messageText,
  { url: `/chat/${conversationId}` }
);
```

## Data payload
Notifications can carry data for deep linking:
```ts
const data = response.notification.request.content.data;
if (data.url) router.push(data.url);
```

## Common issues
1. **No token on Android** — Must create notification channel first
2. **Token changes** — Re-register on app update, store with `ON CONFLICT`
3. **Background notifications** — Requires `expo-task-manager` setup
4. **Expo Go limitation** — Push notifications require development build
