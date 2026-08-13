import crypto from 'crypto';

const PAID_SESSION_STATUSES = new Set(['paid', 'completed']);
const PAID_INTENT_STATUSES = new Set(['succeeded', 'paid', 'captured']);

function attributes(resource) {
  return resource?.attributes || resource?.data?.attributes || {};
}

function normalizePayment(resource) {
  if (!resource) return null;
  const attrs = resource.attributes || resource;
  return {
    id: resource.id || attrs.id || null,
    status: String(attrs.status || '').toLowerCase(),
    amount: Number(attrs.amount),
    currency: String(attrs.currency || '').toUpperCase(),
    livemode: typeof attrs.livemode === 'boolean' ? attrs.livemode : undefined,
  };
}

export function inspectCheckoutSession(resource, { paidEvent = false } = {}) {
  const session = resource?.data?.id ? resource.data : resource;
  const attrs = attributes(session);
  const intent = attrs.payment_intent?.attributes || attrs.payment_intent || {};
  const payments = [
    ...(Array.isArray(attrs.payments) ? attrs.payments : []),
    ...(Array.isArray(intent.payments) ? intent.payments : []),
  ].map(normalizePayment).filter(Boolean);
  const paidPayment = payments.find(payment => payment.status === 'paid') || null;
  const sessionStatus = String(attrs.status || '').toLowerCase();
  const intentStatus = String(intent.status || '').toLowerCase();
  const paid = paidEvent || Boolean(paidPayment) || PAID_SESSION_STATUSES.has(sessionStatus) || PAID_INTENT_STATUSES.has(intentStatus);
  const lineItems = Array.isArray(attrs.line_items) ? attrs.line_items : [];
  const lineItemAmount = lineItems.reduce((sum, item) => {
    const itemAttrs = item?.attributes || item || {};
    return sum + ((Number(itemAttrs.amount) || 0) * (Number(itemAttrs.quantity) || 0));
  }, 0);
  const amount = Number.isFinite(paidPayment?.amount)
    ? paidPayment.amount
    : Number.isFinite(Number(intent.amount))
      ? Number(intent.amount)
      : lineItemAmount || Number(attrs.amount);
  const currency = paidPayment?.currency || String(intent.currency || lineItems[0]?.currency || lineItems[0]?.attributes?.currency || attrs.currency || '').toUpperCase();
  const livemode = paidPayment?.livemode ?? (typeof attrs.livemode === 'boolean' ? attrs.livemode : undefined);

  return {
    id: session?.id || null,
    attrs,
    metadata: attrs.metadata || {},
    referenceNumber: attrs.reference_number || '',
    sessionStatus,
    intentStatus,
    payments,
    paid,
    amount,
    currency,
    livemode,
    providerPaymentId: paidPayment?.id || intent.id || attrs.payment_intent?.id || null,
  };
}

export function verifyCheckoutSession(resource, order, {
  expectedUserId = order?.user_id,
  secretKey = '',
  requireOrderMetadata = true,
  paidEvent = false,
} = {}) {
  const inspected = inspectCheckoutSession(resource, { paidEvent });
  if (!inspected.id || !order) {
    return { ok: false, paid: false, state: 'invalid', errors: ['Malformed checkout session or missing order'], inspected };
  }
  if (!inspected.paid) {
    return { ok: true, paid: false, state: 'pending', errors: [], inspected };
  }

  const errors = [];
  const metadata = inspected.metadata;
  const expectedAmount = Math.round(Number(order.total) * 100);
  const expectedLiveMode = secretKey.startsWith('sk_live_');
  if (String(order.checkout_session_id || '') !== inspected.id) errors.push('Checkout session does not match the order');
  if (requireOrderMetadata && String(metadata.orderId || '') !== String(order.id)) errors.push('Order metadata does not match');
  if (metadata.orderId && String(metadata.orderId) !== String(order.id)) errors.push('Order metadata does not match');
  if (!metadata.userId || String(metadata.userId) !== String(expectedUserId || order.user_id)) errors.push('User metadata does not match');
  if (String(order.user_id) !== String(expectedUserId || order.user_id)) errors.push('Order owner does not match');
  if (order.payment_reference && inspected.referenceNumber !== order.payment_reference) errors.push('Payment reference does not match');
  if (!Number.isFinite(inspected.amount) || inspected.amount !== expectedAmount) errors.push('Paid amount does not match');
  if (inspected.currency !== 'PHP') errors.push('Payment currency is not PHP');
  if (typeof inspected.livemode !== 'boolean' || inspected.livemode !== expectedLiveMode) errors.push('Payment environment does not match');

  return {
    ok: errors.length === 0,
    paid: errors.length === 0,
    state: errors.length === 0 ? 'paid' : 'invalid',
    errors,
    providerPaymentId: inspected.providerPaymentId,
    inspected,
  };
}

export async function retrieveCheckoutSession(sessionId, secretKey, fetchImpl = fetch) {
  if (!/^cs_[A-Za-z0-9_-]+$/.test(String(sessionId || ''))) {
    const error = new Error('Invalid checkout session ID');
    error.status = 400;
    throw error;
  }
  const response = await fetchImpl(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('Unable to retrieve checkout session from PayMongo');
    error.status = response.status >= 500 ? 503 : 400;
    error.providerErrors = body?.errors;
    throw error;
  }
  return body.data;
}

export function parsePayMongoSignature(header) {
  if (typeof header !== 'string') return {};
  return Object.fromEntries(header.split(',').map(part => part.trim().split('=', 2)).filter(([key, value]) => key && value));
}

export function verifyPayMongoSignature({ rawBody, signatureHeader, webhookSecret, liveMode, now = Date.now() }) {
  if (!webhookSecret || !signatureHeader || !Buffer.isBuffer(rawBody)) return false;
  const parts = parsePayMongoSignature(signatureHeader);
  const timestamp = parts.t || parts.ts;
  const signature = parts[liveMode ? 'li' : 'te'] || parts.v1;
  if (!timestamp || !signature || !/^\d+$/.test(timestamp) || !/^[a-fA-F0-9]+$/.test(signature)) return false;
  const ageSeconds = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (ageSeconds > 300) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(signature, 'hex');
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
