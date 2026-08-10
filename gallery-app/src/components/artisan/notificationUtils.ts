import type { ArtisanNotification } from '../../types/artisan';

export type NotificationFilter = 'all' | 'unread' | 'orders' | 'messages' | 'system';

export function notificationCategory(notification: ArtisanNotification) {
  if (notification.order_id) return 'orders' as const;
  if (notification.type === 'message') return 'messages' as const;
  return 'system' as const;
}

export function filterNotifications(notifications: ArtisanNotification[], filter: NotificationFilter) {
  if (filter === 'all') return notifications;
  if (filter === 'unread') return notifications.filter(notification => !notification.read);
  return notifications.filter(notification => notificationCategory(notification) === filter);
}

export function notificationCounts(notifications: ArtisanNotification[]) {
  return {
    all: notifications.filter(notification => !notification.read).length,
    unread: notifications.filter(notification => !notification.read).length,
    orders: notifications.filter(notification => !notification.read && notificationCategory(notification) === 'orders').length,
    messages: notifications.filter(notification => !notification.read && notificationCategory(notification) === 'messages').length,
    system: notifications.filter(notification => !notification.read && notificationCategory(notification) === 'system').length,
  };
}

export function groupNotifications(notifications: ArtisanNotification[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86_400_000;
  const groups = { Today: [] as ArtisanNotification[], Yesterday: [] as ArtisanNotification[], Earlier: [] as ArtisanNotification[] };
  for (const notification of notifications) {
    const value = new Date(notification.created_at).getTime();
    if (value >= today) groups.Today.push(notification);
    else if (value >= yesterday) groups.Yesterday.push(notification);
    else groups.Earlier.push(notification);
  }
  return Object.entries(groups).filter(([, items]) => items.length);
}

export function relativeNotificationTime(iso: string, now = new Date()) {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
