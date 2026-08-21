import type { ActivityFilters, ActivityLogRecord } from '../types/activity';

export const ACTIVITY_PAGE_SIZE = 50;
export const ACTIVITY_CATEGORIES = [
  'orders', 'payments', 'refunds', 'products', 'inventory', 'artisans', 'shops',
  'models', 'designs', 'roles', 'settings', 'messages', 'notifications', 'reviews',
  'security', 'system',
] as const;

const RANGE_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = {
  range: '30d',
  search: '',
  context: '',
  category: '',
  event: '',
  severity: '',
};

export function parseActivityFilters(params: URLSearchParams): ActivityFilters {
  const range = params.get('range');
  const context = params.get('context');
  const severity = params.get('severity');
  return {
    range: range && range in RANGE_MS ? range as ActivityFilters['range'] : '30d',
    search: params.get('search')?.slice(0, 120) || '',
    context: ['admin', 'artisan', 'buyer', 'system'].includes(context || '') ? context as ActivityFilters['context'] : '',
    category: params.get('category')?.slice(0, 80) || '',
    event: params.get('event')?.slice(0, 120) || '',
    severity: ['info', 'warning', 'critical'].includes(severity || '') ? severity as ActivityFilters['severity'] : '',
  };
}

export function activityFiltersToParams(filters: ActivityFilters) {
  const params = new URLSearchParams();
  if (filters.range !== '30d') params.set('range', filters.range);
  if (filters.search) params.set('search', filters.search);
  if (filters.context) params.set('context', filters.context);
  if (filters.category) params.set('category', filters.category);
  if (filters.event) params.set('event', filters.event);
  if (filters.severity) params.set('severity', filters.severity);
  return params;
}

export function getActivityDateRange(range: ActivityFilters['range'], now = new Date()) {
  return {
    from: new Date(now.getTime() - RANGE_MS[range]).toISOString(),
    to: now.toISOString(),
  };
}

export function formatActivityLabel(value: string) {
  return value.replaceAll('.', ' ').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function formatActivityTime(value: string, now = new Date()) {
  const date = new Date(value);
  const delta = now.getTime() - date.getTime();
  if (Number.isNaN(delta)) return 'Unknown time';
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function getActivityDestination(record: ActivityLogRecord): string | null {
  if (!record.entity_id) return null;
  switch (record.entity_type) {
    case 'orders': return `/admin/orders?orderId=${encodeURIComponent(record.entity_id)}`;
    case 'products': return `/admin/products?product=${encodeURIComponent(record.entity_id)}`;
    case 'artisans': return `/admin/artisans?artisan=${encodeURIComponent(record.entity_id)}`;
    case 'models_3d': return `/admin/models?model=${encodeURIComponent(record.entity_id)}`;
    case 'user_roles': return '/admin/roles';
    case 'theme_settings': return '/admin/theme';
    default: return null;
  }
}

export function getActivityChanges(record: ActivityLogRecord) {
  const before = record.before_data || {};
  const after = record.after_data || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => ({ field: key, before: before[key], after: after[key] }));
}

export function sanitizeActivitySearch(value: string) {
  return value.replace(/[%_,().]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

