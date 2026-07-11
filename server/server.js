import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import chatbotRoutes from './routes/chatbot.js';
import { initChatbotController } from './controllers/chatbotController.js';
import lalamoveRoutes from './routes/lalamove.js';
import geocodeRoutes from './routes/geocode.js';
import { sendOrderConfirmation } from './lib/email.js';

// ── Env var validation ──────────────────────────────────────────────────────
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'PAYMONGO_SECRET_KEY'];
for (const v of requiredEnvVars) {
  if (!process.env[v]) {
    console.error(`[FATAL] Missing required env var: ${v}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Warn if the frontend URL points at localhost in a deployed environment.
// PayMongo redirects users to FRONTEND_URL after payment, so a localhost value
// breaks the return trip to /checkout/success.
if (FRONTEND_URL.includes('localhost') || FRONTEND_URL.includes('127.0.0.1')) {
  console.warn(
    '[WARN] FRONTEND_URL is set to a localhost URL. In production this will cause ' +
    'PayMongo to redirect users to localhost (unreachable). Set FRONTEND_URL to your ' +
    'public frontend URL (e.g. https://likhartisan.vercel.app).'
  );
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many chatbot requests, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymongoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many payment requests, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});

const proxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests to external service, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(apiLimiter);
app.use(express.json({
  limit: '50kb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Health check endpoint (for auto-ping)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize chatbot controller with Supabase
initChatbotController(supabase);

// Chatbot routes
app.use('/api/chatbot', chatbotLimiter, chatbotRoutes);

// Lalamove routes
app.use('/api/lalamove', proxyLimiter, lalamoveRoutes);

// Geocode routes
app.use('/api/geocode', proxyLimiter, geocodeRoutes);

// Create PayMongo Checkout Session
app.post('/api/create-checkout', paymongoLimiter, async (req, res) => {
  try {
    const { items, shippingFee, userName, userPhone, userAddress, deliveryOption, userId, lalamoveQuoteId } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!userName || typeof userName !== 'string' || userName.trim().length < 2) {
      return res.status(400).json({ error: 'Valid userName is required' });
    }
    if (!userPhone || typeof userPhone !== 'string' || userPhone.trim().length < 7) {
      return res.status(400).json({ error: 'Valid userPhone is required' });
    }
    if (deliveryOption === 'courier' && (!userAddress || typeof userAddress !== 'string' || userAddress.trim().length < 5)) {
      return res.status(400).json({ error: 'Valid userAddress is required for delivery' });
    }
    if (!['pickup', 'courier'].includes(deliveryOption)) {
      return res.status(400).json({ error: 'deliveryOption must be pickup or courier' });
    }

    // Server-side price verification: fetch real prices from Supabase
    const validatedItems = items.map(item => {
      const qty = Number(item.qty) || 0;
      if (!item.productId || qty <= 0) {
        return { valid: false, error: 'Invalid cart item' };
      }
      return { valid: true, item, qty };
    });

    const firstInvalid = validatedItems.find(v => !v.valid);
    if (firstInvalid) {
      return res.status(400).json({ error: firstInvalid.error });
    }

    // Fetch all products in parallel
    const productIds = [...new Set(validatedItems.map(v => v.item.productId))];
    const productResults = await Promise.all(
      productIds.map(id =>
        supabase.from('products').select('id, name, price, image, shop_id, shop_name, stock').eq('id', id).single()
      )
    );

    const productMap = new Map();
    for (const { data: product, error: productError } of productResults) {
      if (productError || !product) {
        return res.status(400).json({ error: `Product not found: ${productError?.message || 'unknown'}` });
      }
      productMap.set(product.id, product);
    }

    // Fetch all variations in parallel (for items that have variationId)
    const variationItems = validatedItems.filter(v => v.item.variationId);
    const variationResults = await Promise.all(
      variationItems.map(v =>
        supabase.from('product_variations')
          .select('id, product_id, price, stock, dimensions, height, opening_diameter')
          .eq('id', v.item.variationId)
          .single()
      )
    );

    const variationMap = new Map();
    for (let i = 0; i < variationItems.length; i++) {
      const { data: variation, error: variationError } = variationResults[i];
      const itemId = variationItems[i].item.variationId;
      if (variationError || !variation) {
        return res.status(400).json({ error: `Variation not found: ${itemId}` });
      }
      variationMap.set(itemId, variation);
    }

    // Stock validation
    for (const { item, qty } of validatedItems) {
      if (item.variationId) {
        const variation = variationMap.get(item.variationId);
        const available = Number(variation?.stock) || 0;
        if (available < qty) {
          return res.status(400).json({ error: `Insufficient stock for ${item.productId}. Available: ${available}, requested: ${qty}` });
        }
      } else {
        const product = productMap.get(item.productId);
        const available = Number(product?.stock) || 0;
        if (available < qty) {
          return res.status(400).json({ error: `Insufficient stock for ${product?.name || item.productId}. Available: ${available}, requested: ${qty}` });
        }
      }
    }

    // Build verified items
    let verifiedSubtotal = 0;
    const verifiedItems = [];
    for (const { item, qty } of validatedItems) {
      const product = productMap.get(item.productId);

      let unitPrice = Number(product.price) || 0;
      let variationLabel = item.variation || '';

      if (item.variationId) {
        const variation = variationMap.get(item.variationId);
        if (!variation || variation.product_id !== item.productId) {
          return res.status(400).json({ error: `Invalid variation for ${product.name}` });
        }
        if (variation.price !== null && variation.price !== undefined) {
          unitPrice = Number(variation.price) || unitPrice;
        }
        variationLabel = [
          variation.dimensions,
          variation.height ? `H: ${variation.height}` : '',
          variation.opening_diameter ? `Opening: ${variation.opening_diameter}` : '',
        ].filter(Boolean).join(' | ');
      }

      verifiedSubtotal += unitPrice * qty;
      verifiedItems.push({
        productId: item.productId,
        productName: product.name,
        image: product.image || item.image || '',
        shopId: product.shop_id || null,
        shopName: product.shop_name || item.shopName || '',
        variationId: item.variationId || null,
        variation: variationLabel,
        price: unitPrice,
        qty,
      });
    }

    // Use server-calculated total, not frontend total
    const verifiedShippingFee = Math.max(0, Number(shippingFee) || 0);
    const serverTotal = verifiedSubtotal + verifiedShippingFee;

    const lineItems = verifiedItems.map(item => ({
      name: item.productName,
      amount: Math.round(item.price * 100), // PayMongo uses centavos
      currency: 'PHP',
      quantity: item.qty,
    }));

    // Add shipping fee as a line item if applicable
    if (shippingFee && shippingFee > 0) {
      lineItems.push({
        name: 'Shipping Fee',
        amount: Math.round(shippingFee * 100),
        currency: 'PHP',
        quantity: 1,
      });
    }

    const referenceNumber = `LA-${Date.now()}`;

    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: lineItems,
            payment_method_types: ['gcash', 'paymaya', 'qrph', 'card'],
            success_url: `${FRONTEND_URL}/checkout/success?session_id={checkout_session.id}&ref=${referenceNumber}`,
            cancel_url: `${FRONTEND_URL}/checkout?cancelled=true`,
            reference_number: referenceNumber,
            description: `LikhArtisan Order - ${verifiedItems.length} item(s)`,
            metadata: {
              userId: userId || '',
              userName: userName || '',
              userPhone: userPhone || '',
              userAddress: userAddress || '',
              deliveryOption: deliveryOption || '',
              lalamoveQuoteId: (lalamoveQuoteId || '').toString(),
              items: JSON.stringify(verifiedItems),
              verifiedSubtotal: verifiedSubtotal.toString(),
              verifiedShippingFee: verifiedShippingFee.toString(),
              serverTotal: serverTotal.toString(),
            },
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('PayMongo error:', data);
      return res.status(response.status).json({ error: data.errors || 'Payment session creation failed' });
    }

    const checkoutUrl = data.data.attributes.checkout_url;
    const sessionId = data.data.id;

    // Order NOT inserted here — it will be created in /api/confirm-payment
    // after PayMongo verifies the payment succeeded, to avoid ghost orders.

    res.json({ checkoutUrl, sessionId, referenceNumber, total: serverTotal });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retrieve Checkout Session status
app.get('/api/session/:sessionId', paymongoLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.errors || 'Failed to retrieve session' });
    }

    res.json(data.data.attributes);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Confirm payment and update order status (called by success page only)
app.post('/api/confirm-payment', paymongoLimiter, async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`[confirm-payment] sessionId=${sessionId}, userId=${userId}`);

    // Step 1: Verify payment with PayMongo — MUST be paid before updating DB
    let paymongoVerified = false;
    let pmData = null;
    try {
      const pmResponse = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`,
        },
      });
      pmData = await pmResponse.json();
      if (pmResponse.ok) {
        const attrs = pmData.data?.attributes || {};
        const pmStatus = attrs.status;                                   // session status: active/expired
        const piStatus = attrs.payment_intent?.attributes?.status;       // card payments only
        // Paid payment records can live in two places depending on method:
        //   attrs.payments[]                          (some flows)
        //   attrs.payment_intent.attributes.payments[] (gcash/maya/qrph)
        const paymentRecords = [
          ...(Array.isArray(attrs.payments) ? attrs.payments : []),
          ...(Array.isArray(attrs.payment_intent?.attributes?.payments) ? attrs.payment_intent.attributes.payments : []),
        ];
        const paymentStatuses = paymentRecords.map(p => p?.attributes?.status).filter(Boolean);
        console.log(`[confirm-payment] PayMongo session=${pmStatus}, intent=${piStatus}, payments=[${paymentStatuses.join(',')}]`);
        const PAID_SESSION = ['paid', 'completed'];
        const PAID_INTENT = ['succeeded', 'paid', 'captured'];
        if (
          PAID_SESSION.includes(pmStatus) ||
          PAID_INTENT.includes(piStatus) ||
          paymentStatuses.includes('paid')
        ) {
          paymongoVerified = true;
        } else {
          // Not verified — dump the raw shape so logs reveal where the paid status actually is
          console.warn('[confirm-payment] NOT verified. Raw attributes:', JSON.stringify(attrs));
        }
      } else {
        console.warn(`[confirm-payment] PayMongo fetch not ok: ${pmResponse.status}`, pmData?.errors);
      }
    } catch (e) {
      console.warn('[confirm-payment] PayMongo check failed:', e.message);
    }

    // Step 2: Look up any existing order for this session first.
    // The webhook (checkout_session.payment.paid) may have already marked it paid.
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('id, status')
      .eq('checkout_session_id', sessionId)
      .limit(1);

    if (existingOrders && existingOrders.length > 0 && existingOrders[0].status === 'paid') {
      console.log(`[confirm-payment] Order ${existingOrders[0].id} already paid (webhook) — skipping`);
      return res.json({ success: true, verified: true });
    }

    // ✅ Only proceed if PayMongo confirms payment is actually paid
    if (!paymongoVerified) {
      console.warn(`[confirm-payment] Payment NOT verified for session ${sessionId}. Aborting.`);
      return res.status(402).json({ success: false, error: 'Payment not verified by PayMongo', verified: false });
    }

    // Step 3: Update existing pending order or create one from session metadata
    if (existingOrders && existingOrders.length > 0) {
      const order = existingOrders[0];
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', order.id);

      if (updateError) {
        console.error('[confirm-payment] Order update failed:', updateError.message);
        return res.status(500).json({ success: false, error: 'Failed to update order status' });
      }

      console.log(`[confirm-payment] Updated order ${order.id} from pending to paid`);

      // Decrement stock for each item (non-blocking)
      (async () => {
        try {
          const { data: fullOrder } = await supabase.from('orders').select('items').eq('id', order.id).single();
          if (!fullOrder?.items) return;
          await decrementStockForItems(fullOrder.items);
        } catch (e) { console.error('[stock] Decrement failed:', e.message); }
      })();

      // Send order confirmation email (non-blocking)
      supabase.from('orders').select('id, user_name, items, subtotal, shipping_fee, total, delivery_option').eq('id', order.id).single()
        .then(({ data: fullOrder }) => sendConfirmationEmail(userId, fullOrder))
        .catch(e => console.error('[email] Failed:', e.message));

      return res.json({ success: true, verified: true });
    }

    // Fallback: Order not created by frontend — create from PayMongo metadata
    console.warn(`[confirm-payment] No existing order for session ${sessionId} — creating from metadata`);
    const meta = pmData.data?.attributes?.metadata || {};
    const referenceNumber = pmData.data?.attributes?.reference_number || `LA-${Date.now()}`;

    let orderItems = [];
    try {
      orderItems = JSON.parse(meta.items || '[]');
    } catch {
      return res.status(500).json({ success: false, error: 'Invalid order data in payment metadata' });
    }

    const mappedItems = orderItems.map(item => ({
      product_id: item.productId,
      product_name: item.productName,
      qty: item.qty,
      price: item.price,
      image: item.image || '',
      shop_id: item.shopId || null,
      shop_name: item.shopName || '',
      variation_id: item.variationId || null,
      variation: item.variation || '',
    }));

    const subtotal = parseFloat(meta.verifiedSubtotal) || 0;
    const shippingFee = parseFloat(meta.verifiedShippingFee) || 0;
    const total = subtotal + shippingFee;

    const { data: newOrder, error: insertError } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        user_name: meta.userName || '',
        user_phone: meta.userPhone || '',
        user_address: meta.userAddress || '',
        items: mappedItems,
        subtotal,
        shipping_fee: shippingFee,
        total,
        delivery_option: meta.deliveryOption || 'pickup',
        delivery_status: 'pending',
        status: 'paid',
        payment_reference: referenceNumber,
        checkout_session_id: sessionId,
        lalamove_quote_id: meta.lalamoveQuoteId || null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[confirm-payment] Fallback order insert failed:', insertError.message);
      return res.status(500).json({ success: false, error: 'Failed to create order after payment' });
    }

    console.log(`[confirm-payment] Created fallback order ${newOrder.id} for session ${sessionId}`);

    // Decrement stock for each item (non-blocking)
    (async () => {
      try {
        await decrementStockForItems(mappedItems);
      } catch (e) { console.error('[stock] Decrement failed:', e.message); }
    })();

    // Send order confirmation email (non-blocking)
    sendConfirmationEmail(userId, {
      id: newOrder.id,
      user_name: meta.userName || 'Customer',
      items: mappedItems,
      subtotal,
      shipping_fee: shippingFee,
      total,
      delivery_option: meta.deliveryOption || 'pickup',
      shopName: orderItems[0]?.shopName || '',
    });

    return res.json({ success: true, verified: true });

  } catch (error) {
    console.error('[confirm-payment] Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// PayMongo Webhook Signature Verification
function verifyPayMongoSignature(req) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('PAYMONGO_WEBHOOK_SECRET not set — rejecting webhook');
    return false;
  }

  const signatureHeader = req.headers['paymongo-signature'];
  if (!signatureHeader) {
    console.error('Missing PayMongo-Signature header');
    return false;
  }

  // Parse header: "ts=<timestamp>,v1=<signature>"
  const parts = {};
  signatureHeader.split(',').forEach(part => {
    const [key, value] = part.split('=');
    parts[key] = value;
  });

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) {
    console.error('Invalid PayMongo-Signature format');
    return false;
  }

  // Reject if timestamp is older than 5 minutes (replay protection)
  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(ts);
  if (timestampAge > 300) {
    console.error('Webhook timestamp too old:', timestampAge, 'seconds');
    return false;
  }

  // Compute HMAC-SHA256(secret, timestamp.body) using raw body bytes
  const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
  const signedPayload = `${ts}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');

  // Use constant-time comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  const receivedBuf = Buffer.from(v1, 'hex');

  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    console.error('Webhook signature mismatch');
    return false;
  }

  return true;
}

// PayMongo Webhook
app.post('/api/webhooks/paymongo', async (req, res) => {
  try {
    // Verify signature
    if (!verifyPayMongoSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // PayMongo wraps the event: req.body.data is the "event" resource, and the
    // real event type + payload live under .attributes (.type / .data).
    const eventResource = req.body.data;
    const eventType = eventResource?.attributes?.type;
    console.log('Webhook received (verified):', eventType);

    if (eventType === 'checkout_session.payment.paid') {
      const session = eventResource.attributes.data;
      const sessionId = session.id;
      const referenceNumber = session.attributes.reference_number;
      const meta = session.attributes.metadata || {};

      console.log(`Payment paid for session: ${sessionId}, ref: ${referenceNumber}`);

      // Check if order already exists (idempotent — webhook may fire after confirm-payment)
      const { data: existingOrders } = await supabase
        .from('orders')
        .select('id, status')
        .eq('checkout_session_id', sessionId)
        .limit(1);

      if (existingOrders && existingOrders.length > 0) {
        if (existingOrders[0].status !== 'paid') {
          const { error: updateError } = await supabase
            .from('orders')
            .update({ status: 'paid' })
            .eq('id', existingOrders[0].id);
          if (updateError) {
            console.error('Error updating order:', updateError.message);
          } else {
            console.log(`Order ${existingOrders[0].id} marked as paid (webhook)`);
            // Decrement stock (non-blocking)
            (async () => {
              try {
                const { data: fullOrder } = await supabase.from('orders').select('items').eq('id', existingOrders[0].id).single();
                if (!fullOrder?.items) return;
                await decrementStockForItems(fullOrder.items);
              } catch (e) { console.error('[stock] Webhook decrement failed:', e.message); }
            })();
            // Send email (non-blocking)
            if (meta.userId) {
              supabase.from('orders').select('id, user_name, items, subtotal, shipping_fee, total, delivery_option').eq('id', existingOrders[0].id).single()
                .then(({ data: fullOrder }) => sendConfirmationEmail(meta.userId, fullOrder))
                .catch(e => console.error('[email] Failed:', e.message));
            }
          }
        } else {
          console.log(`Order ${existingOrders[0].id} already paid — skipping`);
        }
        return res.sendStatus(200);
      }

      // Insert order from session metadata (order not yet created)
      let orderItems = [];
      try {
        orderItems = JSON.parse(meta.items || '[]');
      } catch {
        console.error('Invalid order items in webhook metadata');
        return res.sendStatus(200);
      }

      const mappedItems = orderItems.map(item => ({
        product_id: item.productId,
        product_name: item.productName,
        qty: item.qty,
        price: item.price,
        image: item.image || '',
        shop_id: item.shopId || null,
        shop_name: item.shopName || '',
        variation_id: item.variationId || null,
        variation: item.variation || '',
      }));

      const subtotal = parseFloat(meta.verifiedSubtotal) || 0;
      const shippingFee = parseFloat(meta.verifiedShippingFee) || 0;
      const total = subtotal + shippingFee;

      const { error: insertError } = await supabase.from('orders').insert({
        user_id: meta.userId || '',
        user_name: meta.userName || '',
        user_phone: meta.userPhone || '',
        user_address: meta.userAddress || '',
        items: mappedItems,
        subtotal,
        shipping_fee: shippingFee,
        total,
        delivery_option: meta.deliveryOption || 'pickup',
        delivery_status: 'pending',
        status: 'paid',
        payment_reference: referenceNumber,
        checkout_session_id: sessionId,
        lalamove_quote_id: meta.lalamoveQuoteId || null,
      });

      if (insertError) {
        console.error('Error creating order from webhook:', insertError.message);
      } else {
        console.log(`Order created from webhook for session ${sessionId}`);
        // Decrement stock (non-blocking)
        (async () => {
          try {
            await decrementStockForItems(mappedItems);
          } catch (e) { console.error('[stock] Webhook decrement failed:', e.message); }
        })();
        // Send email (non-blocking)
        if (meta.userId) {
          sendConfirmationEmail(meta.userId, {
            id: `webhook-${sessionId}`,
            user_name: meta.userName || 'Customer',
            items: mappedItems,
            subtotal,
            shipping_fee: shippingFee,
            total,
            delivery_option: meta.deliveryOption || 'pickup',
            shopName: orderItems[0]?.shopName || '',
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(200); // Always return 200 to PayMongo
  }
});

// Create notification for buyer
app.post('/api/notifications', async (req, res) => {
  try {
    const authUserId = await verifyAuth(req, res);
    if (!authUserId) return;

    const { user_id, type, title, message, order_id, product_image } = req.body;
    if (!type || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // A caller may only create notifications for their own account
    if (user_id && user_id !== authUserId) {
      return res.status(403).json({ error: 'Cannot create notifications for another user' });
    }
    const finalUserId = user_id || authUserId;

    const { data, error } = await supabase
      .from('notifications')
      .insert({ user_id, type, title, message, order_id, product_image })
      .select()
      .single();
    if (error) {
      console.error('Notification insert error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ data });
  } catch (e) {
    console.error('Notification error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Role-based access middleware ────────────────────────────────────────────
async function requireRole(userId, ...allowedRoles) {
  if (!userId) return false;
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role, shop_id')
    .eq('user_id', userId);
  return roles?.some(r => allowedRoles.includes(r.role)) ?? false;
}

function requireSuperAdmin(userId) {
  return requireRole(userId, 'super_admin');
}

// ── JWT verification middleware (replaces x-user-id trust) ──────────────────
async function verifyAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return null;
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
  return user.id;
}

// Decrement stock for ordered items and recompute product-level stock
async function decrementStockForItems(items) {
  if (!items || items.length === 0) return;
  for (const item of items) {
    if (item.variation_id) {
      await supabase.rpc('decrement_stock', { p_variation_id: item.variation_id, p_qty: item.qty });
    }
  }
  const productIds = [...new Set(items.filter(i => i.product_id).map(i => i.product_id))];
  for (const pid of productIds) {
    const { data: vars } = await supabase.from('product_variations').select('stock').eq('product_id', pid);
    const totalStock = (vars || []).reduce((s, v) => s + (Number(v.stock) || 0), 0);
    await supabase.from('products').update({ stock: totalStock }).eq('id', pid);
  }
}

// Fetch buyer email and send the order confirmation email (non-blocking, self-contained)
async function sendConfirmationEmail(userId, order) {
  if (!order) return;
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) return;
    await sendOrderConfirmation({
      orderId: order.id,
      userName: order.user_name || 'Customer',
      userEmail: email,
      items: (order.items || []).map(i => ({ productName: i.product_name ?? i.productName, qty: i.qty, price: i.price, variation: i.variation })),
      subtotal: order.subtotal,
      shippingFee: order.shipping_fee,
      total: order.total,
      deliveryOption: order.delivery_option,
      shopName: order.shopName,
    });
  } catch (e) { console.error('[email] Failed:', e.message); }
}

// ── Admin: Assign role (with auto-create shop for shop_owner) ────────────────
app.post('/api/admin/assign-role', async (req, res) => {
  try {
    const userId = await verifyAuth(req, res);
    if (!userId) return;

    const { userId: targetUserId, role, shopId } = req.body;

    if (!(await requireSuperAdmin(userId))) {
      return res.status(403).json({ error: 'Forbidden: super_admin required' });
    }

    if (!targetUserId || !role || !['shop_owner', 'buyer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role or userId' });
    }

    let finalShopId = shopId;

    if (role === 'shop_owner' && !shopId) {
      // Auto-create shop
      const { data: profile } = await supabase.auth.admin.getUserById(targetUserId);
      const email = profile?.user?.email || `${targetUserId}@example.com`;
      const name = email.split('@')[0] + "'s Shop";

      const { data: shop, error: shopError } = await supabase
        .from('shops')
        .insert({ name, email, owner_id: targetUserId, auto_created: true })
        .select('id')
        .single();

      if (shopError) {
        console.error('Auto-create shop error:', shopError);
        return res.status(500).json({ error: 'Failed to create shop' });
      }
      finalShopId = shop.id;
    }

    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: targetUserId, role, shop_id: finalShopId, assigned_by: userId }, { onConflict: 'user_id,role,shop_id' });

    if (error) {
      console.error('Assign role error:', error);
      return res.status(500).json({ error: 'Failed to assign role' });
    }

    res.json({ success: true, shopId: finalShopId });
  } catch (e) {
    console.error('Assign role error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: List users with roles
app.get('/api/admin/users', async (req, res) => {
  try {
    const userId = await verifyAuth(req, res);
    if (!userId) return;

    if (!(await requireSuperAdmin(userId))) {
      return res.status(403).json({ error: 'Forbidden: super_admin required' });
    }

    const { data: users } = await supabase.auth.admin.listUsers();
    const { data: roles } = await supabase.from('user_roles').select('user_id, role, shop_id');

    const usersWithRoles = users.users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      roles: roles?.filter(r => r.user_id === u.id) || [],
    }));

    res.json({ users: usersWithRoles });
  } catch (e) {
    console.error('List users error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`LikhArtisan server running on port ${PORT}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`[shutdown] Received ${signal} — closing server...`);
  server.close(() => {
    console.log('[shutdown] Server closed');
    process.exit(0);
  });
  // Force-exit if connections don't drain in time
  setTimeout(() => {
    console.error('[shutdown] Forcing exit after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
