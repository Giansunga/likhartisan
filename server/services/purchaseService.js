import crypto from 'crypto';

export const PURCHASE_PAGE_SIZE = 10;
export const PURCHASE_STATUSES = new Set(['all', 'to-pay', 'to-ship', 'to-receive', 'completed', 'return-refund', 'cancelled']);
export const RETURN_REASONS = new Set(['damaged', 'defective', 'wrong_item', 'missing_item', 'not_as_described', 'other']);
export const RETURN_RESOLUTIONS = new Set(['refund', 'replacement']);
export const EVIDENCE_REQUIRED_REASONS = new Set(['damaged', 'defective', 'wrong_item']);
export const RETURN_REVIEW_STATUSES = new Set(['under_review', 'approved', 'rejected', 'refunded', 'closed']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function buyerOrderStatus(order) {
  if (order.status === 'cancelled') return 'cancelled';
  if (order.status === 'refunded' || order.payment_status === 'refunded') return 'return-refund';
  if (order.status === 'completed' || order.delivery_status === 'completed') return 'completed';
  if (order.payment_status === 'paid') return order.delivery_status === 'delivered' ? 'to-receive' : 'to-ship';
  if (order.status === 'pending' || (order.payment_status ?? 'pending') !== 'paid') return 'to-pay';
  if (order.delivery_status === 'delivered') return 'to-receive';
  return 'to-ship';
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanQuery(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
}

export function normalizePurchaseQuery(query) {
  const status = PURCHASE_STATUSES.has(query.status) ? query.status : 'all';
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  return {
    status,
    query: cleanQuery(query.q),
    dateFrom: safeDate(query.dateFrom),
    dateTo: safeDate(query.dateTo),
    sort: query.sort === 'oldest' ? 'oldest' : 'newest',
    page,
  };
}

function shopsFor(items = []) {
  const shops = new Map();
  for (const item of items) {
    const id = item.shop_id || item.shopId;
    const name = item.shop_name || item.shopName || 'LikhArtisan Shop';
    if (id || name) shops.set(id || name, { id: id || '', name });
  }
  return [...shops.values()];
}

async function notifyOrderParticipants(supabase, orderId, buyerId, title, message) {
  const { data: order } = await supabase.from('orders').select('items').eq('id', orderId).maybeSingle();
  const shopIds = [...new Set((order?.items ?? []).map(item => item.shop_id || item.shopId).filter(Boolean))];
  if (!shopIds.length) return;
  const { data: shops } = await supabase.from('shops').select('owner_id').in('id', shopIds);
  const rows = (shops ?? []).filter(shop => shop.owner_id && shop.owner_id !== buyerId).map(shop => ({ user_id: shop.owner_id, type: 'return', title, message, order_id: orderId }));
  if (rows.length) await supabase.from('notifications').insert(rows);
}

export function mapPurchase(order, activeReturn = null) {
  const items = Array.isArray(order.items) ? order.items : [];
  return {
    id: order.id,
    shortId: String(order.id).replaceAll('-', '').slice(0, 8).toUpperCase(),
    items: items.map((item, index) => ({
      index,
      productId: item.product_id || item.productId || '',
      variationId: item.variation_id || item.variationId || '',
      productName: item.product_name || item.productName || 'Product',
      image: item.image || '',
      quantity: Number(item.qty) || 1,
      price: Number(item.price) || 0,
      dimensions: item.dimensions || '',
      variation: item.variation || '',
      shopId: item.shop_id || item.shopId || '',
      shopName: item.shop_name || item.shopName || 'LikhArtisan Shop',
    })),
    shops: shopsFor(items),
    subtotal: Number(order.subtotal) || 0,
    shippingFee: Number(order.shipping_fee) || 0,
    total: Number(order.total) || 0,
    status: buyerOrderStatus(order),
    paymentStatus: order.payment_status || order.status || 'pending',
    deliveryStatus: order.delivery_status || 'pending',
    deliveryOption: order.delivery_option || 'pickup',
    deliveryProvider: order.delivery_provider || '',
    trackingNumber: order.tracking_number || '',
    estimatedDelivery: order.estimated_delivery || '',
    deliveryNotes: order.delivery_notes || '',
    checkoutSessionId: order.checkout_session_id || '',
    createdAt: order.created_at,
    activeReturn,
  };
}

export async function listBuyerPurchases(supabase, userId, rawQuery) {
  const input = normalizePurchaseQuery(rawQuery);
  const { data, error } = await supabase.rpc('get_buyer_orders_page', {
    p_user_id: userId,
    p_status: input.status,
    p_query: input.query,
    p_date_from: input.dateFrom,
    p_date_to: input.dateTo,
    p_sort: input.sort,
    p_page: input.page,
    p_page_size: PURCHASE_PAGE_SIZE,
  });
  if (error) throw error;
  const rows = Array.isArray(data?.orders) ? data.orders : [];
  const ids = rows.map(row => row.id);
  let returns = [];
  if (ids.length) {
    const result = await supabase.from('order_return_requests')
      .select('id, order_id, status, reason, requested_resolution, submitted_at, created_at')
      .in('order_id', ids).neq('status', 'draft').order('created_at', { ascending: false });
    returns = result.data ?? [];
  }
  const returnByOrder = new Map();
  for (const request of returns) if (!returnByOrder.has(request.order_id)) returnByOrder.set(request.order_id, request);
  const total = Number(data?.total) || 0;
  return {
    orders: rows.map(row => mapPurchase(row, returnByOrder.get(row.id) ?? null)),
    statusCounts: data?.statusCounts ?? {},
    pagination: { page: input.page, pageSize: PURCHASE_PAGE_SIZE, total, totalPages: Math.ceil(total / PURCHASE_PAGE_SIZE) },
  };
}

async function ownedOrder(supabase, orderId, userId) {
  if (!UUID.test(orderId)) return null;
  const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

function activityLabel(log) {
  const delivery = log.new_delivery_status;
  const payment = log.new_payment_status;
  if (log.action_type === 'order_placed') return 'Order placed';
  if (log.action_type === 'legacy_completion') return 'Order completed';
  if (log.action_type === 'order_cancelled') return 'Order cancelled';
  if (payment === 'paid' || log.new_status === 'paid') return 'Payment verified';
  if (payment === 'refunded' || log.new_status === 'refunded') return 'Refund completed';
  if (delivery === 'preparing') return 'Seller is preparing your order';
  if (delivery === 'shipped') return 'Product handed to courier';
  if (delivery === 'delivered') return 'Delivered';
  if (delivery === 'completed' || log.new_status === 'completed') return 'Order completed';
  return String(log.action_type || 'Order updated').replaceAll('_', ' ');
}

export function returnEligibility(order, activity = [], now = new Date()) {
  if (!order || !['delivered', 'completed'].includes(order.delivery_status) && order.status !== 'completed') {
    return { eligible: false, reason: 'Returns are available after delivery.', deadline: null };
  }
  const completion = activity.find(log => log.new_status === 'completed' || log.new_delivery_status === 'completed' || log.action_type === 'legacy_completion');
  if (!completion && order.delivery_status === 'delivered') return { eligible: true, reason: '', deadline: null };
  const completedAt = new Date(completion?.created_at || now);
  const deadline = new Date(completedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  return deadline >= now
    ? { eligible: true, reason: '', deadline: deadline.toISOString() }
    : { eligible: false, reason: 'The seven-day return window has closed.', deadline: deadline.toISOString() };
}

export async function getBuyerPurchase(supabase, orderId, userId) {
  const order = await ownedOrder(supabase, orderId, userId);
  if (!order) return null;
  const [activityResult, returnResult] = await Promise.all([
    supabase.from('order_activity_log').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
    supabase.from('order_return_requests').select('*, order_return_items(*), order_return_evidence(*)')
      .eq('order_id', orderId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (activityResult.error) throw activityResult.error;
  const rawActivity = activityResult.data ?? [];
  const activity = rawActivity.map(log => ({ id: log.id, label: activityLabel(log), actionType: log.action_type, createdAt: log.created_at }));
  let returnRequest = returnResult.data ?? null;
  if (returnRequest?.order_return_evidence?.length) {
    const signed = await Promise.all(returnRequest.order_return_evidence.map(async evidence => {
      const { data } = await supabase.storage.from('return-evidence').createSignedUrl(evidence.object_path, 600);
      return { ...evidence, signedUrl: data?.signedUrl ?? '' };
    }));
    returnRequest = { ...returnRequest, order_return_evidence: signed };
  }
  return { ...mapPurchase(order, returnRequest?.status !== 'draft' ? returnRequest : null), activity, returnEligibility: returnEligibility(order, rawActivity), returnRequest };
}

export async function cancelBuyerOrder(supabase, orderId, userId) {
  const order = await ownedOrder(supabase, orderId, userId);
  if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
  if (buyerOrderStatus(order) !== 'to-pay') throw Object.assign(new Error('ORDER_NOT_CANCELLABLE'), { status: 409 });
  const { data, error } = await supabase.from('orders').update({ status: 'cancelled', cancel_reason: 'Cancelled by buyer', cancelled_by: userId })
    .eq('id', orderId).eq('user_id', userId).eq('status', 'pending').select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('ORDER_CHANGED'), { status: 409 });
  return { success: true };
}

export async function receiveBuyerOrder(supabase, orderId, userId) {
  const order = await ownedOrder(supabase, orderId, userId);
  if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
  if (order.delivery_status !== 'delivered') throw Object.assign(new Error('ORDER_NOT_DELIVERED'), { status: 409 });
  const { data, error } = await supabase.from('orders').update({ status: 'completed', delivery_status: 'completed' })
    .eq('id', orderId).eq('user_id', userId).eq('delivery_status', 'delivered').select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('ORDER_CHANGED'), { status: 409 });
  return { success: true };
}

export async function reorderPlan(supabase, orderId, userId) {
  const order = await ownedOrder(supabase, orderId, userId);
  if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
  const items = Array.isArray(order.items) ? order.items : [];
  const available = [];
  const unavailable = [];
  for (const item of items) {
    const productId = item.product_id || item.productId;
    const variationId = item.variation_id || item.variationId;
    const { data: product } = await supabase.from('products').select('id, name, image, price, stock, status, shop_id, shop_name').eq('id', productId).maybeSingle();
    if (!product || product.status !== 'active') { unavailable.push({ productId, productName: item.product_name || item.productName, reason: 'Product is unavailable' }); continue; }
    let price = Number(product.price) || 0;
    let stock = Number(product.stock) || 0;
    let variation;
    if (variationId) {
      const { data } = await supabase.from('product_variations').select('id, price, stock, dimensions').eq('id', variationId).eq('product_id', productId).maybeSingle();
      if (!data) { unavailable.push({ productId, productName: product.name, reason: 'Variation is unavailable' }); continue; }
      price = Number(data.price) || price; stock = Number(data.stock) || 0; variation = data.dimensions || item.variation || '';
    }
    if (stock < 1) { unavailable.push({ productId, productName: product.name, reason: 'Out of stock' }); continue; }
    available.push({ productId, variationId: variationId || undefined, productName: product.name, image: product.image || '', price, qty: Math.min(Number(item.qty) || 1, stock), shopId: product.shop_id, shopName: product.shop_name, variation });
  }
  return { available, unavailable };
}

function validateReturnBody(body, itemCount) {
  if (!RETURN_REASONS.has(body.reason) || !RETURN_RESOLUTIONS.has(body.requestedResolution)) throw Object.assign(new Error('INVALID_RETURN'), { status: 400 });
  const description = String(body.description ?? '').trim();
  if (description.length < 10 || description.length > 2000) throw Object.assign(new Error('INVALID_DESCRIPTION'), { status: 400 });
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.some(item => !Number.isInteger(item.itemIndex) || item.itemIndex < 0 || item.itemIndex >= itemCount || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    throw Object.assign(new Error('INVALID_RETURN_ITEMS'), { status: 400 });
  }
  return { description, items };
}

export async function createReturnDraft(supabase, orderId, userId, body) {
  const detail = await getBuyerPurchase(supabase, orderId, userId);
  if (!detail) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
  if (!detail.returnEligibility.eligible) throw Object.assign(new Error('RETURN_NOT_ELIGIBLE'), { status: 409 });
  if (detail.returnRequest && detail.returnRequest.status !== 'draft') throw Object.assign(new Error('RETURN_EXISTS'), { status: 409 });
  const { description, items } = validateReturnBody(body, detail.items.length);
  if (detail.returnRequest?.status === 'draft') {
    await supabase.from('order_return_evidence').delete().eq('request_id', detail.returnRequest.id);
    await supabase.from('order_return_items').delete().eq('request_id', detail.returnRequest.id);
    await supabase.from('order_return_requests').delete().eq('id', detail.returnRequest.id);
  }
  const { data: request, error } = await supabase.from('order_return_requests').insert({ order_id: orderId, user_id: userId, reason: body.reason, requested_resolution: body.requestedResolution, description, status: 'draft' }).select('*').single();
  if (error) throw error;
  const rows = items.map(item => ({ request_id: request.id, item_index: item.itemIndex, product_id: detail.items[item.itemIndex].productId || null, quantity: Math.min(item.quantity, detail.items[item.itemIndex].quantity) }));
  const result = await supabase.from('order_return_items').insert(rows);
  if (result.error) throw result.error;
  return { request, evidenceRequired: EVIDENCE_REQUIRED_REASONS.has(body.reason) };
}

export async function presignReturnEvidence(supabase, requestId, userId, body) {
  const contentType = String(body.contentType ?? '');
  const size = Number(body.size);
  if (!UUID.test(requestId) || !ALLOWED_TYPES.has(contentType) || !Number.isInteger(size) || size < 1 || size > 5 * 1024 * 1024) throw Object.assign(new Error('INVALID_EVIDENCE'), { status: 400 });
  const { data: request } = await supabase.from('order_return_requests').select('id').eq('id', requestId).eq('user_id', userId).eq('status', 'draft').maybeSingle();
  if (!request) throw Object.assign(new Error('RETURN_NOT_FOUND'), { status: 404 });
  const { count } = await supabase.from('order_return_evidence').select('id', { count: 'exact', head: true }).eq('request_id', requestId);
  if ((count ?? 0) >= 3) throw Object.assign(new Error('EVIDENCE_LIMIT'), { status: 409 });
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${requestId}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from('return-evidence').createSignedUploadUrl(path);
  if (error) throw error;
  const inserted = await supabase.from('order_return_evidence').insert({ request_id: requestId, object_path: path, content_type: contentType, size_bytes: size });
  if (inserted.error) throw inserted.error;
  return { path, token: data.token };
}

export async function completeReturnEvidence(supabase, requestId, userId, body) {
  const path = String(body.path ?? '');
  const { data: request } = await supabase.from('order_return_requests').select('id').eq('id', requestId).eq('user_id', userId).eq('status', 'draft').maybeSingle();
  if (!request || !path.startsWith(`${userId}/${requestId}/`)) throw Object.assign(new Error('RETURN_NOT_FOUND'), { status: 404 });
  const { data, error } = await supabase.from('order_return_evidence').update({ uploaded_at: new Date().toISOString() }).eq('request_id', requestId).eq('object_path', path).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('EVIDENCE_NOT_FOUND'), { status: 404 });
  return { uploaded: true };
}

export async function submitReturnRequest(supabase, requestId, userId) {
  const { data: request } = await supabase.from('order_return_requests').select('*').eq('id', requestId).eq('user_id', userId).eq('status', 'draft').maybeSingle();
  if (!request) throw Object.assign(new Error('RETURN_NOT_FOUND'), { status: 404 });
  if (EVIDENCE_REQUIRED_REASONS.has(request.reason)) {
    const { count } = await supabase.from('order_return_evidence').select('id', { count: 'exact', head: true }).eq('request_id', requestId).not('uploaded_at', 'is', null);
    if (!count) throw Object.assign(new Error('EVIDENCE_REQUIRED'), { status: 400 });
  }
  const submittedAt = new Date().toISOString();
  const { data, error } = await supabase.from('order_return_requests').update({ status: 'submitted', submitted_at: submittedAt, updated_at: submittedAt }).eq('id', requestId).eq('status', 'draft').select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('RETURN_CHANGED'), { status: 409 });
  await notifyOrderParticipants(supabase, data.order_id, userId, 'New return request', 'A buyer submitted a return request for an order from your shop.');
  return data;
}

export async function reviewReturnRequest(supabase, requestId, adminId, body) {
  if (!RETURN_REVIEW_STATUSES.has(body.status)) throw Object.assign(new Error('INVALID_RETURN_STATUS'), { status: 400 });
  const note = String(body.resolutionNote ?? '').trim().slice(0, 2000) || null;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('order_return_requests').update({ status: body.status, resolution_note: note, reviewed_by: adminId, reviewed_at: now, updated_at: now }).eq('id', requestId).neq('status', 'draft').select('*, orders!inner(user_id, id)').maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('RETURN_NOT_FOUND'), { status: 404 });
  if (body.status === 'refunded') await supabase.from('orders').update({ status: 'refunded', payment_status: 'refunded', refund_status: 'refunded' }).eq('id', data.order_id);
  await supabase.from('notifications').insert({ user_id: data.orders.user_id, type: 'order', title: 'Return request updated', message: `Your return request is now ${body.status.replaceAll('_', ' ')}.`, order_id: data.order_id });
  await notifyOrderParticipants(supabase, data.order_id, data.orders.user_id, 'Return request updated', `A return request is now ${body.status.replaceAll('_', ' ')}.`);
  return data;
}

export async function getAdminReturnForOrder(supabase, orderId) {
  if (!UUID.test(orderId)) return null;
  const { data, error } = await supabase.from('order_return_requests').select('*, order_return_items(*), order_return_evidence(*)').eq('order_id', orderId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const evidence = await Promise.all((data.order_return_evidence ?? []).map(async item => {
    if (!item.uploaded_at) return { ...item, signedUrl: '' };
    const { data: signed } = await supabase.storage.from('return-evidence').createSignedUrl(item.object_path, 600);
    return { ...item, signedUrl: signed?.signedUrl ?? '' };
  }));
  return { ...data, order_return_evidence: evidence };
}
