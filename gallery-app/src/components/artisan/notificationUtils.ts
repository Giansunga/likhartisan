import { filterNotifications as filterSharedNotifications, groupNotifications as groupSharedNotifications, notificationCategory, notificationCounts as sharedNotificationCounts, relativeNotificationTime } from '../../lib/notifications';
import type { ArtisanNotification } from '../../types/artisan';

export type NotificationFilter = 'all' | 'unread' | 'orders' | 'messages' | 'system';

export function filterNotifications(notifications: ArtisanNotification[], filter: NotificationFilter) {
  return filterSharedNotifications(notifications, filter);
}

export function notificationCounts(notifications: ArtisanNotification[]) {
  const counts = sharedNotificationCounts(notifications);
  return { ...counts, all: counts.unread };
}

export function groupNotifications(notifications: ArtisanNotification[], now = new Date()) {
  return groupSharedNotifications(notifications, now);
}

export { notificationCategory, relativeNotificationTime };
