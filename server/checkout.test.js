import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';

const realFetch = globalThis.fetch;
const buyerId = '00000000-0000-4000-8000-000000000001';
let scenario;
let listener;
let baseUrl;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', SUPABASE_URL: 'https://checkout-test.supabase.co',
    LIKHAI_FRONTEND_SUPABASE_URL: 'https://checkout-test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-service-key', PAYMONGO_SECRET_KEY: 'test-payment-key',
    SENTRY_DSN: '', FRONTEND_URL: 'https://checkout-test.example',
  });
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input);
    if (url.pathname === '/auth/v1/settings') return json({});
    scenario.calls.push(url);
    if (url.pathname === '/auth/v1/user') return json({ id: buyerId, email: 'buyer@example.com' });
    if (url.pathname === '/rest/v1/products') {
      const columns = url.searchParams.get('select').split(',');
      assert.ok(columns.includes('status'), 'Every product query must read its publication status');
      if (scenario.legacy && columns.includes('shipping_weight_g')) {
        return json({ code: '42703', message: 'column shipping_weight_g does not exist' }, 400);
      }
      const id = url.searchParams.get('id').slice(3);
      return json({ id, name: 'Clay Vase', status: scenario.status, price: 500, stock: 8, shop_id: 'shop', shop_name: 'Studio' });
    }
    if (url.pathname === '/rest/v1/product_variations') {
      return json({ id: 'size', product_id: 'vase', price: 600, stock: 4, dimensions: '4 in', measurement_unit: 'in' });
    }
    if (url.href === 'https://api.paymongo.com/v1/checkout_sessions') {
      scenario.paymentRequests.push(JSON.parse(options.body));
      if (scenario.paymentStatus) return json({ errors: [{ code: 'authentication_invalid', detail: 'provider-private-detail' }] }, scenario.paymentStatus);
      return json({ data: { id: 'session-test', attributes: { checkout_url: 'https://payment.example/session-test' } } });
    }
    if (url.pathname === '/rest/v1/orders') {
      scenario.orders.push(JSON.parse(options.body));
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected request in checkout test: ${url.origin}${url.pathname}`);
  };
  const { app } = await import('./server.js');
  listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  baseUrl = `http://127.0.0.1:${listener.address().port}`;
});

beforeEach(() => {
  scenario = { status: 'active', legacy: false, calls: [], paymentRequests: [], orders: [] };
});

after(async () => {
  globalThis.fetch = realFetch;
  if (listener) await new Promise(resolve => listener.close(resolve));
});

async function checkout({ deliveryOption = 'pickup', variation = false } = {}) {
  const response = await realFetch(`${baseUrl}/api/create-checkout`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-buyer-token' },
    body: JSON.stringify({
      items: [{ productId: 'vase', qty: 1, ...(variation ? { variationId: 'size' } : {}) }],
      userName: 'Test Buyer', userPhone: '09123456789', userAddress: 'Test delivery address',
      deliveryOption, quotedShippingFeeCentavos: 50000,
    }),
  });
  return { status: response.status, body: await response.json() };
}

for (const status of ['inactive', 'draft', 'archived']) {
  for (const deliveryOption of ['pickup', 'courier']) {
    test(`rejects ${status} ${deliveryOption} checkout before payment or order creation`, async () => {
      scenario.status = status;
      const response = await checkout({ deliveryOption, variation: true });
      assert.equal(response.status, 409);
      assert.equal(response.body.code, 'ERR_PRODUCT_UNAVAILABLE');
      assert.equal(response.body.productId, 'vase');
      assert.match(response.body.error, /Clay Vase.*unavailable/);
      assert.equal(scenario.paymentRequests.length, 0);
      assert.equal(scenario.orders.length, 0);
    });
  }
}

test('legacy product queries still reject inactive products', async () => {
  scenario.status = 'inactive';
  scenario.legacy = true;
  const response = await checkout();
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'ERR_PRODUCT_UNAVAILABLE');
  assert.equal(scenario.calls.filter(url => url.pathname === '/rest/v1/products').length, 2);
  assert.equal(scenario.paymentRequests.length, 0);
  assert.equal(scenario.orders.length, 0);
});

for (const variation of [false, true]) {
  test(`allows active pickup checkout ${variation ? 'with' : 'without'} a variation`, async () => {
    const response = await checkout({ variation });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(scenario.paymentRequests.length, 1);
    assert.equal(scenario.orders.length, 1);
    assert.equal(scenario.orders[0].subtotal, variation ? 600 : 500);
  });
}

test('allows active products through the legacy query fallback', async () => {
  scenario.legacy = true;
  assert.equal((await checkout()).status, 200);
  assert.equal(scenario.paymentRequests.length, 1);
  assert.equal(scenario.orders.length, 1);
});

test('reports rejected payment credentials without saving an order or exposing provider details', async () => {
  scenario.paymentStatus = 401;
  const response = await checkout();
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'PAYMONGO_AUTHENTICATION_FAILED');
  assert.match(response.body.error, /credentials could not be verified/);
  assert.doesNotMatch(JSON.stringify(response.body), /provider-private-detail/);
  assert.equal(scenario.orders.length, 0);
});
