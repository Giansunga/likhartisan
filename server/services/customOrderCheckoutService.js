import crypto from 'crypto';
import { createCheckoutSession, inspectCheckoutSession, retrieveCheckoutSession } from './paymongoService.js';

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

export async function createCustomOrderCheckout({
  supabase,
  userId,
  orderId,
  secretKey,
  frontendUrl,
  fetchImpl = fetch,
}) {
  const orderResult = await supabase.from('orders').select(
    'id, user_id, status, payment_status, order_type, design_request_id, checkout_session_id, payment_reference, total, items'
  ).eq('id', orderId).eq('user_id', userId).maybeSingle();
  if (orderResult.error) throw orderResult.error;
  const order = orderResult.data;
  if (!order) throw httpError('Order not found', 404);
  if (order.order_type !== 'customized' || !order.design_request_id) {
    throw httpError('Only approved custom-design orders use this checkout', 409);
  }
  if (order.payment_status === 'paid' || order.status === 'paid' || order.status === 'completed') {
    throw httpError('This order is already paid', 409);
  }
  if (['cancelled', 'refunded'].includes(order.status) || order.payment_status === 'refunded') {
    throw httpError('This order can no longer be paid', 409);
  }
  const requestResult = await supabase.from('design_requests')
    .select('id, order_id, buyer_id, status, quoted_price, design_snapshot')
    .eq('id', order.design_request_id).maybeSingle();
  if (requestResult.error) throw requestResult.error;
  const request = requestResult.data;
  if (!request || request.buyer_id !== userId || request.order_id !== order.id || request.status !== 'approved') {
    throw httpError('The custom-design approval does not match this order', 409);
  }
  const total = Number(order.total);
  if (!(total > 0) || Math.round(total * 100) !== Math.round(Number(request.quoted_price) * 100)) {
    throw httpError('The approved quote does not match the order total', 409);
  }

  if (order.checkout_session_id) {
    try {
      const existing = await retrieveCheckoutSession(order.checkout_session_id, secretKey, fetchImpl);
      const inspected = inspectCheckoutSession(existing);
      const checkoutUrl = inspected.attrs?.checkout_url;
      if (inspected.paid) throw httpError('This checkout session is already paid and is being verified', 409);
      if (!inspected.paid && checkoutUrl && !['expired', 'cancelled'].includes(inspected.sessionStatus)) {
        return { orderId: order.id, checkoutSessionId: order.checkout_session_id, checkoutUrl, reused: true };
      }
    } catch (error) {
      if (error?.status === 409) throw error;
      if (Number(error?.status) >= 500) throw error;
      // Missing or expired provider sessions are replaced below.
    }
  }

  const referenceNumber = `LA-CUSTOM-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const modelName = request.design_snapshot?.model?.name || 'Custom pottery design';
  const session = await createCheckoutSession({
    line_items: [{ name: modelName, amount: Math.round(total * 100), currency: 'PHP', quantity: 1 }],
    payment_method_types: ['gcash', 'paymaya', 'qrph', 'card'],
    success_url: `${frontendUrl}/checkout/success?order_id=${encodeURIComponent(order.id)}&ref=${encodeURIComponent(referenceNumber)}`,
    cancel_url: `${frontendUrl}/dashboard?tab=purchases&order=${encodeURIComponent(order.id)}&payment=cancelled`,
    reference_number: referenceNumber,
    description: `LikhArtisan custom design - ${modelName}`,
    metadata: {
      orderId: order.id,
      userId,
      designRequestId: request.id,
      orderType: 'customized',
      serverTotal: total.toString(),
    },
  }, secretKey, fetchImpl);

  const updateResult = await supabase.from('orders').update({
    checkout_session_id: session.id,
    payment_reference: referenceNumber,
  }).eq('id', order.id).eq('user_id', userId).neq('payment_status', 'paid').select('id').maybeSingle();
  if (updateResult.error) throw updateResult.error;
  if (!updateResult.data) throw httpError('The order changed before checkout was created', 409);
  return { orderId: order.id, checkoutSessionId: session.id, checkoutUrl: session.attributes.checkout_url, reused: false };
}
