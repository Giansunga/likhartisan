import { describe, expect, it } from 'vitest';
import { filterNotifications, groupNotifications, inferNotificationContext, notificationCategory, notificationCounts, notificationDestination, relativeNotificationTime } from '../notifications';
import type { NotificationRecord } from '../../types/notifications';

const notification = (overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id: 'notification-1', user_id: 'user-1', type: 'system', title: 'Update', message: 'Details', recipient_context: 'buyer', read: false, created_at: '2026-08-15T08:00:00Z', ...overrides,
});

describe('notification utilities', () => {
  it('routes buyer and artisan orders to the exact order', () => {
    expect(notificationDestination(notification({ order_id: 'order / 1' }))).toBe('/dashboard?tab=purchases&order=order%20%2F%201');
    expect(notificationDestination(notification({ order_id: 'order-2', recipient_context: 'artisan' }))).toBe('/artisan-dashboard/orders?orderId=order-2');
  });

  it('routes message notifications to the exact conversation with inbox fallbacks', () => {
    expect(notificationDestination(notification({ type: 'message', conversation_id: 'chat / 1' }))).toBe('/chat?conversation=chat%20%2F%201');
    expect(notificationDestination(notification({ type: 'message', recipient_context: 'artisan', conversation_id: 'chat-2' }))).toBe('/artisan-dashboard/messages?conversation=chat-2');
    expect(notificationDestination(notification({ type: 'message', conversation_id: null }))).toBe('/chat');
    expect(notificationDestination(notification({ type: 'message', recipient_context: 'artisan', conversation_id: null }))).toBe('/artisan-dashboard/messages');
  });

  it('uses safe notification-page fallbacks and infers legacy context', () => {
    expect(notificationDestination(notification())).toBe('/dashboard?tab=notifications');
    expect(notificationDestination(notification({ recipient_context: 'artisan' }))).toBe('/artisan-dashboard/notifications');
    expect(inferNotificationContext({ type: 'order' })).toBe('artisan');
    expect(inferNotificationContext({ type: 'completed' })).toBe('buyer');
  });

  it('filters, counts, categorizes, groups, and formats notifications', () => {
    const values = [
      notification({ id: 'order', type: 'shipped', order_id: 'order-1' }),
      notification({ id: 'message', type: 'message' }),
      notification({ id: 'system', type: 'system', read: true, created_at: '2026-08-13T08:00:00Z' }),
    ];
    expect(notificationCategory(values[0])).toBe('orders');
    expect(filterNotifications(values, 'unread').map(value => value.id)).toEqual(['order', 'message']);
    expect(notificationCounts(values)).toEqual({ all: 3, unread: 2, orders: 1, messages: 1, system: 0 });
    expect(groupNotifications(values, new Date('2026-08-15T12:00:00Z')).map(([label]) => label)).toEqual(['Today', 'Earlier']);
    expect(relativeNotificationTime('2026-08-15T11:30:00Z', new Date('2026-08-15T12:00:00Z'))).toBe('30m ago');
  });
});
