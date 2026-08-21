import { Router } from 'express';

const SECURITY_EVENTS = new Set([
  'auth.signed_in',
  'auth.signed_out',
  'auth.password_changed',
  'auth.password_reset',
]);

const CONTEXTS = new Set(['admin', 'artisan', 'buyer', 'system']);
const SEVERITIES = new Set(['info', 'warning', 'critical']);
const EXPORT_LIMIT = 10_000;
const EXPORT_PAGE_SIZE = 1_000;
const SECURITY_DEDUPLICATION_MS = 30_000;
const SECURITY_RATE_WINDOW_MS = 15 * 60 * 1_000;
const SECURITY_RATE_LIMIT = 20;

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows) {
  const columns = [
    'occurred_at', 'actor_label', 'actor_context', 'source', 'category',
    'event_name', 'severity', 'entity_type', 'entity_id', 'entity_label',
    'summary', 'before_data', 'after_data', 'correlation_id',
  ];
  return [
    columns.join(','),
    ...rows.map(row => columns.map(column => csvCell(row[column])).join(',')),
  ].join('\r\n');
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function createActivityRouter({ supabase, verifyAuth, requireSuperAdmin }) {
  const router = Router();
  const recentSecurityEvents = new Map();
  const securityWindows = new Map();

  router.post('/security', async (req, res) => {
    try {
      const userId = await verifyAuth(req, res);
      if (!userId) return;
      const eventName = typeof req.body?.event === 'string' ? req.body.event.trim().toLowerCase() : '';
      if (!SECURITY_EVENTS.has(eventName)) return res.status(400).json({ error: 'Unsupported security event' });
      const now = Date.now();
      const windowStart = now - SECURITY_RATE_WINDOW_MS;
      const attempts = (securityWindows.get(userId) || []).filter(at => at > windowStart);
      if (attempts.length >= SECURITY_RATE_LIMIT) return res.status(429).json({ error: 'Too many security activity requests' });
      attempts.push(now);
      securityWindows.set(userId, attempts);
      const eventKey = `${userId}:${eventName}`;
      if (now - (recentSecurityEvents.get(eventKey) || 0) < SECURITY_DEDUPLICATION_MS) {
        return res.status(202).json({ success: true, deduplicated: true });
      }

      const [{ data: userResult }, { data: roles, error: roleError }] = await Promise.all([
        supabase.auth.admin.getUserById(userId),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);
      if (roleError) throw roleError;
      const roleNames = new Set((roles || []).map(role => role.role));
      const actorContext = roleNames.has('super_admin') ? 'admin' : roleNames.has('shop_owner') ? 'artisan' : 'buyer';
      const user = userResult?.user;
      const actorLabel = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';

      const { error } = await supabase.from('activity_log').insert({
        actor_id: userId,
        actor_label: actorLabel,
        actor_context: actorContext,
        source: actorContext === 'admin' ? 'admin_portal' : actorContext === 'artisan' ? 'artisan_portal' : 'storefront',
        category: 'security',
        event_name: eventName,
        severity: eventName.includes('password') ? 'warning' : 'info',
        entity_type: 'user',
        entity_id: userId,
        entity_label: actorLabel,
        summary: eventName.split('.').join(' ').replace(/\b\w/g, letter => letter.toUpperCase()),
        metadata: { client_assisted: true },
      });
      if (error) throw error;
      recentSecurityEvents.set(eventKey, now);
      return res.status(201).json({ success: true });
    } catch (error) {
      console.error('Activity security event error:', error);
      return res.status(500).json({ error: 'Could not record security activity' });
    }
  });

  router.get('/export', async (req, res) => {
    try {
      const userId = await verifyAuth(req, res);
      if (!userId) return;
      if (!(await requireSuperAdmin(userId))) return res.status(403).json({ error: 'Forbidden: super_admin required' });

      const now = new Date();
      const retentionStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const requestedFrom = validDate(req.query.from);
      const requestedTo = validDate(req.query.to);
      const from = requestedFrom && new Date(requestedFrom) > retentionStart ? requestedFrom : retentionStart.toISOString();
      const to = requestedTo && new Date(requestedTo) < now ? requestedTo : now.toISOString();
      const context = CONTEXTS.has(req.query.context) ? req.query.context : null;
      const severity = SEVERITIES.has(req.query.severity) ? req.query.severity : null;
      const category = typeof req.query.category === 'string' ? req.query.category.slice(0, 80) : null;
      const eventName = typeof req.query.event === 'string' ? req.query.event.slice(0, 120) : null;
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
      const rows = [];
      let offset = 0;
      let truncated = false;

      while (rows.length <= EXPORT_LIMIT) {
        const remaining = EXPORT_LIMIT + 1 - rows.length;
        const pageSize = Math.min(EXPORT_PAGE_SIZE, remaining);
        let query = supabase
          .from('activity_log')
          .select('occurred_at,actor_label,actor_context,source,category,event_name,severity,entity_type,entity_id,entity_label,summary,before_data,after_data,correlation_id')
          .gte('occurred_at', from)
          .lte('occurred_at', to)
          .order('occurred_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (context) query = query.eq('actor_context', context);
        if (severity) query = query.eq('severity', severity);
        if (category) query = query.eq('category', category);
        if (eventName) query = query.eq('event_name', eventName);
        if (search) {
          const escaped = search.replace(/[%,_().]/g, ' ').replace(/\s+/g, ' ').trim();
          if (escaped) query = query.or(`summary.ilike.%${escaped}%,actor_label.ilike.%${escaped}%,entity_label.ilike.%${escaped}%,event_name.ilike.%${escaped}%,entity_id.ilike.%${escaped}%`);
        }
        const { data, error } = await query;
        if (error) throw error;
        const batch = data || [];
        rows.push(...batch);
        offset += batch.length;
        if (batch.length < pageSize) break;
      }
      if (rows.length > EXPORT_LIMIT) { rows.length = EXPORT_LIMIT; truncated = true; }

      const fileDate = now.toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="activity-log-${fileDate}.csv"`);
      res.setHeader('X-Export-Limit', String(EXPORT_LIMIT));
      res.setHeader('X-Export-Truncated', String(truncated));
      return res.send(`\uFEFF${toCsv(rows)}`);
    } catch (error) {
      console.error('Activity export error:', error);
      return res.status(500).json({ error: 'Could not export activity log' });
    }
  });

  return router;
}

export { csvCell, toCsv };
