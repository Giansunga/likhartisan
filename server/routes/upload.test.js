import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createUploadRouter } from './upload.js';

async function uploadRequest({ authenticated = true, admin = true, filename = 'vase.jpg', folder = 'products', body = Buffer.from('image'), route = 'file', shopId = '2d7a41a1-8fc6-4daf-85a1-f1d439e6e768', owner = true, roleError = false } = {}) {
  const writes = [];
  const storageClient = { send: async command => { writes.push(command.input); return {}; } };
  const verifyAuth = async (_req, res) => {
    if (!authenticated) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    return '0d7a41a1-8fc6-4daf-85a1-f1d439e6e768';
  };
  const app = express();
  app.use('/api/upload', createUploadRouter({
    verifyAuth,
    requireSuperAdmin: async () => admin,
    supabase: { from: table => {
      assert.equal(table, 'user_roles');
      const filters = {};
      const query = { select: () => query, eq: (key, value) => { filters[key] = value; return query; }, maybeSingle: async () => {
        assert.equal(filters.user_id, '0d7a41a1-8fc6-4daf-85a1-f1d439e6e768');
        assert.equal(filters.role, 'shop_owner');
        assert.equal(filters.shop_id, shopId);
        return { data: owner && shopId === '2d7a41a1-8fc6-4daf-85a1-f1d439e6e768' ? { shop_id: shopId } : null, error: roleError ? { message: 'unavailable' } : null };
      } };
      return query;
    } },
    storageClient,
    bucket: 'test-bucket',
    publicUrl: 'https://files.example.test',
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/upload/${route}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
        'X-File-Name': encodeURIComponent(filename),
        'X-Upload-Folder': folder,
        'X-Shop-Id': shopId,
      },
      body,
    });
    return { status: response.status, body: await response.json(), writes };
  } finally {
    server.close();
  }
}

test('file upload requires a verified admin', async () => {
  const unauthenticated = await uploadRequest({ authenticated: false });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.writes.length, 0);

  const forbidden = await uploadRequest({ admin: false });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.writes.length, 0);
});

test('file upload rejects unsupported types and invalid folders', async () => {
  const type = await uploadRequest({ filename: 'payload.exe' });
  assert.equal(type.status, 400);
  assert.match(type.body.error, /Unsupported file type/);

  const folder = await uploadRequest({ folder: 'unknown' });
  assert.equal(folder.status, 400);
  assert.match(folder.body.error, /Invalid folder/);
});

test('file upload writes to private R2 and returns its public URL', async () => {
  const response = await uploadRequest();
  assert.equal(response.status, 201);
  assert.equal(response.writes.length, 1);
  assert.equal(response.writes[0].Bucket, 'test-bucket');
  assert.equal(response.writes[0].ContentType, 'image/jpeg');
  assert.match(response.body.publicUrl, /^https:\/\/files\.example\.test\/products\/.+\.jpg$/);
});


test('artisan uploads require authentication and an exact shop-owner association', async () => {
  for (const options of [{ authenticated: false, status: 401 }, { owner: false, status: 403 }, { shopId: '3d7a41a1-8fc6-4daf-85a1-f1d439e6e768', status: 403 }, { roleError: true, status: 503 }, { shopId: '../other-shop', status: 400 }, { shopId: '', status: 400 }]) {
    const result = await uploadRequest({ route: 'product-file', admin: false, ...options });
    assert.equal(result.status, options.status);
    assert.equal(result.writes.length, 0);
  }
});

test('an admin without a shop-owner association cannot use artisan uploads', async () => {
  const result = await uploadRequest({ route: 'product-file', admin: true, owner: false });
  assert.equal(result.status, 403);
  assert.equal(result.writes.length, 0);
});

test('artisan uploads use shop-scoped keys for images and GLB models', async () => {
  for (const [filename, folder, contentType] of [['pot.png', 'products', 'image/png'], ['pot.glb', 'models', 'model/gltf-binary']]) {
    const result = await uploadRequest({ route: 'product-file', admin: false, filename, folder });
    assert.equal(result.status, 201);
    assert.equal(result.writes[0].ContentType, contentType);
    assert.match(result.writes[0].Key, new RegExp(`^${folder}/2d7a41a1-8fc6-4daf-85a1-f1d439e6e768/`));
  }
});

test('artisan uploads reject unsupported types, folder mismatches, empty files and oversized files', async () => {
  for (const options of [
    { filename: 'payload.svg' }, { filename: 'video.mp4' }, { filename: 'model.glb', folder: 'products' },
    { filename: 'photo.png', folder: 'models' }, { folder: 'unknown' }, { body: Buffer.alloc(0) },
    { body: Buffer.alloc(5 * 1024 * 1024 + 1) },
  ]) {
    const result = await uploadRequest({ route: 'product-file', admin: false, ...options });
    assert.equal(result.status, 400);
    assert.equal(result.writes.length, 0);
  }
  const model = await uploadRequest({ route: 'product-file', admin: false, filename: 'pot.glb', folder: 'models', body: Buffer.alloc(25 * 1024 * 1024 + 1) });
  assert.equal(model.status, 413);
  assert.match(model.body.error, /25 MB/);
  assert.equal(model.writes.length, 0);
});
