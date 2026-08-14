import type { NotificationCategory, NotificationContext, NotificationFilter, NotificationRecord } from '../types/notifications';

export const NOTIFICATIONS_CHANGED_EVENT = 'likhartisan:notifications-changed';

export function inferNotificationContext(notification: Pick<NotificationRecord, 'type'> & Partial<Pick<NotificationRecord, 'recipient_context'>>): NotificationContext {
  if (notification.recipient_context === 'artisan' || notification.recipient_context === 'buyer') return notification.recipient_context;
  return notification.type === 'order' || notification.type === 'message' ? 'artisan' : 'buyer';
}

export function normalizeNotification(value: Partial<NotificationRecord> & Pick<NotificationRecord, 'id' | 'user_id' | 'type' | 'created_at'>): NotificationRecord {
  return {
    id: value.id,
    user_id: value.user_id,
    type: value.type,
    title: value.title || 'Notification',
    message: value.message || 'There is a new update for your account.',
    product_image: value.product_image || null,
    order_id: value.order_id || null,
    conversation_id: value.conversation_id || null,
    recipient_context: inferNotificationContext(value),
    read: Boolean(value.read),
    created_at: value.created_at,
  };
}

export function notificationCategory(notification: Pick<NotificationRecord, 'type' | 'order_id'>): NotificationCategory {
  if (notification.order_id || notification.type === 'order' || ['preparing', 'shipped', 'delivered', 'completed', 'cancelled', 'payment'].includes(notification.type)) return 'orders';
  if (notification.type === 'message') return 'messages';
  return 'system';
}

export function notificationDestination(notification: Pick<NotificationRecord, 'recipient_context' | 'type' | 'order_id' | 'conversation_id'>): string {
  const context = inferNotificationContext(notification);
  if (notification.order_id) {
    return context === 'artisan'
      ? `/artisan-dashboard/orders?orderId=${encodeURIComponent(notification.order_id)}`
      : `/dashboard?tab=purchases&order=${encodeURIComponent(notification.order_id)}`;
  }
  if (notification.type === 'message') {
    const base = context === 'artisan' ? '/artisan-dashboard/messages' : '/chat';
    return notification.conversation_id ? `${base}?conversation=${encodeURIComponent(notification.conversation_id)}` : base;
  }
  return context === 'artisan' ? '/artisan-dashboard/notifications' : '/dashboard?tab=notifications';
}

export function notificationViewAllDestination(context: NotificationContext): string {
  return context === 'artisan' ? '/artisan-dashboard/notifications' : '/dashboard?tab=notifications';
}

export function relativeNotificationTime(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(seconds) || seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function filterNotifications(notifications: NotificationRecord[], filter: NotificationFilter): NotificationRecord[] {
  if (filter === 'all') return notifications;
  if (filter === 'unread') return notifications.filter(notification => !notification.read);
  return notifications.filter(notification => notificationCategory(notification) === filter);
}

export function notificationCounts(notifications: NotificationRecord[]) {
  const unread = notifications.filter(notification => !notification.read);
  return {
    all: notifications.length,
    unread: unread.length,
    orders: unread.filter(notification => notificationCategory(notification) === 'orders').length,
    messages: unread.filter(notification => notificationCategory(notification) === 'messages').length,
    system: unread.filter(notification => notificationCategory(notification) === 'system').length,
  };
}

export function groupNotifications(notifications: NotificationRecord[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86_400_000;
  const groups: Record<'Today' | 'Yesterday' | 'Earlier', NotificationRecord[]> = { Today: [], Yesterday: [], Earlier: [] };
  notifications.forEach(notification => {
    const time = new Date(notification.created_at).getTime();
    groups[time >= today ? 'Today' : time >= yesterday ? 'Yesterday' : 'Earlier'].push(notification);
  });
  return Object.entries(groups).filter(([, items]) => items.length) as Array<[string, NotificationRecord[]]>;
}

export function announceNotificationChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
