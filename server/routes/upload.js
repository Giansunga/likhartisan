import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

export function createUploadRouter({ verifyAuth, requireSuperAdmin }) {
  const router = Router();

  router.post('/presign', async (req, res) => {
    try {
      const userId = await verifyAuth(req, res);
      if (!userId) return;
      if (!(await requireSuperAdmin(userId))) {
        return res.status(403).json({ error: 'Forbidden: super_admin required' });
      }

      const { filename, folder, size } = req.body;
      if (!filename || !folder || !Number.isFinite(Number(size)) || Number(size) <= 0) {
        return res.status(400).json({ error: 'filename, folder, and a valid size are required' });
      }

      const allowedFolders = new Set(['products', 'models']);
      if (!allowedFolders.has(folder)) return res.status(400).json({ error: 'Invalid folder' });

      const ext = String(filename).split('.').pop()?.toLowerCase() || '';
      const resolvedContentType = getContentType(ext);

      const key = `${folder}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: resolvedContentType });
      const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 300 });

      res.json({ presignedUrl, key, publicUrl: `${PUBLIC_URL}/${key}` });
    } catch (error) {
      console.error('Presign error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  return router;
}

function getContentType(ext) {
  const types = {
    glb: 'model/gltf-binary', gltf: 'model/gltf+json',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm',
  };
  return types[ext] || 'application/octet-stream';
}
