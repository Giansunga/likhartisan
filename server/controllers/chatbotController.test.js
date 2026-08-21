import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buyerOrderStatus,
  detectIntent,
  fallbackReply,
  handleChat,
  initChatbotController,
  normalizeHistory,
  rankProducts,
} from './chatbotController.js';

function responseRecorder() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function fakeSupabase({ tokenUser = null } = {}) {
  const state = { orderOwner: null, metric: null };
  return {
    state,
    auth: { getUser: async token => token === 'valid-token' && tokenUser ? { data: { user: tokenUser }, error: null } : { data: { user: null }, error: new Error('invalid') } },
    from(table) {
      if (table === 'likhai_response_metrics') return { insert: async metric => { state.metric = metric; return { error: null }; } };
      const query = {
        select() { return this; },
        eq(column, value) { if (table === 'orders' && column === 'user_id') state.orderOwner = value; return this; },
        order() { return this; },
        async limit() {
          if (table === 'orders') return { data: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'pending', payment_status: 'paid', delivery_status: 'pending', total: 300, created_at: '2026-08-14T00:00:00Z', items: [] }], error: null };
          if (table === 'products') return { data: [], error: null };
          if (table === 'shops') return { data: [], error: null };
          return { data: [], error: null };
        },
      };
      return query;
    },
  };
}

test('detects English, Filipino, and Taglish support intents', () => {
  assert.equal(detectIntent('Where is my order?').primary, 'order');
  assert.equal(detectIntent('Magkano ang terracotta na paso?').primary, 'product');
  assert.equal(detectIntent('Paano magbayad using GCash?').primary, 'checkout');
  assert.equal(detectIntent('Gusto ko i-customize ang kulay sa Freeform').primary, 'freeform');
});

test('normalizes history without duplicating the current user message', () => {
  const result = normalizeHistory([
    { role: 'assistant', content: 'Hello' },
    { role: 'user', content: 'Track my order' },
  ], 'Track my order');
  assert.deepEqual(result, [
    { role: 'assistant', content: 'Hello' },
    { role: 'user', content: 'Track my order' },
  ]);
});

test('ranks matching products and uses the plural materials field', () => {
  const products = [
    { name: 'Blue Porcelain Vase', materials: 'Porcelain', category: 'Vase', price: 800 },
    { name: 'Terracotta Bowl', materials: 'Terracotta clay', category: 'Bowl', price: 450 },
  ];
  assert.equal(rankProducts(products, 'May terracotta bowl ba?')[0].name, 'Terracotta Bowl');
  assert.equal(rankProducts(products, 'May banga under 700?').length, 0);
  assert.equal(rankProducts(products, 'Porcelain vase under 900')[0].name, 'Blue Porcelain Vase');
});

test('matches the buyer-facing paid order status rules', () => {
  assert.equal(buyerOrderStatus('pending', 'paid', 'pending'), 'to-ship');
  assert.equal(buyerOrderStatus('pending', 'pending', 'pending'), 'to-pay');
  assert.equal(buyerOrderStatus('processing', 'paid', 'delivered'), 'to-receive');
});

test('uses verified order data in the provider fallback reply', () => {
  const reply = fallbackReply('order', false, 'Track my order', [{
    type: 'order', shortId: 'abcd1234', status: 'to-ship',
  }]);
  assert.equal(reply, 'I found 1 verified order. Your newest order, #abcd1234, is To Ship. Open the order card for the full details.');
  assert.doesNotMatch(reply, /could not generate/i);
});

test('does not refer to a missing order card in the provider fallback reply', () => {
  const reply = fallbackReply('order', false, 'Track my order', []);
  assert.equal(reply, 'I could not find a verified order for this account. Check My Purchases for the latest details.');
  assert.doesNotMatch(reply, /card below/i);
});

test('does not refer to unavailable verified options for a general fallback reply', () => {
  assert.doesNotMatch(fallbackReply('general', false, 'Hello', []), /below/i);
});

test('requires sign-in for order lookup without querying customer orders', async () => {
  const database = fakeSupabase();
  initChatbotController(database);
  const response = responseRecorder();
  await handleChat({ headers: {}, body: { message: 'Nasaan ang order ko?', userId: 'forged-user' } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.requiresAuth, true);
  assert.equal(database.state.orderOwner, null);
  assert.equal(response.body.actions[0].href, '/signin');
});

test('derives order ownership from the verified bearer token and ignores body userId', async () => {
  const database = fakeSupabase({ tokenUser: { id: 'verified-owner' } });
  initChatbotController(database);
  const response = responseRecorder();
  await handleChat({ headers: { authorization: 'Bearer valid-token' }, body: { message: 'Track my order', userId: 'victim-user' } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(database.state.orderOwner, 'verified-owner');
  assert.equal(response.body.cards[0].status, 'to-ship');
  assert.equal(response.body.generationStatus, 'fallback');
  assert.equal(database.state.metric.authenticated, true);
  assert.equal('user_id' in database.state.metric, false);
});

test('rejects an invalid optional bearer token', async () => {
  const database = fakeSupabase();
  initChatbotController(database);
  const response = responseRecorder();
  await handleChat({ headers: { authorization: 'Bearer invalid' }, body: { message: 'Shipping info' } }, response);
  assert.equal(response.statusCode, 401);
});
