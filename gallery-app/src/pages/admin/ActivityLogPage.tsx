import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ChevronRight, Clock3, Download, FileClock, RefreshCw,
  Search, ShieldAlert, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import {
  ACTIVITY_CATEGORIES, ACTIVITY_PAGE_SIZE, activityFiltersToParams,
  formatActivityLabel, formatActivityTime, getActivityChanges,
  getActivityDateRange, getActivityDestination, parseActivityFilters,
  sanitizeActivitySearch,
} from '../../lib/activityLog';
import { exportActivityLog } from '../../lib/activityApi';
import { usePortalRealtime } from '../../realtime/PortalRealtimeProvider';
import type { ActivityCursor, ActivityFilters, ActivityLogRecord } from '../../types/activity';
import './activity-log.css';

const RANGE_OPTIONS: Array<{ value: ActivityFilters['range']; label: string }> = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function ActivityLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseActivityFilters(searchParams), [searchParams]);
  const [draftSearch, setDraftSearch] = useState(filters.search);
  const [records, setRecords] = useState<ActivityLogRecord[]>([]);
  const [cursor, setCursor] = useState<ActivityCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ActivityLogRecord | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const portalRealtime = usePortalRealtime();
  const subscribe = portalRealtime?.subscribe;
  const realtimeStatus = portalRealtime?.status || 'disconnected';

  useEffect(() => {
    const timer = window.setTimeout(() => setDraftSearch(filters.search), 0);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  const loadRecords = useCallback(async (nextCursor: ActivityCursor | null = null) => {
    if (nextCursor) setLoadingMore(true);
    else setLoading(true);
    if (!nextCursor) setError('');
    try {
      const dateRange = getActivityDateRange(filters.range);
      let query = supabase
        .from('activity_log')
        .select('*')
        .gte('occurred_at', dateRange.from)
        .lte('occurred_at', dateRange.to)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(ACTIVITY_PAGE_SIZE + 1);
      if (filters.context) query = query.eq('actor_context', filters.context);
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.event) query = query.eq('event_name', filters.event);
      if (filters.severity) query = query.eq('severity', filters.severity);
      const search = sanitizeActivitySearch(filters.search);
      if (search) {
        query = query.or(`summary.ilike.%${search}%,actor_label.ilike.%${search}%,entity_label.ilike.%${search}%,event_name.ilike.%${search}%,entity_id.ilike.%${search}%`);
      }
      if (nextCursor) {
        query = query.or(`occurred_at.lt.${nextCursor.occurredAt},and(occurred_at.eq.${nextCursor.occurredAt},id.lt.${nextCursor.id})`);
      }
      const { data, error: queryError } = await query;
      if (queryError) {
        if (queryError.code === '42501') {
          throw new Error('Activity Logs require a super-admin role.');
        }
        throw queryError;
      }
      const page = (data || []) as ActivityLogRecord[];
      const hasMore = page.length > ACTIVITY_PAGE_SIZE;
      const visiblePage = page.slice(0, ACTIVITY_PAGE_SIZE);
      setRecords(current => nextCursor ? [...current, ...visiblePage] : visiblePage);
      const last = visiblePage.at(-1);
      setCursor(hasMore && last ? { occurredAt: last.occurred_at, id: last.id } : null);
      if (!nextCursor) setNewCount(0);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not load activity.';
      if (!nextCursor) setError(message);
      else toast.error(message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRecords(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  useEffect(() => subscribe?.(event => {
    if (event.table === 'activity_log' && event.operation === 'INSERT') setNewCount(count => count + 1);
  }), [subscribe]);

  useEffect(() => {
    if (!selected) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      previousFocusRef.current?.focus();
    };
  }, [selected]);

  function updateFilters(patch: Partial<ActivityFilters>) {
    const next = { ...filters, ...patch };
    setSearchParams(activityFiltersToParams(next), { replace: true });
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    updateFilters({ search: draftSearch.trim() });
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportActivityLog(filters);
      toast.success('Activity log exported.');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  const criticalCount = records.filter(record => record.severity === 'critical').length;

  return (
    <div className="activity-page">
      <header className="activity-page__header">
        <div>
          <p className="activity-page__eyebrow"><ShieldAlert size={15} aria-hidden="true" /> System audit</p>
          <h1>Activity Logs</h1>
          <p>Trace business and security changes across the marketplace. Records are retained for 90 days.</p>
        </div>
        <button className="activity-button activity-button--primary" type="button" disabled={exporting} onClick={() => void handleExport()}>
          {exporting ? <RefreshCw className="activity-spin" size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
          {exporting ? 'Preparing…' : 'Export CSV'}
        </button>
      </header>

      <section className="activity-summary" aria-label="Activity summary">
        <article><FileClock aria-hidden="true" /><div><strong>{records.length}</strong><span>records loaded</span></div></article>
        <article><AlertTriangle aria-hidden="true" /><div><strong>{criticalCount}</strong><span>critical loaded</span></div></article>
        <article><Clock3 aria-hidden="true" /><div><strong>{RANGE_OPTIONS.find(item => item.value === filters.range)?.label}</strong><span>selected window</span></div></article>
      </section>

      {realtimeStatus !== 'connected' && (
        <div className="activity-new" role="status">
          Live updates are {realtimeStatus === 'connecting' ? 'connecting' : 'temporarily unavailable'}.
          <button type="button" onClick={() => void loadRecords()}>Refresh now</button>
        </div>
      )}

      <section className="activity-panel" aria-label="Activity log filters and results">
        <div className="activity-ranges" aria-label="Date range">
          {RANGE_OPTIONS.map(option => (
            <button key={option.value} type="button" aria-pressed={filters.range === option.value} onClick={() => updateFilters({ range: option.value })}>
              {option.label}
            </button>
          ))}
        </div>

        <div className="activity-filters">
          <form className="activity-search" onSubmit={submitSearch}>
            <Search size={17} aria-hidden="true" />
            <input aria-label="Search activity" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} placeholder="Search actor, action, or target" />
            <button type="submit">Search</button>
          </form>
          <label><span>Actor</span><select value={filters.context} onChange={event => updateFilters({ context: event.target.value as ActivityFilters['context'] })}><option value="">All actors</option><option value="admin">Admin</option><option value="artisan">Artisan</option><option value="buyer">Buyer</option><option value="system">System</option></select></label>
          <label><span>Category</span><select value={filters.category} onChange={event => updateFilters({ category: event.target.value })}><option value="">All categories</option>{ACTIVITY_CATEGORIES.map(category => <option key={category} value={category}>{formatActivityLabel(category)}</option>)}</select></label>
          <label><span>Severity</span><select value={filters.severity} onChange={event => updateFilters({ severity: event.target.value as ActivityFilters['severity'] })}><option value="">All severity</option><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label>
          <label><span>Exact event</span><input value={filters.event} onChange={event => updateFilters({ event: event.target.value.trim() })} placeholder="e.g. order.created" /></label>
        </div>

        {newCount > 0 && (
          <button className="activity-new" type="button" onClick={() => void loadRecords()}>
            {newCount} new {newCount === 1 ? 'event' : 'events'} available <RefreshCw size={15} aria-hidden="true" />
          </button>
        )}

        {loading ? <ActivitySkeleton /> : error ? (
          <div className="activity-state" role="alert"><AlertTriangle aria-hidden="true" /><h2>Activity could not be loaded</h2><p>{error}</p><button type="button" onClick={() => void loadRecords()}>Try again</button></div>
        ) : records.length === 0 ? (
          <div className="activity-state"><FileClock aria-hidden="true" /><h2>No matching activity</h2><p>Try a wider date range or clear some filters.</p></div>
        ) : (
          <>
            <div className="activity-table-wrap">
              <table className="activity-table">
                <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Category</th><th>Severity</th><th><span className="sr-only">Details</span></th></tr></thead>
                <tbody>{records.map(record => <ActivityRow key={record.id} record={record} onOpen={() => setSelected(record)} />)}</tbody>
              </table>
            </div>
            <div className="activity-cards">{records.map(record => <ActivityCard key={record.id} record={record} onOpen={() => setSelected(record)} />)}</div>
            {cursor && <button className="activity-load-more" type="button" disabled={loadingMore} onClick={() => void loadRecords(cursor)}>{loadingMore ? 'Loading…' : 'Load older activity'}</button>}
          </>
        )}
      </section>

      {selected && <ActivityDrawer record={selected} closeButtonRef={closeButtonRef} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ActivityRow({ record, onOpen }: { record: ActivityLogRecord; onOpen: () => void }) {
  return <tr className={record.severity !== 'info' ? `activity-row--${record.severity}` : undefined}>
    <td><time dateTime={record.occurred_at} title={new Date(record.occurred_at).toLocaleString()}>{formatActivityTime(record.occurred_at)}</time></td>
    <td><strong>{record.actor_label || 'Unknown'}</strong><span>{formatActivityLabel(record.actor_context)}</span></td>
    <td><strong>{formatActivityLabel(record.event_name)}</strong><span>{record.summary}</span></td>
    <td>{record.entity_label || record.entity_id || '—'}</td>
    <td><span className="activity-category">{formatActivityLabel(record.category)}</span></td>
    <td><span className={`activity-severity activity-severity--${record.severity}`}>{record.severity}</span></td>
    <td><button type="button" aria-label={`View details for ${record.summary}`} onClick={onOpen}><ChevronRight size={18} aria-hidden="true" /></button></td>
  </tr>;
}

function ActivityCard({ record, onOpen }: { record: ActivityLogRecord; onOpen: () => void }) {
  return <button className="activity-card" type="button" onClick={onOpen}>
    <span className="activity-card__top"><time dateTime={record.occurred_at}>{formatActivityTime(record.occurred_at)}</time><span className={`activity-severity activity-severity--${record.severity}`}>{record.severity}</span></span>
    <strong>{formatActivityLabel(record.event_name)}</strong>
    <span>{record.actor_label || 'Unknown'} · {formatActivityLabel(record.actor_context)}</span>
    <span>{record.entity_label || record.entity_id || formatActivityLabel(record.category)}</span>
  </button>;
}

function ActivityDrawer({ record, closeButtonRef, onClose }: { record: ActivityLogRecord; closeButtonRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const changes = getActivityChanges(record);
  const destination = getActivityDestination(record);
  return <div className="activity-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="activity-drawer" role="dialog" aria-modal="true" aria-labelledby="activity-detail-title">
      <header><div><span className={`activity-severity activity-severity--${record.severity}`}>{record.severity}</span><h2 id="activity-detail-title">{formatActivityLabel(record.event_name)}</h2><p>{record.summary}</p></div><button ref={closeButtonRef} type="button" aria-label="Close activity details" onClick={onClose}><X aria-hidden="true" /></button></header>
      <dl>
        <div><dt>Time</dt><dd>{new Date(record.occurred_at).toLocaleString()}</dd></div>
        <div><dt>Actor</dt><dd>{record.actor_label || 'Unknown'} ({formatActivityLabel(record.actor_context)})</dd></div>
        <div><dt>Source</dt><dd>{formatActivityLabel(record.source)}</dd></div>
        <div><dt>Category</dt><dd>{formatActivityLabel(record.category)}</dd></div>
        <div><dt>Target</dt><dd>{record.entity_label || record.entity_id || '—'}</dd></div>
        <div><dt>Correlation ID</dt><dd className="activity-mono">{record.correlation_id}</dd></div>
      </dl>
      <section><h3>Field changes</h3>{changes.length ? <div className="activity-changes">{changes.map(change => <div key={change.field}><strong>{formatActivityLabel(change.field)}</strong><span>{valueLabel(change.before)}</span><ChevronRight size={14} aria-hidden="true" /><span>{valueLabel(change.after)}</span></div>)}</div> : <p className="activity-muted">No field-level comparison is available for this event.</p>}</section>
      {destination && <Link className="activity-button activity-button--primary" to={destination} onClick={onClose}>Open related record <ChevronRight size={16} aria-hidden="true" /></Link>}
    </aside>
  </div>;
}

function ActivitySkeleton() {
  return <div className="activity-skeleton" aria-label="Loading activity"><span /><span /><span /><span /><span /></div>;
}
