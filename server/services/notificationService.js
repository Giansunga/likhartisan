function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function resolveShopOwner(supabase, shop) {
  if (shop?.owner_id) return shop.owner_id;
  if (!shop?.id) return null;
  const { data } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('shop_id', shop.id)
    .eq('role', 'shop_owner')
    .limit(1)
    .maybeSingle();
  return data?.user_id || null;
}

export async function resolveNotificationRecipient(supabase, authUserId, payload) {
  if (payload.conversation_id) {
    if (payload.type !== 'message') throw httpError(400, 'conversation_id is only valid for message notifications');
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, buyer_id, shop_id')
      .eq('id', payload.conversation_id)
      .single();
    if (conversationError || !conversation) throw httpError(404, 'Conversation not found');
    const { data: shop, error: shopError } = await supabase.from('shops').select('id, owner_id').eq('id', conversation.shop_id).single();
    if (shopError || !shop) throw httpError(404, 'Conversation shop not found');
    const ownerId = await resolveShopOwner(supabase, shop);
    let recipient;
    let recipientContext;
    if (authUserId === conversation.buyer_id) {
      recipient = ownerId;
      recipientContext = 'artisan';
    } else if (ownerId && authUserId === ownerId) {
      recipient = conversation.buyer_id;
      recipientContext = 'buyer';
    } else {
      throw httpError(403, 'You are not a participant in this conversation');
    }
    if (!recipient) throw httpError(422, 'Conversation recipient is unavailable');
    if (payload.user_id && payload.user_id !== recipient) throw httpError(403, 'Notification recipient does not match the conversation');
    return { user_id: recipient, recipient_context: recipientContext, conversation_id: conversation.id, order_id: null };
  }

  if (payload.order_id) {
    const { data: order, error: orderError } = await supabase.from('orders').select('id, user_id, items').eq('id', payload.order_id).single();
    if (orderError || !order) throw httpError(404, 'Order not found');
    const shopIds = [...new Set((order.items || []).map(item => item.shop_id).filter(Boolean))];
    if (!shopIds.length) throw httpError(422, 'Order has no shop ownership information');
    const { data: shops, error: shopsError } = await supabase.from('shops').select('id, owner_id').in('id', shopIds);
    if (shopsError) throw httpError(500, 'Order shop ownership could not be verified');
    let authorized = false;
    for (const shop of shops || []) {
      if (await resolveShopOwner(supabase, shop) === authUserId) { authorized = true; break; }
    }
    if (!authorized) throw httpError(403, 'You cannot create notifications for this order');
    if (payload.user_id && payload.user_id !== order.user_id) throw httpError(403, 'Notification recipient does not match the order');
    return { user_id: order.user_id, recipient_context: 'buyer', conversation_id: null, order_id: order.id };
  }

  const recipient = payload.user_id || authUserId;
  if (recipient !== authUserId) throw httpError(403, 'Resource-free notifications can only target the authenticated user');
  return { user_id: recipient, recipient_context: payload.recipient_context === 'artisan' ? 'artisan' : 'buyer', conversation_id: null, order_id: null };
}
