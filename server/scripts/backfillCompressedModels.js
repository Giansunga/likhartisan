import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { uploadCompressedGLBVariant, createCompressedGLB } from '../services/modelCompression.js';

const bucket = process.env.R2_BUCKET;
const uploading = process.argv.includes('--upload');
const listOnly = process.argv.includes('--list-only');
const keysFileArg = process.argv.find(arg => arg.startsWith('--keys-file='));
if (!bucket || !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
  throw new Error('R2 credentials and R2_BUCKET must be configured in the server environment.');
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

async function listModelObjects() {
  const models = [];
  const existingVariants = new Set();
  let continuationToken;
  do {
    const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'models/', ContinuationToken: continuationToken }));
    for (const object of result.Contents || []) {
      if (!object.Key) continue;
      if (object.Key.toLowerCase().endsWith('.glb.gz')) existingVariants.add(object.Key);
      else if (object.Key.toLowerCase().endsWith('.glb')) models.push(object);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return { models, existingVariants };
}

async function bodyToBuffer(body) {
  return Buffer.from(await body.transformToByteArray());
}

const { models: allModels, existingVariants } = await listModelObjects();
const requestedKeys = keysFileArg
  ? new Set((await readFile(keysFileArg.slice('--keys-file='.length), 'utf8')).split(/\r?\n/).map(key => key.trim()).filter(Boolean))
  : null;
const models = requestedKeys ? allModels.filter(object => requestedKeys.has(object.Key)) : allModels;
const missingRequestedModels = requestedKeys ? [...requestedKeys].filter(key => !allModels.some(object => object.Key === key)) : [];
if (listOnly) {
  console.log(JSON.stringify({
    bucket,
    modelsFound: models.length,
    originalBytes: models.reduce((total, item) => total + (item.Size || 0), 0),
    existingVariants: existingVariants.size,
    missingRequestedModels,
    ...(process.argv.includes('--verbose-list') ? { models: models.map(item => ({ key: item.Key, bytes: item.Size, hasGzipCopy: existingVariants.has(`${item.Key}.gz`) })) } : {}),
  }, null, 2));
  process.exit(0);
}

let eligible = 0;
let skipped = 0;
let uploaded = 0;
let originalTotal = 0;
let compressedTotal = 0;
let completed = 0;
const failures = [];
let cursor = 0;
const worker = async () => {
  while (cursor < models.length) {
    const object = models[cursor++];
    const key = object.Key;
    try {
      if (existingVariants.has(`${key}.gz`)) { skipped += 1; completed += 1; continue; }
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await bodyToBuffer(response.Body);
      const variant = await createCompressedGLB(body);
      if (!variant) { skipped += 1; completed += 1; continue; }
      eligible += 1;
      originalTotal += variant.sourceBytes;
      compressedTotal += variant.body.length;

      if (uploading) {
        await uploadCompressedGLBVariant({ storageClient: client, bucket, key, variant });
        uploaded += 1;
      }
      completed += 1;
      console.log(`${completed}/${models.length} ${uploading ? 'stored' : 'checked'} ${key}`);
    } catch (error) {
      completed += 1;
      failures.push({ key, message: error instanceof Error ? error.message : String(error) });
      console.error(`${completed}/${models.length} failed ${key}`);
    }
  }
};
await Promise.all(Array.from({ length: Math.min(4, models.length) }, worker));

const saved = originalTotal - compressedTotal;
const percentage = originalTotal ? Math.round((saved / originalTotal) * 1000) / 10 : 0;
console.log(JSON.stringify({
  mode: uploading ? 'uploaded' : 'preview only',
  bucket,
  modelsFound: models.length,
  eligibleModels: eligible,
  skippedModels: skipped,
  uploadedModels: uploaded,
  failedModels: failures.length,
  missingRequestedModels,
  originalBytes: originalTotal,
  compressedBytes: compressedTotal,
  savedBytes: saved,
  savedPercent: percentage,
}, null, 2));
if (failures.length) process.exitCode = 1;
