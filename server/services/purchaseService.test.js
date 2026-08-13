import assert from 'node:assert/strict';
import test from 'node:test';
import { buyerOrderStatus, mapPurchase, normalizePurchaseQuery, returnEligibility } from './purchaseService.js';

test('derives buyer-facing statuses from real payment and delivery state', () => {
  assert.equal(buyerOrderStatus({ status: 'pending', payment_status: 'pending' }), 'to-pay');
  assert.equal(buyerOrderStatus({ status: 'paid', payment_status: 'failed' }), 'to-pay');
  assert.equal(buyerOrderStatus({ status: 'pending', payment_status: 'paid', delivery_status: 'pending' }), 'to-ship');
  assert.equal(buyerOrderStatus({ status: 'paid', payment_status: 'paid', delivery_status: 'preparing' }), 'to-ship');
  assert.equal(buyerOrderStatus({ status: 'paid', payment_status: 'paid', delivery_status: 'delivered' }), 'to-receive');
  assert.equal(buyerOrderStatus({ status: 'completed', delivery_status: 'completed' }), 'completed');
  assert.equal(buyerOrderStatus({ status: 'refunded', payment_status: 'refunded' }), 'return-refund');
});

test('normalizes bounded purchase filters and fixed sort choices', () => {
  const value = normalizePurchaseQuery({ status: 'invented', q: '  vase   shop  ', page: '-8', sort: 'random', dateFrom: 'bad-date' });
  assert.deepEqual(value, { status: 'all', query: 'vase shop', dateFrom: null, dateTo: null, sort: 'newest', page: 1 });
});

test('maps legacy item keys to the typed purchase contract', () => {
  const purchase = mapPurchase({ id: '0d7a41a1-8fc6-4daf-85a1-f1d439e6e768', items: [{ product_id: 'p1', product_name: 'Vase', qty: 2, price: '250', shop_id: 's1', shop_name: 'Clay House' }], status: 'paid', payment_status: 'paid', delivery_status: 'shipped', total: '500', created_at: '2026-01-01' });
  assert.equal(purchase.shortId, '0D7A41A1');
  assert.equal(purchase.items[0].quantity, 2);
  assert.deepEqual(purchase.shops, [{ id: 's1', name: 'Clay House' }]);
});

test('allows seven days after completion and rejects stale returns', () => {
  const order = { status: 'completed', delivery_status: 'completed' };
  const activity = [{ new_status: 'completed', created_at: '2026-08-01T00:00:00.000Z' }];
  assert.equal(returnEligibility(order, activity, new Date('2026-08-07T23:59:59.000Z')).eligible, true);
  const stale = returnEligibility(order, activity, new Date('2026-08-08T00:00:01.000Z'));
  assert.equal(stale.eligible, false);
  assert.match(stale.reason, /seven-day/i);
});

test('does not fabricate a return deadline before receipt confirmation', () => {
  const eligibility = returnEligibility({ status: 'paid', delivery_status: 'delivered' }, [], new Date('2026-08-12T00:00:00.000Z'));
  assert.deepEqual(eligibility, { eligible: true, reason: '', deadline: null });
});
