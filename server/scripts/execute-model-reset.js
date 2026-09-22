// Intentionally separate from deployment. Run only after reviewing a preview backup:
// node scripts/execute-model-reset.js <backup-path> <preview-digest>
// To retry failed R2 deletions after DB cleanup, add --retry-objects.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [backupArg, confirmation, retryFlag] = process.argv.slice(2);
const backupDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.model-reset-backups');
const backupPath = path.resolve(backupArg || '');
if (!backupArg || !backupPath.startsWith(`${backupDir}${path.sep}`) || !confirmation) {
  throw new Error('Supply a private preview backup path and its exact digest.');
}
const inventory = JSON.parse(await readFile(backupPath, 'utf8'));
if (confirmation !== inventory.digest) throw new Error('Preview digest does not match.');
if (inventory.projectUrl !== process.env.SUPABASE_URL) throw new Error('Backup belongs to a different Supabase project.');
const retryObjects = retryFlag === '--retry-objects';
if (retryFlag && !retryObjects) throw new Error('Unknown option.');
if (!retryObjects && Date.now() - Date.parse(inventory.createdAt) > 60 * 60 * 1000) {
  throw new Error('Preview is over one hour old. Create and review a fresh preview.');
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

async function all(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select('*').range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function deleteIds(table, rows) {
  const ids = rows.map((row) => row.id);
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { error } = await db.from(table).delete().in('id', ids.slice(offset, offset + 100));
    if (error) throw new Error(`${table} deletion failed: ${error.message}`);
  }
  if (ids.length) console.log(`${table}: deleted ${ids.length}`);
}

if (!retryObjects) {
  // Re-inventory immediately before the irreversible DB phase. A changed digest
  // means new/deleted linked data or a changed object reference; abort untouched.
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'preview-model-reset.js');
  const output = execFileSync(process.execPath, [script], { cwd: path.resolve(backupDir, '..'), encoding: 'utf8' });
  const freshDigest = JSON.parse(output.slice(0, output.indexOf('\nPreview only.'))).digest;
  if (freshDigest !== inventory.digest) throw new Error('Linked data changed after review. Inspect the new preview and try again.');

  // Child rows with explicit links first; remaining child rows use FK cascades.
  await deleteIds('messages', inventory.backup.messages);
  await deleteIds('notifications', inventory.backup.notifications);
  await deleteIds('orders', inventory.backup.orders);
  await deleteIds('design_requests', inventory.backup.design_requests);
  await deleteIds('designs', inventory.backup.designs);
  await deleteIds('models_3d', inventory.backup.models);
}

const [remainingModels, remainingDesigns, remainingRequests, remainingOrders, products] = await Promise.all(
  ['models_3d', 'designs', 'design_requests', 'orders', 'products'].map(all));
const survivors = [...remainingModels, ...remainingDesigns, ...remainingRequests, ...remainingOrders, ...products];
const storage = new S3Client({
  region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const failures = [];
for (const object of inventory.objects) {
  if (!object.safeToDelete || !object.key) continue;
  if (survivors.some((row) => JSON.stringify(row).includes(object.url))) {
    failures.push({ key: object.key, reason: 'still referenced' });
    continue;
  }
  try {
    await storage.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: object.key }));
    console.log(`R2 deleted: ${object.key}`);
  } catch (error) {
    failures.push({ key: object.key, reason: error.message });
  }
}
if (failures.length) {
  console.error(JSON.stringify({ failedObjects: failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log('Database phase complete and all owned, unshared model objects deleted.');
}
