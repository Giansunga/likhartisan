import assert from 'node:assert/strict';
import test from 'node:test';
import { updateSellerOrderStatus } from './sellerOrderService.js';

function fakeDatabase({ updateRow = { id: 'order-123456', status: 'completed', delivery_status: 'completed' }, notificationError = null, shopOwner = 'seller' } = {}) {
  const calls = { updates: [], notifications: [] };
  const order = {
    id: 'order-123456', user_id: 'buyer', items: [{ shop_id: 'shop', image: 'image.png' }],
    status: 'paid', payment_status: 'paid', delivery_status: 'delivered', order_type: 'product',
  };
  const supabase = {
    from(table) {
      if (table === 'orders') {
        const query = {
          select() { return query; }, eq() { return query; }, is() { return query; },
          update(changes) { calls.updates.push(changes); return query; },
          maybeSingle: async () => ({ data: calls.updates.length ? updateRow : order, error: null }),
          single: async () => ({ data: order, error: null }),
        };
        return query;
      }
      if (table === 'shops') {
        const query = { select() { return query; }, in: async () => ({ data: [{ id: 'shop', owner_id: shopOwner }], error: null }) };
        return query;
      }
      if (table === 'notifications') return { insert: async row => { calls.notifications.push(row); return { error: notificationError }; } };
      throw new Error(`Unexpected table ${table}`);
    },
  };
  return { supabase, calls };
}

test('seller completion saves a confirmed row and notifies the buyer', async () => {
  const { supabase, calls } = fakeDatabase();
  const result = await updateSellerOrderStatus(supabase, 'order-123456', 'seller', 'completed');
  assert.equal(result.notificationSent, true);
  assert.equal(result.order.delivery_status, 'completed');
  assert.deepEqual(calls.updates, [{ delivery_status: 'completed', status: 'completed' }]);
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].user_id, 'buyer');
  assert.equal(calls.notifications[0].type, 'completed');
});

test('a zero-row update never sends a notification', async () => {
  const { supabase, calls } = fakeDatabase({ updateRow: null });
  await assert.rejects(updateSellerOrderStatus(supabase, 'order-123456', 'seller', 'completed'), { message: 'ORDER_CHANGED', status: 409 });
  assert.equal(calls.notifications.length, 0);
});

test('a different seller cannot update the order', async () => {
  const { supabase, calls } = fakeDatabase({ shopOwner: 'another-seller' });
  await assert.rejects(updateSellerOrderStatus(supabase, 'order-123456', 'seller', 'completed'), { status: 403 });
  assert.equal(calls.updates.length, 0);
});

test('a notification failure is reported after the saved update', async () => {
  const { supabase, calls } = fakeDatabase({ notificationError: new Error('notification insert failed') });
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await updateSellerOrderStatus(supabase, 'order-123456', 'seller', 'completed');
    assert.equal(result.notificationSent, false);
    assert.equal(result.order.delivery_status, 'completed');
    assert.equal(calls.updates.length, 1);
  } finally { console.error = originalError; }
});
