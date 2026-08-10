import { describe, expect, it } from 'vitest';
import type { ArtisanNotification } from '../../../types/artisan';
import { filterNotifications, groupNotifications, notificationCounts, relativeNotificationTime } from '../notificationUtils';

const notification = (overrides: Partial<ArtisanNotification>): ArtisanNotification => ({ id: 'one', user_id: 'seller', type: 'system', read: false, created_at: '2026-08-10T08:00:00Z', ...overrides });
const notifications = [
  notification({ id: 'order', order_id: 'order-1', type: 'shipped' }),
  notification({ id: 'message', type: 'message' }),
  notification({ id: 'system', type: 'system', read: true }),
];

describe('seller notification utilities', () => {
  it('calculates unread category counters', () => {
    expect(notificationCounts(notifications)).toEqual({ all: 2, unread: 2, orders: 1, messages: 1, system: 0 });
  });

  it('filters unread and category views', () => {
    expect(filterNotifications(notifications, 'unread').map(item => item.id)).toEqual(['order', 'message']);
    expect(filterNotifications(notifications, 'system').map(item => item.id)).toEqual(['system']);
  });

  it('groups activity by today, yesterday, and earlier', () => {
    const grouped = groupNotifications([
      notification({ id: 'today', created_at: '2026-08-10T08:00:00Z' }),
      notification({ id: 'yesterday', created_at: '2026-08-09T08:00:00Z' }),
      notification({ id: 'earlier', created_at: '2026-08-01T08:00:00Z' }),
    ], new Date('2026-08-10T12:00:00Z'));
    expect(grouped.map(([label]) => label)).toEqual(['Today', 'Yesterday', 'Earlier']);
  });

  it('formats recent timestamps', () => {
    expect(relativeNotificationTime('2026-08-10T11:30:00Z', new Date('2026-08-10T12:00:00Z'))).toBe('30m ago');
  });
});
