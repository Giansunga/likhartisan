import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { inspectCheckoutSession, verifyCheckoutSession, verifyPayMongoSignature } from './paymongoService.js';

const order = {
  id: '12bf2bc3-7ae6-47cf-8d2f-7ea333d1f5dd',
  user_id: '0d7a41a1-8fc6-4daf-85a1-f1d439e6e768',
  checkout_session_id: 'cs_test_123',
  payment_reference: 'LA-123',
  total: 500,
};

function session(overrides = {}) {
  return {
    id: 'cs_test_123',
    attributes: {
      status: 'active',
      livemode: false,
      reference_number: 'LA-123',
      metadata: { orderId: order.id, userId: order.user_id },
      payments: [{ id: 'pay_123', attributes: { status: 'paid', amount: 50000, currency: 'PHP', livemode: false } }],
      ...overrides,
    },
  };
}

test('inspects paid records in both checkout and payment intent shapes', () => {
  assert.equal(inspectCheckoutSession(session()).paid, true);
  const nested = session({ payments: [], payment_intent: { id: 'pi_1', attributes: { status: 'succeeded', amount: 50000, currency: 'PHP', payments: [] } } });
  assert.equal(inspectCheckoutSession(nested).paid, true);
});

test('returns pending for an active unpaid session', () => {
  const result = verifyCheckoutSession(session({ payments: [] }), order, { secretKey: 'sk_test_key' });
  assert.deepEqual({ ok: result.ok, paid: result.paid, state: result.state }, { ok: true, paid: false, state: 'pending' });
});

test('accepts a fully matching paid checkout session', () => {
  const result = verifyCheckoutSession(session(), order, { secretKey: 'sk_test_key' });
  assert.equal(result.ok, true);
  assert.equal(result.providerPaymentId, 'pay_123');
});

test('accepts legacy metadata only when order metadata is explicitly optional', () => {
  const legacy = session({ metadata: { userId: order.user_id } });
  assert.equal(verifyCheckoutSession(legacy, order, { secretKey: 'sk_test_key' }).ok, false);
  assert.equal(verifyCheckoutSession(legacy, order, { secretKey: 'sk_test_key', requireOrderMetadata: false }).ok, true);
});

test('rejects a paid session associated with a different checkout id', () => {
  const result = verifyCheckoutSession({ ...session(), id: 'cs_other' }, order, { secretKey: 'sk_test_key' });
  assert.match(result.errors.join(' '), /checkout session/i);
});

for (const [name, overrides, expected] of [
  ['wrong user', { metadata: { orderId: order.id, userId: 'other' } }, 'User metadata'],
  ['wrong order', { metadata: { orderId: 'other', userId: order.user_id } }, 'Order metadata'],
  ['wrong reference', { reference_number: 'LA-other' }, 'reference'],
  ['wrong amount', { payments: [{ id: 'pay_123', attributes: { status: 'paid', amount: 49999, currency: 'PHP', livemode: false } }] }, 'amount'],
  ['wrong currency', { payments: [{ id: 'pay_123', attributes: { status: 'paid', amount: 50000, currency: 'USD', livemode: false } }] }, 'currency'],
  ['wrong environment', { livemode: true, payments: [{ id: 'pay_123', attributes: { status: 'paid', amount: 50000, currency: 'PHP', livemode: true } }] }, 'environment'],
]) {
  test(`rejects ${name}`, () => {
    const result = verifyCheckoutSession(session(overrides), order, { secretKey: 'sk_test_key' });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), new RegExp(expected, 'i'));
  });
}

test('verifies test and live PayMongo signatures and rejects stale payloads', () => {
  const rawBody = Buffer.from('{"data":{"id":"evt_1"}}');
  const secret = 'whsk_secret';
  const timestamp = '1800000000';
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const now = Number(timestamp) * 1000;
  assert.equal(verifyPayMongoSignature({ rawBody, signatureHeader: `t=${timestamp},te=${signature}`, webhookSecret: secret, liveMode: false, now }), true);
  assert.equal(verifyPayMongoSignature({ rawBody, signatureHeader: `t=${timestamp},li=${signature}`, webhookSecret: secret, liveMode: true, now }), true);
  assert.equal(verifyPayMongoSignature({ rawBody, signatureHeader: `t=${timestamp},te=${signature}`, webhookSecret: secret, liveMode: false, now: now + 301000 }), false);
  assert.equal(verifyPayMongoSignature({ rawBody: Buffer.from('altered'), signatureHeader: `t=${timestamp},te=${signature}`, webhookSecret: secret, liveMode: false, now }), false);
  assert.equal(verifyPayMongoSignature({ rawBody, signatureHeader: 'malformed', webhookSecret: secret, liveMode: false, now }), false);
});
