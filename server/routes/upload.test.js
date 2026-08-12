import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createUploadRouter } from './upload.js';

async function uploadRequest({ authenticated = true, admin = true, filename = 'vase.jpg', folder = 'products', body = Buffer.from('image') } = {}) {
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
    storageClient,
    bucket: 'test-bucket',
    publicUrl: 'https://files.example.test',
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/upload/file`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
        'X-File-Name': encodeURIComponent(filename),
        'X-Upload-Folder': folder,
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
