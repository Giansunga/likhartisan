import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { retrieveCheckoutSession, verifyCheckoutSession } from '../services/paymongoService.js';
import { createOrderNotifications, decrementStockForItems } from '../services/orderFulfillmentService.js';

const apply = process.argv.includes('--apply');
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'PAYMONGO_SECRET_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadCandidates() {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('orders')
      .select('id, user_id, user_name, items, total, status, payment_status, payment_reference, checkout_session_id')
      .not('checkout_session_id', 'is', null).range(from, from + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return rows.filter(order => order.payment_status !== 'paid' || order.status === 'pending');
}

const orders = await loadCandidates();
const sessionCounts = new Map();
for (const order of orders) sessionCounts.set(order.checkout_session_id, (sessionCounts.get(order.checkout_session_id) || 0) + 1);
const summary = { mode: apply ? 'apply' : 'dry-run', candidates: orders.length, verified: 0, repaired: 0, pending: 0, invalid: 0, duplicates: 0, errors: 0 };

for (const order of orders) {
  if (sessionCounts.get(order.checkout_session_id) > 1) {
    summary.duplicates++;
    console.error(JSON.stringify({ orderId: order.id, sessionId: order.checkout_session_id, result: 'duplicate-session' }));
    continue;
  }
  try {
    const session = await retrieveCheckoutSession(order.checkout_session_id, process.env.PAYMONGO_SECRET_KEY);
    const verification = verifyCheckoutSession(session, order, {
      expectedUserId: order.user_id,
      secretKey: process.env.PAYMONGO_SECRET_KEY,
      requireOrderMetadata: Boolean(session.attributes?.metadata?.orderId),
    });
    if (verification.state === 'pending') {
      summary.pending++;
      console.log(JSON.stringify({ orderId: order.id, result: 'pending' }));
      continue;
    }
    if (!verification.ok) {
      summary.invalid++;
      console.error(JSON.stringify({ orderId: order.id, result: 'invalid', errors: verification.errors }));
      continue;
    }
    summary.verified++;
    if (!apply) {
      console.log(JSON.stringify({ orderId: order.id, result: 'would-repair', providerPaymentId: verification.providerPaymentId }));
      continue;
    }
    const wasPending = order.status !== 'paid' && order.payment_status !== 'paid';
    const { data: transitioned, error } = await supabase.from('orders').update({
      status: 'paid', payment_status: 'paid', payment_verified_at: new Date().toISOString(),
      payment_provider_id: verification.providerPaymentId, payment_verification_source: 'historical_reconciliation',
    }).eq('id', order.id).or('payment_status.is.null,payment_status.neq.paid,status.eq.pending').select('id').maybeSingle();
    if (error) throw error;
    if (transitioned && wasPending) {
      await decrementStockForItems(supabase, order.items || []);
      await createOrderNotifications(supabase, order.id, order.items || [], order.user_name || '');
    }
    summary.repaired += transitioned ? 1 : 0;
    console.log(JSON.stringify({ orderId: order.id, result: transitioned ? 'repaired' : 'already-repaired' }));
  } catch (error) {
    summary.errors++;
    console.error(JSON.stringify({ orderId: order.id, result: 'error', error: error.message }));
  }
}

console.log(JSON.stringify(summary));
if (summary.duplicates || summary.errors) process.exitCode = 1;
