import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createActivityRouter, toCsv } from './activity.js';

test('CSV output escapes spreadsheet formulas and quotes', () => {
  const csv = toCsv([{ occurred_at: '=NOW()', actor_label: 'A "quoted" actor' }]);
  assert.match(csv, /"'=NOW\(\)"/);
  assert.match(csv, /"A ""quoted"" actor"/);
});

async function requestExport({ authenticated = true, admin = true } = {}) {
  const supabase = { from: () => { throw new Error('query should not run'); } };
  const verifyAuth = async (_req, res) => {
    if (!authenticated) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    return 'admin-id';
  };
  const app = express();
  app.use(express.json());
  app.use('/api/activity', createActivityRouter({ supabase, verifyAuth, requireSuperAdmin: async () => admin }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/activity/export`);
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

test('activity export requires an authenticated super administrator', async () => {
  const unauthenticated = await requestExport({ authenticated: false });
  assert.equal(unauthenticated.status, 401);
  const forbidden = await requestExport({ admin: false });
  assert.equal(forbidden.status, 403);
});

async function requestSecurityEvents(events) {
  const state = { inserts: [] };
  const supabase = {
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email: 'buyer@example.com', user_metadata: {} } },
        }),
      },
    },
    from(table) {
      if (table === 'user_roles') return { select: () => ({ eq: async () => ({ data: [{ role: 'buyer' }], error: null }) }) };
      if (table === 'activity_log') return { insert: async value => { state.inserts.push(value); return { error: null }; } };
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/activity', createActivityRouter({ supabase, verifyAuth: async () => 'buyer-id', requireSuperAdmin: async () => false }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const results = [];
    for (const event of events) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/activity/security`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }),
      });
      results.push({ status: response.status, body: await response.json() });
    }
    return { results, state };
  } finally {
    server.close();
  }
}

test('security activity accepts only supported events and marks them as client-assisted', async () => {
  const result = await requestSecurityEvents(['auth.password_reset']);
  assert.equal(result.results[0].status, 201);
  assert.equal(result.state.inserts.length, 1);
  assert.deepEqual(result.state.inserts[0].metadata, { client_assisted: true });

  const rejected = await requestSecurityEvents(['auth.anything_else']);
  assert.equal(rejected.results[0].status, 400);
  assert.equal(rejected.state.inserts.length, 0);
});

test('security activity deduplicates matching client events', async () => {
  const result = await requestSecurityEvents(['auth.signed_in', 'auth.signed_in']);
  assert.equal(result.results[0].status, 201);
  assert.equal(result.results[1].status, 202);
  assert.equal(result.results[1].body.deduplicated, true);
  assert.equal(result.state.inserts.length, 1);
});
