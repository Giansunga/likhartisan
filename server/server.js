import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import chatbotRoutes from './routes/chatbot.js';
import { initChatbotController } from './controllers/chatbotController.js';
import { getLikhAIProviderHealth, validateLikhAIConfiguration } from './services/groqService.js';
import { getSupabaseAuthConfigurationState, verifySupabaseAuthConfiguration } from './services/supabaseAuthConfig.js';
import lalamoveRoutes from './routes/lalamove.js';
import { createUploadRouter } from './routes/upload.js';
import { getQuotation, isValidCoordinates, mapLalamoveError } from './services/lalamoveService.js';
import { calculateShipment, createShipmentFingerprint, getShipmentConfig, ShipmentDataError } from './services/shipmentService.js';
import { createPurchasesRouter } from './routes/purchases.js';
import {
  createCheckoutSession,
  retrieveCheckoutSession,
  verifyCheckoutSession,
  verifyPayMongoSignature as verifyPayMongoWebhookSignature,
} from './services/paymongoService.js';
import { createOrderNotifications, decrementStockForItems } from './services/orderFulfillmentService.js';
import { createCustomOrderCheckout } from './services/customOrderCheckoutService.js';
import { normalizeCatalogMeasurement } from './services/measurements.js';
import { resolveNotificationRecipient } from './services/notificationService.js';
import { createActivityRouter } from './routes/activity.js';

// ── Env var validation ──────────────────────────────────────────────────────
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'PAYMONGO_SECRET_KEY'];
for (const v of requiredEnvVars) {
  if (!process.env[v]) {
    console.error(`[FATAL] Missing required env var: ${v}`);
    process.exit(1);
  }
}

// Warn if R2 env vars are missing (needed for file uploads)
const r2EnvVars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];
for (const v of r2EnvVars) {
  if (!process.env[v]) {
    console.warn(`[WARN] Missing R2 env var: ${v} - File uploads will not work`);
  }
}

const app = express();
// Render terminates TLS at its proxy; without this, every request looks like
// one IP and express-rate-limit keys on the proxy — either 429-ing all users
// or being trivially bypassed. trust proxy makes per-client IP limiting work.
app.set('trust proxy', 1);
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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
app.locals.supabase = supabase;

const PRODUCT_SELECT_WITH_SHIPPING = 'id, name, price, image, shop_id, shop_name, stock, dimensions, height, opening_diameter, measurement_unit, product_weight_g, packaging_weight_g, shipping_weight_g, shipping_length_in, shipping_width_in, shipping_height_in';
const PRODUCT_SELECT_LEGACY = 'id, name, price, image, shop_id, shop_name, stock, dimensions, height, opening_diameter, measurement_unit';
const VARIATION_SELECT_WITH_SHIPPING = 'id, product_id, price, stock, dimensions, height, opening_diameter, measurement_unit, weight_kg, product_weight_g, packaging_weight_g, shipping_weight_g, shipping_length_in, shipping_width_in, shipping_height_in';
const VARIATION_SELECT_LEGACY = 'id, product_id, price, stock, dimensions, height, opening_diameter, measurement_unit, weight_kg';
const schemaColumnError = (error) => Boolean(
  error?.code === 'PGRST204' ||
    error?.code === '42703' ||
    /column .* (does not exist|not found)|could not find .* column|schema cache/i.test(error?.message || ''),
);
async function fetchProductForCheckout(id) {
  const full = await supabase.from('products').select(PRODUCT_SELECT_WITH_SHIPPING).eq('id', id).single();
  return full.error && schemaColumnError(full.error)
    ? supabase.from('products').select(PRODUCT_SELECT_LEGACY).eq('id', id).single()
    : full;
}
async function fetchVariationForCheckout(id) {
  const full = await supabase.from('product_variations').select(VARIATION_SELECT_WITH_SHIPPING).eq('id', id).single();
  return full.error && schemaColumnError(full.error)
    ? supabase.from('product_variations').select(VARIATION_SELECT_LEGACY).eq('id', id).single()
    : full;
}
void verifySupabaseAuthConfiguration({
  backendUrl: process.env.SUPABASE_URL,
  frontendUrl: process.env.LIKHAI_FRONTEND_SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_KEY,
});

const WARN_MISSING_R2 = '[WARN] Missing R2 env var';
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

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
// CORS: Allow dev origins (localhost) + production frontend (Vercel) + configured FRONTEND_URL
const devOrigins = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const vercelDomains = [/^https:\/\/likhartisan\.vercel\.app$/, /^https:\/\/likhartisan-[a-z0-9-]+\.vercel\.app$/];
app.use(cors({
  origin: (reqOrigin, cb) => {
    if (!reqOrigin || devOrigins.test(reqOrigin) || reqOrigin === FRONTEND_URL || vercelDomains.some(r => r.test(reqOrigin))) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(apiLimiter);
app.use(express.json({
  limit: '50kb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Health check endpoint (for auto-ping)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/likhai', (req, res) => {
  res.status(200).json({
    ...getLikhAIProviderHealth(),
    authConfigurationState: getSupabaseAuthConfigurationState(),
    timestamp: new Date().toISOString(),
  });
});

// Initialize chatbot controller with Supabase
initChatbotController(supabase);
validateLikhAIConfiguration();

// Chatbot routes
app.use('/api/chatbot', chatbotLimiter, chatbotRoutes);

// Buyer purchase center (JWT-derived identity; no body-supplied user IDs).
app.use('/api/orders', createPurchasesRouter({ supabase, verifyAuth, requireSuperAdmin }));

// Lalamove routes
app.use('/api/lalamove', proxyLimiter, lalamoveRoutes);

// Upload routes (presigned URLs for R2)
app.use('/api/upload', createUploadRouter({ verifyAuth, requireSuperAdmin }));

// ── Presigned upload for design GLB exports ──────────────────────────────────
app.post('/api/designs/upload-model', apiLimiter, async (req, res) => {
  try {
    const userId = await verifyAuth(req, res);
    if (!userId) return;

    const key = `designs/${userId}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.glb`;
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: 'model/gltf-binary',
    });
    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 120 });
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    res.json({ presignedUrl, publicUrl, key });
  } catch (error) {
    console.error('Design upload presign error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Create PayMongo Checkout Session
app.post('/api/create-checkout', paymongoLimiter, async (req, res) => {
  try {
    const authUserId = await verifyAuth(req, res);
    if (!authUserId) return;
    const { items, userName, userPhone, userAddress, userEmail, deliveryOption, shipmentFingerprint: clientShipmentFingerprint, pickupCoords, dropoffCoords, shopAddress } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
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
      if (!item.productId || !Number.isInteger(qty) || qty <= 0) {
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
      productIds.map(fetchProductForCheckout)
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
      variationItems.map(v => fetchVariationForCheckout(v.item.variationId))
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
      let measurementSource = product;
      let shippingSource = product;

      if (item.variationId) {
        const variation = variationMap.get(item.variationId);
        if (!variation || variation.product_id !== item.productId) {
          return res.status(400).json({ error: `Invalid variation for ${product.name}` });
        }
        if (variation.price !== null && variation.price !== undefined) {
          unitPrice = Number(variation.price) || unitPrice;
        }
        measurementSource = variation;
        // A selected variation is a separate sellable package. Require its
        // own shipping facts instead of borrowing the base product silently.
        shippingSource = variation;
        variationLabel = [
          variation.dimensions ? normalizeCatalogMeasurement(variation.dimensions, variation.measurement_unit === 'in' ? 'in' : 'cm') : '',
          variation.height ? `H: ${normalizeCatalogMeasurement(variation.height, variation.measurement_unit === 'in' ? 'in' : 'cm')}` : '',
          variation.opening_diameter ? `Opening: ${normalizeCatalogMeasurement(variation.opening_diameter, variation.measurement_unit === 'in' ? 'in' : 'cm')}` : '',
        ].filter(Boolean).join(' | ');
      }

      const measurementUnit = 'in';
      const measurementSourceUnit = measurementSource.measurement_unit === 'in' ? 'in' : 'cm';
      const dimensions = normalizeCatalogMeasurement(measurementSource.dimensions, measurementSourceUnit);
      const height = normalizeCatalogMeasurement(measurementSource.height, measurementSourceUnit);
      const openingDiameter = normalizeCatalogMeasurement(measurementSource.opening_diameter, measurementSourceUnit);

      verifiedSubtotal += unitPrice * qty;
      verifiedItems.push({
        productId: item.productId,
        productName: product.name,
        image: product.image || item.image || '',
        shopId: product.shop_id || null,
        shopName: product.shop_name || item.shopName || '',
         variationId: item.variationId || null,
         variation: variationLabel,
         dimensions,
         height,
         opening_diameter: openingDiameter,
         measurement_unit: measurementUnit,
          price: unitPrice,
         qty,
         weight_kg: shippingSource.weight_kg,
         shipping_weight_g: shippingSource.shipping_weight_g,
         product_weight_g: shippingSource.product_weight_g,
         packaging_weight_g: shippingSource.packaging_weight_g,
         shipping_length_in: shippingSource.shipping_length_in,
         shipping_width_in: shippingSource.shipping_width_in,
         shipping_height_in: shippingSource.shipping_height_in,
       });
    }

    // ── Server-authorized shipping fee ───────────────────────────────────────
    // The browser supplies only cart identities. Weight, package dimensions,
    // vehicle selection, and the final Lalamove fee are recomputed here.
    let verifiedShippingFee = 0;
    let verifiedShipment = null;
    let verifiedShipmentFingerprint = null;
    let verifiedQuote = null;
    if (deliveryOption === 'courier') {
      if (new Set(verifiedItems.map(item => item.shopId).filter(Boolean)).size > 1) {
        return res.status(422).json({ error: 'Please check out items from one artisan shop at a time for courier delivery.', code: 'ERR_MULTIPLE_SHOPS' });
      }
      const validCoords = isValidCoordinates(pickupCoords) && isValidCoordinates(dropoffCoords);
      if (!validCoords) {
        return res.status(400).json({ error: 'Courier orders require geocoded pickup/dropoff coordinates' });
      }
      try {
        verifiedShipment = calculateShipment(verifiedItems, getShipmentConfig());
        verifiedQuote = await getQuotation({
          pickupCoords,
          dropoffCoords,
          pickupAddress: shopAddress || '',     // seller (shop) address label
          dropoffAddress: userAddress || '',      // buyer address label
          serviceType: verifiedShipment.recommendedVehicle.serviceType,
        });
        const fee = parseFloat(verifiedQuote?.priceBreakdown?.total);
        if (!fee || fee <= 0) {
          return res.status(400).json({ error: 'Unable to compute shipping fee. Please try again.' });
        }
        verifiedShippingFee = fee;
        verifiedShipmentFingerprint = createShipmentFingerprint({
          items: verifiedItems,
          shipment: verifiedShipment,
          pickupCoords,
          dropoffCoords,
          serviceType: verifiedQuote.serviceType,
        });
        if (clientShipmentFingerprint && clientShipmentFingerprint !== verifiedShipmentFingerprint) {
          return res.status(409).json({ error: 'Your cart or delivery route changed. Please refresh the courier fee and try again.', code: 'ERR_STALE_SHIPMENT' });
        }
      } catch (err) {
        console.error('[create-checkout] shipment or Lalamove re-quote failed:', {
          code: err?.code || null,
          status: err?.status || null,
          requestId: err?.requestId || null,
          message: err?.message || null,
        });
        const status = Number.isInteger(err?.status) ? err.status : err instanceof ShipmentDataError ? 422 : 400;
        return res.status(status).json({
          error: mapLalamoveError(err),
          code: err?.code || 'LALAMOVE_QUOTE_FAILED',
          requestId: err?.requestId || null,
        });
      }
    }
    const serverTotal = verifiedSubtotal + verifiedShippingFee;
    const shippingDistanceMeters = verifiedQuote?.distance?.value == null
      ? null
      : String(verifiedQuote.distance.unit || '').toLowerCase().startsWith('km')
        ? Math.round(Number(verifiedQuote.distance.value) * 1000)
        : Math.round(Number(verifiedQuote.distance.value));
    const shippingQuoteSnapshot = verifiedQuote && verifiedShipment ? {
      provider: 'lalamove',
      quotationId: verifiedQuote.quotationId,
      serviceType: verifiedQuote.serviceType,
      priceBreakdown: verifiedQuote.priceBreakdown,
      currency: verifiedQuote.currency || 'PHP',
      distance: verifiedQuote.distance || null,
      distanceMeters: Number.isFinite(shippingDistanceMeters) ? shippingDistanceMeters : null,
      expiresAt: verifiedQuote.expiresAt || null,
      totalWeightG: verifiedShipment.totalWeightG,
      totalVolumeCm3: verifiedShipment.totalVolumeCm3,
      itemCount: verifiedShipment.itemCount,
      pickupCoords,
      dropoffCoords,
      fingerprint: verifiedShipmentFingerprint,
    } : null;

    const lineItems = verifiedItems.map(item => ({
      name: item.productName,
      amount: Math.round(item.price * 100), // PayMongo uses centavos
      currency: 'PHP',
      quantity: item.qty,
    }));

    // Add shipping fee as a line item if applicable
    if (verifiedShippingFee && verifiedShippingFee > 0) {
      lineItems.push({
        name: 'Shipping Fee',
        amount: Math.round(verifiedShippingFee * 100),
        currency: 'PHP',
        quantity: 1,
      });
    }

    const orderId = crypto.randomUUID();
    const referenceNumber = `LA-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const checkoutSession = await createCheckoutSession({
            line_items: lineItems,
            payment_method_types: ['gcash', 'paymaya', 'qrph', 'card'],
            success_url: `${FRONTEND_URL}/checkout/success?order_id=${encodeURIComponent(orderId)}&ref=${encodeURIComponent(referenceNumber)}`,
            cancel_url: `${FRONTEND_URL}/checkout?cancelled=true`,
            reference_number: referenceNumber,
            description: `LikhArtisan Order - ${verifiedItems.length} item(s)`,
            metadata: {
              orderId,
              userId: authUserId,
              userName: userName || '',
              userPhone: userPhone || '',
              userAddress: userAddress || '',
              userEmail: userEmail || '',
              deliveryOption: deliveryOption || '',
              lalamoveQuoteId: (verifiedQuote?.quotationId || '').toString(),
              shipmentFingerprint: verifiedShipmentFingerprint || '',
              items: JSON.stringify(verifiedItems),
              verifiedSubtotal: verifiedSubtotal.toString(),
              verifiedShippingFee: verifiedShippingFee.toString(),
              serverTotal: serverTotal.toString(),
            },
    }, PAYMONGO_SECRET_KEY);

    const checkoutUrl = checkoutSession.attributes.checkout_url;
    const sessionId = checkoutSession.id;

    const mappedItems = verifiedItems.map(item => ({
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
    const orderData = {
      id: orderId,
      user_id: authUserId,
      user_name: userName.trim(),
      user_phone: userPhone.trim(),
      user_address: (userAddress || '').trim(),
      buyer_email: userEmail || '',
      items: mappedItems,
      subtotal: verifiedSubtotal,
      shipping_fee: verifiedShippingFee,
      total: serverTotal,
      delivery_option: deliveryOption,
      delivery_status: 'pending',
      status: 'pending',
      payment_status: 'pending',
      payment_reference: referenceNumber,
      checkout_session_id: sessionId,
      lalamove_quote_id: verifiedQuote?.quotationId || null,
      shipping_quote_snapshot: shippingQuoteSnapshot,
      shipment_fingerprint: verifiedShipmentFingerprint,
      shipping_service_type: verifiedQuote?.serviceType || null,
      shipping_distance_m: Number.isFinite(shippingDistanceMeters) ? shippingDistanceMeters : null,
      shipping_total_weight_g: verifiedShipment?.totalWeightG || null,
      shipping_total_volume_cm3: verifiedShipment?.totalVolumeCm3 || null,
    };
    let { error: orderError } = await supabase.from('orders').insert(orderData);
    // Keep checkout compatible during the expand window before the audit
    // columns are applied. Courier pricing itself remains fully revalidated.
    if (orderError && schemaColumnError(orderError)) {
      for (const field of ['shipping_quote_snapshot', 'shipment_fingerprint', 'shipping_service_type', 'shipping_distance_m', 'shipping_total_weight_g', 'shipping_total_volume_cm3']) delete orderData[field];
      ({ error: orderError } = await supabase.from('orders').insert(orderData));
      if (!orderError) console.warn('[create-checkout] Order audit columns are not deployed yet; saved without the courier snapshot.');
    }
    if (orderError) {
      console.error('[create-checkout] Pending order insert failed:', orderError.message);
      return res.status(500).json({ error: 'Unable to save the order before payment. Please try again.' });
    }

    res.json({ checkoutUrl, orderId, referenceNumber, total: serverTotal });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retrieve Checkout Session status
app.get('/api/session/:sessionId', paymongoLimiter, async (req, res) => {
  try {
    const authUserId = await verifyAuth(req, res);
    if (!authUserId) return;
    const { sessionId } = req.params;
    if (!/^cs_[A-Za-z0-9_-]+$/.test(sessionId)) return res.status(400).json({ error: 'Invalid checkout session ID' });
    const { data: order, error } = await supabase.from('orders').select('id')
      .eq('checkout_session_id', sessionId).eq('user_id', authUserId).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Checkout session not found' });
    const session = await retrieveCheckoutSession(sessionId, PAYMONGO_SECRET_KEY);
    res.json({ checkout_url: session.attributes?.checkout_url, status: session.attributes?.status });
  } catch (error) {
    console.error('Server error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
});

// Create or resume checkout for an approved custom-design order.
app.post('/api/orders/:orderId/checkout', paymongoLimiter, async (req, res) => {
  try {
    const authUserId = await verifyAuth(req, res);
    if (!authUserId) return;
    const result = await createCustomOrderCheckout({
      supabase,
      userId: authUserId,
      orderId: req.params.orderId,
      secretKey: PAYMONGO_SECRET_KEY,
      frontendUrl: FRONTEND_URL,
    });
    return res.json(result);
  } catch (error) {
    console.error('[custom-checkout] Error:', error.message);
    return res.status(error.status || 500).json({ error: error.status && error.status < 500 ? error.message : 'Unable to start custom-order checkout' });
  }
});

const PAYMENT_ORDER_FIELDS = 'id, user_id, user_name, items, total, status, payment_status, payment_reference, checkout_session_id, design_request_id, order_type';

async function finalizeVerifiedOrder(order, verification, source) {
  if (order.payment_status === 'paid' && order.status === 'paid') return { transitioned: false, alreadyPaid: true };
  if (['cancelled', 'refunded'].includes(order.status) || order.payment_status === 'refunded') {
    const error = new Error('A cancelled or refunded order cannot be marked paid');
    error.status = 409;
    throw error;
  }
  const verifiedAt = new Date().toISOString();
  const { data, error } = await supabase.from('orders').update({
    status: 'paid',
    payment_status: 'paid',
    payment_verified_at: verifiedAt,
    payment_provider_id: verification.providerPaymentId,
    payment_verification_source: source,
  }).eq('id', order.id).or('payment_status.is.null,payment_status.neq.paid,status.eq.pending').select('id').maybeSingle();
  if (error) throw error;
  if (!data) return { transitioned: false, alreadyPaid: true };

  try {
    await decrementStockForItems(supabase, order.items || []);
    await createOrderNotifications(supabase, order.id, order.items || [], order.user_name || '');
    if (order.design_request_id) {
      const { data: request } = await supabase.from('design_requests')
        .select('current_revision').eq('id', order.design_request_id).maybeSingle();
      await supabase.from('design_request_events').insert({
        request_id: order.design_request_id,
        actor_role: 'system',
        event_type: 'payment_verified',
        revision_number: request?.current_revision || null,
        payload: { order_id: order.id, payment_provider_id: verification.providerPaymentId, source },
      });
    }
  } catch (error) {
    console.error(`[payment] Fulfillment initialization failed for ${order.id}:`, error.message);
  }
  return { transitioned: true, alreadyPaid: false, verifiedAt };
}

async function reconcileOrderPayment(order, { source, requireOrderMetadata = true, paidEvent = false } = {}) {
  if (order.payment_status === 'paid' && order.status === 'paid') return { state: 'paid', alreadyPaid: true };
  const session = await retrieveCheckoutSession(order.checkout_session_id, PAYMONGO_SECRET_KEY);
  const verification = verifyCheckoutSession(session, order, {
    expectedUserId: order.user_id,
    secretKey: PAYMONGO_SECRET_KEY,
    requireOrderMetadata,
    paidEvent,
  });
  if (verification.state === 'pending') return { state: 'pending' };
  if (!verification.ok) {
    const error = new Error(`Payment verification failed: ${verification.errors.join('; ')}`);
    error.status = 422;
    throw error;
  }
  const finalized = await finalizeVerifiedOrder(order, verification, source);
  return { state: 'paid', ...finalized };
}

app.post('/api/orders/:orderId/payment/verify', paymongoLimiter, async (req, res) => {
  try {
    const authUserId = await verifyAuth(req, res);
    if (!authUserId) return;
    const { data: order, error } = await supabase.from('orders').select(PAYMENT_ORDER_FIELDS)
      .eq('id', req.params.orderId).eq('user_id', authUserId).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const result = await reconcileOrderPayment(order, { source: 'return_page' });
    if (result.state === 'pending') return res.status(202).json({ success: false, state: 'pending' });
    return res.json({ success: true, verified: true, state: 'paid' });
  } catch (error) {
    console.error('[verify-payment] Error:', error.message);
    res.status(error.status || 500).json({ success: false, state: 'error', error: error.message || 'Payment verification failed' });
  }
});

// Compatibility endpoint for checkout sessions created before order-id correlation.
app.post('/api/confirm-payment', paymongoLimiter, async (req, res) => {
  try {
    const authUserId = await verifyAuth(req, res);
    if (!authUserId) return;
    const sessionId = String(req.body?.sessionId || '');
    if (!/^cs_[A-Za-z0-9_-]+$/.test(sessionId)) return res.status(400).json({ error: 'Valid sessionId is required' });
    const { data: order, error } = await supabase.from('orders').select(PAYMENT_ORDER_FIELDS)
      .eq('checkout_session_id', sessionId).eq('user_id', authUserId).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Order not found for this checkout session' });
    const result = await reconcileOrderPayment(order, { source: 'legacy_return_page', requireOrderMetadata: false });
    if (result.state === 'pending') return res.status(202).json({ success: false, state: 'pending' });
    return res.json({ success: true, verified: true, state: 'paid' });
  } catch (error) {
    console.error('[confirm-payment] Error:', error.message);
    res.status(error.status || 500).json({ success: false, state: 'error', error: error.message || 'Payment verification failed' });
  }
});


// PayMongo Webhook Signature Verification
function verifyPayMongoSignature(req) {
  return verifyPayMongoWebhookSignature({
    rawBody: req.rawBody,
    signatureHeader: req.headers['paymongo-signature'],
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
    liveMode: PAYMONGO_SECRET_KEY.startsWith('sk_live_'),
  });
}

// PayMongo Webhook
app.post('/api/webhooks/paymongo', async (req, res) => {
  let logId = null;
  let eventId = null;
  try {
    if (!verifyPayMongoSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    const eventResource = req.body.data;
    const eventType = eventResource?.attributes?.type;
    eventId = eventResource?.id;
    if (!eventId || !eventType) return res.status(400).json({ error: 'Malformed webhook event' });

    const { data: insertedLog, error: insertLogError } = await supabase.from('webhook_logs').upsert({
      event_id: eventId,
      event_type: eventType,
      payload: req.body,
      processed: false,
      error_message: null,
    }, { onConflict: 'event_id', ignoreDuplicates: true }).select('id, processed').maybeSingle();
    if (insertLogError) throw insertLogError;
    if (insertedLog) {
      logId = insertedLog.id;
    } else {
      const { data: existingLog, error: existingLogError } = await supabase.from('webhook_logs')
        .select('id, processed').eq('event_id', eventId).single();
      if (existingLogError) throw existingLogError;
      logId = existingLog.id;
      if (existingLog.processed) return res.sendStatus(200);
    }

    if (eventType === 'checkout_session.payment.paid') {
      const webhookSession = eventResource.attributes.data;
      const sessionId = webhookSession?.id;
      const orderId = webhookSession?.attributes?.metadata?.orderId;
      let query = supabase.from('orders').select(PAYMENT_ORDER_FIELDS);
      query = orderId ? query.eq('id', orderId) : query.eq('checkout_session_id', sessionId);
      const { data: order, error: orderError } = await query.maybeSingle();
      if (orderError) throw orderError;
      if (!order) {
        const error = new Error(`Order not found for paid checkout session ${sessionId || 'unknown'}`);
        error.status = 503;
        throw error;
      }
      if (order.checkout_session_id !== sessionId) {
        const error = new Error('Webhook checkout session does not match the order');
        error.status = 422;
        throw error;
      }
      await reconcileOrderPayment(order, { source: 'webhook', paidEvent: true, requireOrderMetadata: Boolean(orderId) });
    }

    const { error: completeError } = await supabase.from('webhook_logs').update({
      processed: true,
      processed_at: new Date().toISOString(),
      error_message: null,
    }).eq('id', logId);
    if (completeError) throw completeError;
    return res.sendStatus(200);
  } catch (error) {
    console.error('[WEBHOOK] Processing failed:', error.message);
    if (logId) {
      await supabase.from('webhook_logs').update({ processed: false, error_message: error.message }).eq('id', logId);
    }
    return res.status(error.status && error.status < 500 ? error.status : 500).json({ error: 'Webhook processing failed' });
  }
});

// Create notification for buyer
app.post('/api/notifications', async (req, res) => {
  try {
    const authUserId = await verifyAuth(req, res);
    if (!authUserId) return;

    const { type, title, message, product_image } = req.body;
    if (!type || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const target = await resolveNotificationRecipient(supabase, authUserId, req.body);

    const { data, error } = await supabase
      .from('notifications')
      .insert({ ...target, type, title, message, product_image: product_image || '' })
      .select()
      .single();
    if (error) {
      console.error('Notification insert error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ data });
  } catch (e) {
    console.error('Notification error:', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
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

app.use('/api/activity', createActivityRouter({ supabase, verifyAuth, requireSuperAdmin }));

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
