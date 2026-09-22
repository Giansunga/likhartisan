// Read-only inventory and private backup for the separately approved test-data reset.
// Run: node scripts/preview-model-reset.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
const db = createClient(url, key, { auth: { persistSession: false } });

async function all(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select('*').range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const [models, designs, requests, orders, revisions, events, messages, notifications,
  points, rules, activity, returns, returnItems, returnEvidence, products] = await Promise.all([
  'models_3d', 'designs', 'design_requests', 'orders', 'design_request_revisions',
  'design_request_events', 'messages', 'notifications', 'model_attachment_points',
  'model_attachment_rules', 'order_activity_log', 'order_return_requests',
  'order_return_items', 'order_return_evidence', 'products',
].map(all));

const modelIds = new Set(models.map((row) => row.id));
const modelFiles = new Set(models.map((row) => row.file_url).filter(Boolean));
const affectedDesigns = designs.filter((row) => modelIds.has(row.model_id) || modelFiles.has(row.model_file));
const affectedRequests = requests.filter((row) =>
  modelIds.has(row.design_snapshot?.model?.id) || modelFiles.has(row.design_snapshot?.model?.file));
const requestIds = new Set(affectedRequests.map((row) => row.id));
const orderIds = new Set(affectedRequests.map((row) => row.order_id).filter(Boolean));
for (const row of orders) if (requestIds.has(row.design_request_id)) orderIds.add(row.id);
const affectedOrders = orders.filter((row) => orderIds.has(row.id));
const affectedRevisions = revisions.filter((row) => requestIds.has(row.request_id));
const affectedEvents = events.filter((row) => requestIds.has(row.request_id));
const affectedMessages = messages.filter((row) => {
  try { return requestIds.has(JSON.parse(row.text)?.request_id); } catch { return false; }
});
const affectedNotifications = notifications.filter((row) =>
  requestIds.has(row.design_request_id) || orderIds.has(row.order_id));
const affectedReturns = returns.filter((row) => orderIds.has(row.order_id));
const returnIds = new Set(affectedReturns.map((row) => row.id));
const backup = {
  models, designs: affectedDesigns, design_requests: affectedRequests, orders: affectedOrders,
  design_request_revisions: affectedRevisions, design_request_events: affectedEvents,
  messages: affectedMessages, notifications: affectedNotifications,
  model_attachment_points: points.filter((row) => modelIds.has(row.model_id)),
  model_attachment_rules: rules.filter((row) => modelIds.has(row.model_id)),
  order_activity_log: activity.filter((row) => orderIds.has(row.order_id)),
  order_return_requests: affectedReturns,
  order_return_items: returnItems.filter((row) => returnIds.has(row.request_id)),
  order_return_evidence: returnEvidence.filter((row) => returnIds.has(row.request_id)),
};

const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
const candidates = [...new Set(models.flatMap((row) => [row.file_url, row.thumbnail]).filter(Boolean))];
const survivingRows = [
  ...designs.filter((row) => !affectedDesigns.includes(row)),
  ...requests.filter((row) => !affectedRequests.includes(row)),
  ...orders.filter((row) => !affectedOrders.includes(row)), ...products,
];
const objects = candidates.map((fileUrl) => {
  const objectKey = publicBase && fileUrl.startsWith(`${publicBase}/models/`)
    ? fileUrl.slice(publicBase.length + 1) : null;
  return {
    url: fileUrl,
    key: objectKey,
    safeToDelete: Boolean(objectKey) && !survivingRows.some((row) => JSON.stringify(row).includes(fileUrl)),
  };
});
const counts = Object.fromEntries(Object.entries(backup).map(([table, rows]) => [table, rows.length]));
const inventory = { createdAt: new Date().toISOString(), projectUrl: url, counts, objects, backup };
const digest = createHash('sha256').update(JSON.stringify({
  ids: Object.fromEntries(Object.entries(backup).map(([table, rows]) => [table, rows.map((row) => row.id).sort()])),
  objects,
})).digest('hex');
const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.model-reset-backups');
await mkdir(outputDir, { recursive: true, mode: 0o700 });
const outputPath = path.join(outputDir, `preview-${Date.now()}.json`);
await writeFile(outputPath, JSON.stringify({ ...inventory, digest }, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ counts, objects: objects.length, safeObjects: objects.filter((item) => item.safeToDelete).length,
  blockedObjects: objects.filter((item) => !item.safeToDelete).length, digest, backupPath: outputPath }, null, 2));
console.log('Preview only. No database rows or R2 objects were deleted.');
