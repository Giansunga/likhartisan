import express, { Router } from 'express';
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

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const FOLDER_LIMITS = {
  products: 5 * 1024 * 1024,
  models: MAX_UPLOAD_BYTES,
};

export function createUploadRouter({
  verifyAuth,
  requireSuperAdmin,
  supabase,
  storageClient = r2,
  bucket = BUCKET,
  publicUrl = PUBLIC_URL,
}) {
  const router = Router();

  async function authorizeUpload(req, res) {
    const userId = await verifyAuth(req, res);
    if (!userId) return null;
    if (!(await requireSuperAdmin(userId))) {
      res.status(403).json({ error: 'Forbidden: super_admin required' });
      return null;
    }
    return userId;
  }

  function validateUpload(filename, folder, size) {
    if (!filename || !folder || !Number.isFinite(Number(size)) || Number(size) <= 0) {
      return { error: 'filename, folder, and a valid size are required' };
    }
    if (!Object.hasOwn(FOLDER_LIMITS, folder)) return { error: 'Invalid folder' };

    const ext = String(filename).split('.').pop()?.toLowerCase() || '';
    const contentType = getContentType(ext);
    if (contentType === 'application/octet-stream') return { error: 'Unsupported file type' };
    if (Number(size) > FOLDER_LIMITS[folder]) {
      const limitMb = FOLDER_LIMITS[folder] / (1024 * 1024);
      return { error: `File is too large. Maximum size is ${limitMb} MB` };
    }
    if (!bucket || !publicUrl) return { error: 'File storage is not configured', status: 503 };
    return { ext, contentType };
  }

  router.post('/presign', async (req, res) => {
    try {
      if (!(await authorizeUpload(req, res))) return;

      const { filename, folder, size } = req.body;
      const validation = validateUpload(filename, folder, size);
      if (validation.error) return res.status(validation.status || 400).json({ error: validation.error });

      const key = `${folder}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${validation.ext}`;
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: validation.contentType });
      const presignedUrl = await getSignedUrl(storageClient, command, { expiresIn: 300 });

      res.json({ presignedUrl, key, publicUrl: `${publicUrl}/${key}`, contentType: validation.contentType });
    } catch (error) {
      console.error('Presign error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // Proxy admin uploads through Render. This avoids relying on a public R2 CORS
  // policy and guarantees the Content-Type used for signing and upload matches.
  router.put('/file', express.raw({ type: () => true, limit: `${MAX_UPLOAD_BYTES}b` }), async (req, res) => {
    try {
      if (!(await authorizeUpload(req, res))) return;

      const filename = decodeURIComponent(String(req.headers['x-file-name'] || ''));
      const folder = String(req.headers['x-upload-folder'] || '');
      const size = Buffer.isBuffer(req.body) ? req.body.length : 0;
      const validation = validateUpload(filename, folder, size);
      if (validation.error) return res.status(validation.status || 400).json({ error: validation.error });

      const key = `${folder}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${validation.ext}`;
      await storageClient.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: req.body,
        ContentType: validation.contentType,
      }));

      res.status(201).json({ key, publicUrl: `${publicUrl}/${key}` });
    } catch (error) {
      if (error?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'File is too large. Maximum size is 25 MB' });
      }
      console.error('Upload proxy error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // Artisan product uploads must carry a shop association verified on the server.
  async function authorizeProductUpload(req, res, next) {
    try {
      const userId = await verifyAuth(req, res);
      if (!userId) return;
      const shopId = String(req.headers['x-shop-id'] || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)) {
        return res.status(400).json({ error: 'A valid shop ID is required' });
      }
      if (!supabase) return res.status(503).json({ error: 'Shop verification is unavailable' });
      const { data, error } = await supabase.from('user_roles').select('shop_id')
        .eq('user_id', userId).eq('role', 'shop_owner').eq('shop_id', shopId).maybeSingle();
      if (error) return res.status(503).json({ error: 'Could not verify shop ownership' });
      if (!data) return res.status(403).json({ error: 'You can only upload products for your own shop' });
      req.uploadShopId = shopId;
      next();
    } catch (error) { next(error); }
  }

  router.put('/product-file', authorizeProductUpload, express.raw({ type: () => true, limit: `${MAX_UPLOAD_BYTES}b` }), async (req, res) => {
    try {
      let filename;
      try { filename = decodeURIComponent(String(req.headers['x-file-name'] || '')); }
      catch { return res.status(400).json({ error: 'Invalid filename' }); }
      const folder = String(req.headers['x-upload-folder'] || '');
      const size = Buffer.isBuffer(req.body) ? req.body.length : 0;
      const validation = validateUpload(filename, folder, size);
      if (validation.error) return res.status(validation.status || 400).json({ error: validation.error });
      const allowed = folder === 'models' ? ['glb'] : ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      if (!allowed.includes(validation.ext)) return res.status(400).json({ error: 'Choose a product image or .glb model for the selected folder' });
      const key = `${folder}/${req.uploadShopId}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${validation.ext}`;
      await storageClient.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: req.body, ContentType: validation.contentType }));
      res.status(201).json({ key, publicUrl: `${publicUrl}/${key}` });
    } catch (error) {
      console.error('Product upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }, (error, _req, res, next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'File is too large. Maximum size is 25 MB' });
    next(error);
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
