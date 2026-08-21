import { describe, expect, it } from 'vitest';
import {
  activityFiltersToParams, formatActivityLabel, getActivityChanges,
  getActivityDateRange, getActivityDestination, parseActivityFilters,
  sanitizeActivitySearch,
} from './activityLog';
import type { ActivityLogRecord } from '../types/activity';

function record(overrides: Partial<ActivityLogRecord> = {}): ActivityLogRecord {
  return {
    id: 'event-1', occurred_at: '2026-08-15T00:00:00.000Z', actor_id: 'user-1',
    actor_label: 'Maria', actor_context: 'admin', source: 'admin_portal',
    category: 'orders', event_name: 'order.status_changed', severity: 'info',
    entity_type: 'orders', entity_id: 'order/one', entity_label: 'Order one',
    summary: 'Order status changed', before_data: { status: 'paid' },
    after_data: { status: 'completed' }, metadata: {}, correlation_id: 'correlation-1',
    ...overrides,
  };
}

describe('activity log utilities', () => {
  it('parses and serializes supported URL filters', () => {
    const filters = parseActivityFilters(new URLSearchParams('range=7d&context=artisan&category=orders&severity=warning&event=order.created&search=vase'));
    expect(filters).toMatchObject({ range: '7d', context: 'artisan', category: 'orders', severity: 'warning', event: 'order.created', search: 'vase' });
    expect(activityFiltersToParams(filters).toString()).toContain('context=artisan');
  });

  it('falls back from invalid filter values and calculates deterministic ranges', () => {
    expect(parseActivityFilters(new URLSearchParams('range=forever&severity=urgent')).range).toBe('30d');
    const range = getActivityDateRange('24h', new Date('2026-08-15T12:00:00.000Z'));
    expect(range.from).toBe('2026-08-14T12:00:00.000Z');
    expect(range.to).toBe('2026-08-15T12:00:00.000Z');
  });

  it('maps safe destinations and suppresses unsupported targets', () => {
    expect(getActivityDestination(record())).toBe('/admin/orders?orderId=order%2Fone');
    expect(getActivityDestination(record({ entity_type: 'messages' }))).toBeNull();
    expect(getActivityDestination(record({ entity_id: null }))).toBeNull();
  });

  it('formats events, returns changed fields, and strips PostgREST control characters from search', () => {
    expect(formatActivityLabel('payment.status_changed')).toBe('Payment Status Changed');
    expect(getActivityChanges(record())).toEqual([{ field: 'status', before: 'paid', after: 'completed' }]);
    expect(sanitizeActivitySearch('  vase%,(owner)  ')).toBe('vase owner');
  });
});

