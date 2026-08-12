import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createPurchasesRouter } from './purchases.js';

async function requestOrders(authenticated) {
  const calls = [];
  const supabase = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { orders: [], total: 0, statusCounts: { all: 0 } }, error: null }; } };
  const verifyAuth = async (_req, res) => { if (!authenticated) { res.status(401).json({ error: 'Unauthorized' }); return null; } return '0d7a41a1-8fc6-4daf-85a1-f1d439e6e768'; };
  const app = express(); app.use(express.json()); app.use('/api/orders', createPurchasesRouter({ supabase, verifyAuth, requireSuperAdmin: async () => false }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { const address = server.address(); const response = await fetch(`http://127.0.0.1:${address.port}/api/orders?status=to-pay&page=2`); return { status: response.status, body: await response.json(), calls }; }
  finally { server.close(); }
}

test('purchase listing requires a verified bearer identity', async () => {
  const response = await requestOrders(false);
  assert.equal(response.status, 401);
  assert.equal(response.calls.length, 0);
});

test('purchase listing derives buyer ID and keeps the fixed page size', async () => {
  const response = await requestOrders(true);
  assert.equal(response.status, 200);
  assert.equal(response.calls[0].name, 'get_buyer_orders_page');
  assert.equal(response.calls[0].args.p_user_id, '0d7a41a1-8fc6-4daf-85a1-f1d439e6e768');
  assert.equal(response.calls[0].args.p_page_size, 10);
});
