import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const router = Router();

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

// Generate presigned upload URL
router.post('/presign', async (req, res) => {
  try {
    const { filename, folder } = req.body;

    if (!filename || !folder) {
      return res.status(400).json({ error: 'filename and folder are required' });
    }

    // Validate folder
    const allowedFolders = ['products', 'models', 'attachments'];
    if (!allowedFolders.includes(folder)) {
      return res.status(400).json({ error: 'Invalid folder' });
    }

    const ext = filename.split('.').pop() || 'bin';
    const key = `${folder}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

    const contentType = getContentType(ext);

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 minutes

    res.json({
      presignedUrl,
      key,
      publicUrl: `${PUBLIC_URL}/${key}`,
    });
  } catch (error) {
    console.error('Presign error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

function getContentType(ext) {
  const types = {
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return types[ext] || 'application/octet-stream';
}

export default router;
