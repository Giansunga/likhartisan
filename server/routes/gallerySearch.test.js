import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createGallerySearchRouter } from './gallerySearch.js';

async function postToRouter({ body, authorization, enabled = true, authResult }) {
  const previousFlag = process.env.AI_GALLERY_SEARCH_ENABLED;
  process.env.AI_GALLERY_SEARCH_ENABLED = enabled ? 'true' : 'false';
  const app = express();
  app.use(express.json());
  const supabase = {
    auth: { getUser: async () => authResult ?? { data: { user: null }, error: new Error('invalid') } },
  };
  app.use('/api/gallery', createGallerySearchRouter({ supabase, searchLimiter: (_req, _res, next) => next() }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/gallery/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
    process.env.AI_GALLERY_SEARCH_ENABLED = previousFlag;
  }
}

test('public search endpoint validates guest query length', async () => {
  const response = await postToRouter({ body: { query: 'x' } });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /2 and 200/);
});

test('optional bearer tokens are verified and invalid tokens are rejected', async () => {
  const response = await postToRouter({
    body: { query: 'terracotta vase' },
    authorization: 'Bearer invalid-token',
  });
  assert.equal(response.status, 401);
});

test('backend feature flag disables the search endpoint without removing gallery browsing', async () => {
  const response = await postToRouter({ body: { query: 'terracotta vase' }, enabled: false });
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'AI_SEARCH_DISABLED');
});
