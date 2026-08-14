import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNotificationRecipient } from './notificationService.js';

function fakeSupabase({ conversation, shop, order, shops = [], role }) {
  return {
    from(table) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        limit() { return builder; },
        maybeSingle: async () => ({ data: table === 'user_roles' ? role : null, error: null }),
        single: async () => {
          const data = table === 'conversations' ? conversation : table === 'orders' ? order : shop;
          return data ? { data, error: null } : { data: null, error: new Error('not found') };
        },
        in: async () => ({ data: shops, error: null }),
      };
      return builder;
    },
  };
}

test('buyer message targets the conversation artisan', async () => {
  const supabase = fakeSupabase({ conversation: { id: 'conversation-1', buyer_id: 'buyer-1', shop_id: 'shop-1' }, shop: { owner_id: 'artisan-1' } });
  assert.deepEqual(await resolveNotificationRecipient(supabase, 'buyer-1', { type: 'message', conversation_id: 'conversation-1' }), {
    user_id: 'artisan-1', recipient_context: 'artisan', conversation_id: 'conversation-1', order_id: null,
  });
});

test('artisan reply targets the conversation buyer', async () => {
  const supabase = fakeSupabase({ conversation: { id: 'conversation-1', buyer_id: 'buyer-1', shop_id: 'shop-1' }, shop: { owner_id: 'artisan-1' } });
  assert.deepEqual(await resolveNotificationRecipient(supabase, 'artisan-1', { type: 'message', conversation_id: 'conversation-1' }), {
    user_id: 'buyer-1', recipient_context: 'buyer', conversation_id: 'conversation-1', order_id: null,
  });
});

test('resolves a legacy shop owner from the scoped role record', async () => {
  const supabase = fakeSupabase({
    conversation: { id: 'conversation-1', buyer_id: 'buyer-1', shop_id: 'shop-1' },
    shop: { id: 'shop-1', owner_id: null },
    role: { user_id: 'artisan-1' },
  });
  assert.deepEqual(await resolveNotificationRecipient(supabase, 'buyer-1', { type: 'message', conversation_id: 'conversation-1' }), {
    user_id: 'artisan-1', recipient_context: 'artisan', conversation_id: 'conversation-1', order_id: null,
  });
});

test('rejects a message sender outside the conversation', async () => {
  const supabase = fakeSupabase({ conversation: { id: 'conversation-1', buyer_id: 'buyer-1', shop_id: 'shop-1' }, shop: { owner_id: 'artisan-1' } });
  await assert.rejects(() => resolveNotificationRecipient(supabase, 'outsider', { type: 'message', conversation_id: 'conversation-1' }), error => error.status === 403);
});

test('verified order owner targets the order buyer', async () => {
  const supabase = fakeSupabase({ order: { id: 'order-1', user_id: 'buyer-1', items: [{ shop_id: 'shop-1' }] }, shops: [{ id: 'shop-1', owner_id: 'artisan-1' }] });
  assert.deepEqual(await resolveNotificationRecipient(supabase, 'artisan-1', { type: 'shipped', order_id: 'order-1' }), {
    user_id: 'buyer-1', recipient_context: 'buyer', conversation_id: null, order_id: 'order-1',
  });
});

test('rejects a mismatched resource recipient', async () => {
  const supabase = fakeSupabase({ order: { id: 'order-1', user_id: 'buyer-1', items: [{ shop_id: 'shop-1' }] }, shops: [{ id: 'shop-1', owner_id: 'artisan-1' }] });
  await assert.rejects(() => resolveNotificationRecipient(supabase, 'artisan-1', { type: 'shipped', order_id: 'order-1', user_id: 'another-user' }), error => error.status === 403);
});
