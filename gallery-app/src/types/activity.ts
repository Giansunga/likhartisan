export type ActivityActorContext = 'admin' | 'artisan' | 'buyer' | 'system';
export type ActivitySeverity = 'info' | 'warning' | 'critical';
export type ActivitySource = 'admin_portal' | 'artisan_portal' | 'storefront' | 'server' | 'database' | 'system' | 'legacy';

export interface ActivityLogRecord {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_label: string | null;
  actor_context: ActivityActorContext;
  source: ActivitySource;
  category: string;
  event_name: string;
  severity: ActivitySeverity;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  summary: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  correlation_id: string;
}

export interface ActivityFilters {
  range: '24h' | '7d' | '30d' | '90d';
  search: string;
  context: ActivityActorContext | '';
  category: string;
  event: string;
  severity: ActivitySeverity | '';
}

export interface ActivityCursor {
  occurredAt: string;
  id: string;
}

export interface ActivityPageResult {
  records: ActivityLogRecord[];
  nextCursor: ActivityCursor | null;
}

