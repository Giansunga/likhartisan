import { resolveNotificationRecipient } from './notificationService.js';

const NEXT_STATUS = { pending: 'preparing', preparing: 'shipped', shipped: 'delivered', delivered: 'completed' };
const NOTIFICATIONS = {
  preparing: ['Order is Being Prepared', 'is being prepared by the seller.'],
  shipped: ['Shipped Out', 'has been shipped out by the seller.'],
  delivered: ['Received Order?', 'has been delivered. Please confirm receipt.'],
  completed: ['Your Order is Completed', 'has been completed. Thank you!'],
  cancelled: ['Order Cancelled', 'has been cancelled by the seller.'],
};

function orderError(status, code) {
  return Object.assign(new Error(code), { status });
}

export async function updateSellerOrderStatus(supabase, orderId, sellerId, nextStatus) {
  if (!Object.hasOwn(NOTIFICATIONS, nextStatus)) throw orderError(400, 'INVALID_DELIVERY_STATUS');
  const { data: order, error: readError } = await supabase.from('orders')
    .select('id, user_id, items, status, payment_status, delivery_status, order_type')
    .eq('id', orderId).maybeSingle();
  if (readError) throw readError;
  if (!order) throw orderError(404, 'ORDER_NOT_FOUND');
  if (order.order_type === 'customized' && nextStatus !== 'cancelled') throw orderError(409, 'CUSTOM_ORDER_WORKFLOW');

  // This verifies the signed-in seller against the order's recorded shop.
  const recipient = await resolveNotificationRecipient(supabase, sellerId, { order_id: orderId });
  const shopIds = [...new Set((order.items || []).map(item => item.shop_id).filter(Boolean))];
  if (shopIds.length > 1) {
    const { data: shops, error: shopsError } = await supabase.from('shops').select('id, owner_id').in('id', shopIds);
    if (shopsError) throw shopsError;
    if (shops?.length !== shopIds.length || shops.some(shop => shop.owner_id !== sellerId)) {
      throw orderError(403, 'ORDER_SHOP_ACCESS_DENIED');
    }
  }
  const currentStatus = order.delivery_status || 'pending';
  if (nextStatus === 'cancelled') {
    const paymentStatus = order.payment_status || 'pending';
    if (currentStatus === 'cancelled' || currentStatus === 'completed' ||
      (order.status !== 'cancelled' && ['pending', 'paid', 'completed'].includes(paymentStatus))) {
      throw orderError(409, 'ORDER_CHANGED');
    }
  } else if (NEXT_STATUS[currentStatus] !== nextStatus || order.status === 'cancelled') {
    throw orderError(409, 'ORDER_CHANGED');
  }

  const changes = { delivery_status: nextStatus };
  if (nextStatus === 'cancelled' || nextStatus === 'completed') changes.status = nextStatus;
  let query = supabase.from('orders').update(changes).eq('id', orderId);
  query = order.delivery_status == null ? query.is('delivery_status', null) : query.eq('delivery_status', order.delivery_status);
  const { data: saved, error: updateError } = await query.select('id, status, delivery_status').maybeSingle();
  if (updateError) throw updateError;
  if (!saved) throw orderError(409, 'ORDER_CHANGED');

  const [title, sentence] = NOTIFICATIONS[nextStatus];
  const firstItem = Array.isArray(order.items) ? order.items[0] : null;
  let notificationError;
  try {
    ({ error: notificationError } = await supabase.from('notifications').insert({
      ...recipient,
      type: nextStatus,
      title,
      message: `Your order #${orderId.slice(-6)} ${sentence}`,
      product_image: firstItem?.image || '',
    }));
  } catch (error) {
    notificationError = error;
  }
  if (notificationError) console.error('Seller order notification insert error:', notificationError);
  return { order: saved, notificationSent: !notificationError };
}
