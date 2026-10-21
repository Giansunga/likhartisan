import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const MINIMUM_SAVING_BYTES = 1024;

function isGLB(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'glTF'
    && buffer.readUInt32LE(4) === 2
    && buffer.readUInt32LE(8) === buffer.length;
}

export async function createCompressedGLB(buffer) {
  if (!isGLB(buffer)) return null;
  const compressed = await gzipAsync(buffer, { level: 9, mtime: 0 });
  if (compressed.length > buffer.length - MINIMUM_SAVING_BYTES) return null;

  const restored = await gunzipAsync(compressed);
  if (!restored.equals(buffer)) throw new Error('Compressed GLB did not match its source bytes');
  return {
    body: compressed,
    sourceBytes: buffer.length,
    sourceSha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export async function uploadCompressedGLBCopy({ storageClient, bucket, key, buffer }) {
  const variant = await createCompressedGLB(buffer);
  if (!variant) return false;

  return uploadCompressedGLBVariant({ storageClient, bucket, key, variant });
}

export async function uploadCompressedGLBVariant({ storageClient, bucket, key, variant }) {
  await storageClient.send(new PutObjectCommand({
    Bucket: bucket,
    Key: `${key}.gz`,
    Body: variant.body,
    ContentType: 'model/gltf-binary',
    ContentEncoding: 'gzip',
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: {
      'source-sha256': variant.sourceSha256,
      'source-bytes': String(variant.sourceBytes),
    },
  }));
  return true;
}
