import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomOrderCheckout } from './customOrderCheckoutService.js';

const baseOrder = {
  id: 'order-1', user_id: 'buyer-1', status: 'pending', payment_status: 'pending',
  order_type: 'customized', design_request_id: 'request-1', checkout_session_id: null,
  payment_reference: null, total: 2500, items: [],
};
const baseRequest = {
  id: 'request-1', order_id: 'order-1', buyer_id: 'buyer-1', status: 'approved',
  quoted_price: 2500, design_snapshot: { model: { name: 'Custom vase' } },
};

function fakeSupabase(order = baseOrder, request = baseRequest) {
  const updates = [];
  return {
    updates,
    from(table) {
      if (table === 'orders') {
        return {
          select() { return this; }, update(value) { updates.push(value); return this; },
          eq() { return this; }, neq() { return this; },
          maybeSingle: async () => ({ data: updates.length ? { id: order?.id } : order, error: null }),
        };
      }
      if (table === 'design_requests') {
        return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: request, error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test('rejects missing, non-custom, and paid orders', async () => {
  await assert.rejects(() => createCustomOrderCheckout({
    supabase: fakeSupabase(null), userId: 'buyer-1', orderId: 'missing', secretKey: 'sk_test_x', frontendUrl: 'https://example.com',
  }), error => error.status === 404);
  await assert.rejects(() => createCustomOrderCheckout({
    supabase: fakeSupabase({ ...baseOrder, order_type: 'product' }), userId: 'buyer-1', orderId: 'order-1', secretKey: 'sk_test_x', frontendUrl: 'https://example.com',
  }), error => error.status === 409);
  await assert.rejects(() => createCustomOrderCheckout({
    supabase: fakeSupabase({ ...baseOrder, payment_status: 'paid' }), userId: 'buyer-1', orderId: 'order-1', secretKey: 'sk_test_x', frontendUrl: 'https://example.com',
  }), error => error.status === 409);
});

test('reuses an active custom-order checkout session', async () => {
  const supabase = fakeSupabase({ ...baseOrder, checkout_session_id: 'cs_existing' });
  const result = await createCustomOrderCheckout({
    supabase, userId: 'buyer-1', orderId: 'order-1', secretKey: 'sk_test_x', frontendUrl: 'https://example.com',
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: { id: 'cs_existing', attributes: { status: 'active', checkout_url: 'https://pay/existing' } } }) }),
  });
  assert.deepEqual(result, { orderId: 'order-1', checkoutSessionId: 'cs_existing', checkoutUrl: 'https://pay/existing', reused: true });
  assert.equal(supabase.updates.length, 0);
});

test('creates checkout from the authoritative quote and stores provider correlation', async () => {
  const supabase = fakeSupabase();
  let sent;
  const result = await createCustomOrderCheckout({
    supabase, userId: 'buyer-1', orderId: 'order-1', secretKey: 'sk_test_x', frontendUrl: 'https://shop.example',
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ data: { id: 'cs_new', attributes: { checkout_url: 'https://pay/new' } } }) };
    },
  });
  assert.equal(sent.data.attributes.line_items[0].amount, 250000);
  assert.equal(sent.data.attributes.metadata.orderId, 'order-1');
  assert.match(sent.data.attributes.success_url, /order_id=order-1/);
  assert.equal(supabase.updates[0].checkout_session_id, 'cs_new');
  assert.deepEqual(result, { orderId: 'order-1', checkoutSessionId: 'cs_new', checkoutUrl: 'https://pay/new', reused: false });
});

test('replaces an expired checkout session', async () => {
  const supabase = fakeSupabase({ ...baseOrder, checkout_session_id: 'cs_expired' });
  let calls = 0;
  const result = await createCustomOrderCheckout({
    supabase, userId: 'buyer-1', orderId: 'order-1', secretKey: 'sk_test_x', frontendUrl: 'https://shop.example',
    fetchImpl: async (_url, init) => {
      calls += 1;
      if (init?.method !== 'POST') return { ok: true, json: async () => ({ data: { id: 'cs_expired', attributes: { status: 'expired' } } }) };
      return { ok: true, json: async () => ({ data: { id: 'cs_replacement', attributes: { checkout_url: 'https://pay/replacement' } } }) };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.checkoutSessionId, 'cs_replacement');
  assert.equal(supabase.updates[0].checkout_session_id, 'cs_replacement');
});

test('does not create a duplicate when the existing provider session is paid', async () => {
  const supabase = fakeSupabase({ ...baseOrder, checkout_session_id: 'cs_paid' });
  await assert.rejects(() => createCustomOrderCheckout({
    supabase, userId: 'buyer-1', orderId: 'order-1', secretKey: 'sk_test_x', frontendUrl: 'https://shop.example',
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: { id: 'cs_paid', attributes: { payment_intent: { attributes: { status: 'succeeded' } } } } }) }),
  }), error => error.status === 409);
  assert.equal(supabase.updates.length, 0);
});
