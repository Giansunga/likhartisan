import crypto from 'crypto';
import xss from 'xss';
import { chatWithGroq, GROQ_MODEL } from '../services/groqService.js';
import {
  GENERAL_ACTIONS,
  LIKHAI_KNOWLEDGE,
  SIGN_IN_ACTION,
  isAllowedActionHref,
} from '../services/likhaiKnowledge.js';

let supabase = null;

export function initChatbotController(supabaseClient) {
  supabase = supabaseClient;
}

const INTENT_PATTERNS = Object.freeze({
  order: [
    /\b(order|orders|track|tracking|package|status|shipped|delivered|preparing)\b/i,
    /\b(booking|parcel)\b/i,
    /\b(aking|ko|kong)\s+(order|parcel|binili)\b/i,
    /\b(nasaan|asan|status|dumating|darating)\b.*\b(order|parcel|binili)\b/i,
  ],
  product: [
    /\b(product|products|pottery|pot|vase|bowl|jar|clay|terracotta|ceramic|glazed|matte|metallic|price|cost|available|stock)\b/i,
    /\b(palayok|banga|paso|seramika|luwad|presyo|magkano|produkto|paninda)\b/i,
  ],
  shop: [
    /\b(shop|shops|artisan|artisans|seller|store|maker)\b/i,
    /\b(tindahan|gumagawa|magpapalayok|manlilikha)\b/i,
  ],
  freeform: [
    /\b(freeform|3d design|designer|customize|custom|shape|curvature|attachment|pattern|finish)\b/i,
    /\b(disenyo|i-customize|pasadya|hugis|kulay)\b/i,
  ],
  checkout: [
    /\b(checkout|payment|pay|paid|gcash|maya|qr\s*ph|card|paymongo|cart|buy|purchase)\b/i,
    /\b(bayad|magbayad|binayaran|bayaran|bilhin|kariton)\b/i,
  ],
  shipping: [
    /\b(ship|shipping|deliver|delivery|pickup|courier|delivery fee)\b/i,
    /\b(padala|ipadala|ihatid|deliver|kargamento|kuha)\b/i,
  ],
  returns: [
    /\b(return|refund|exchange|cancel|cancellation)\b/i,
    /\b(ibalik|refund|palitan|kansela|kanselahin)\b/i,
  ],
  account: [
    /\b(account|profile|password|login|log in|sign in|sign up|register)\b/i,
    /\b(akawnt|password|mag-login|rehistro)\b/i,
  ],
});

const INTENT_PRIORITY = ['returns', 'order', 'checkout', 'shipping', 'product', 'shop', 'freeform', 'account'];
const SUPPORT_GOAL_PATTERNS = Object.freeze({
  contact_seller: /\b(contact|message|talk to|chat with|seller|artisan|kausapin|i-message|messagehin)\b/i,
  account_recovery: /\b(forgot|reset|recover|password|nakalimutan|limot)\b/i,
  cancel_order: /\b(cancel|cancellation|kansela|kanselahin)\b/i,
  return_status: /\b(return|refund|exchange|ibalik|palitan)\b/i,
  payment_status: /\b(payment|pay|paid|gcash|maya|qr\s*ph|card|bayad|magbayad|binayaran)\b/i,
  delivery_details: /\b(track|tracking|courier|ship|shipped|delivery|deliver|pickup|package|parcel|where is|where's|nasaan|dumating|darating|padala)\b/i,
  clarify: /^\s*(help|help me|tulong|patulong|may problem|problem|support)\s*[!?.,]*\s*$/i,
});
const PRODUCT_STOP_WORDS = new Set([
  'show', 'find', 'browse', 'recommend', 'suggest', 'want', 'need', 'have', 'with', 'under', 'over', 'about', 'what', 'which', 'your',
  'product', 'products', 'pottery', 'price', 'cost', 'available', 'please', 'ako', 'ang', 'mga', 'may',
  'gusto', 'magkano', 'presyo', 'hanap', 'pakita', 'isang', 'para', 'naman', 'po',
]);
const PRODUCT_ALIASES = Object.freeze({
  paso: ['pot', 'planter'], palayok: ['pot'], banga: ['jar', 'vase'], mangkok: ['bowl'],
  luwad: ['clay'], seramika: ['ceramic'], porselana: ['porcelain'],
});

export function detectIntent(message) {
  const all = INTENT_PRIORITY.filter(intent => INTENT_PATTERNS[intent].some(pattern => pattern.test(message)));
  if (all.includes('returns') && /\b(my|order|purchase|aking|ko|kong|binili)\b/i.test(message) && !all.includes('order')) all.push('order');
  if (all.includes('shipping') && /\border\b|\baking\b/i.test(message) && !all.includes('order')) all.push('order');
  if (all.includes('checkout') && /\b(my|order|purchase|aking|ko|kong|binili)\b/i.test(message) && !all.includes('order')) all.push('order');
  return { primary: all[0] || 'general', all: all.length ? all : ['general'] };
}

export function detectSupportGoal(message, primary = detectIntent(message).primary) {
  if (SUPPORT_GOAL_PATTERNS.clarify.test(message)) return 'clarify';
  if (SUPPORT_GOAL_PATTERNS.account_recovery.test(message)) return 'account_recovery';
  if (SUPPORT_GOAL_PATTERNS.contact_seller.test(message)) return 'contact_seller';
  if (SUPPORT_GOAL_PATTERNS.cancel_order.test(message)) return 'cancel_order';
  if (SUPPORT_GOAL_PATTERNS.return_status.test(message)) return 'return_status';
  if (SUPPORT_GOAL_PATTERNS.payment_status.test(message)) return 'payment_status';
  if (SUPPORT_GOAL_PATTERNS.delivery_details.test(message)) return 'delivery_details';
  return primary === 'order' ? 'order_status' : 'information';
}

export function normalizeHistory(history, currentMessage) {
  const normalized = Array.isArray(history)
    ? history.slice(-20).map(item => ({
      role: item?.role === 'user' ? 'user' : 'assistant',
      content: xss(String(item?.content || '').trim().slice(0, 1000)),
    })).filter(item => item.content)
    : [];
  const last = normalized.at(-1);
  if (last?.role === 'user' && last.content === currentMessage) normalized.pop();
  return [...normalized, { role: 'user', content: currentMessage }];
}

export function buyerOrderStatus(status, paymentStatus, deliveryStatus) {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'refunded' || paymentStatus === 'refunded') return 'return-refund';
  if (status === 'completed' || deliveryStatus === 'completed') return 'completed';
  if (paymentStatus === 'paid' && deliveryStatus === 'delivered') return 'to-receive';
  if (paymentStatus === 'paid') return 'to-ship';
  if (status === 'pending' || (paymentStatus || 'pending') !== 'paid') return 'to-pay';
  if (deliveryStatus === 'delivered') return 'to-receive';
  return 'to-ship';
}

function productSearchTerms(message) {
  const raw = message.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/g, ' ').split(/\s+/)
    .filter(term => term.length > 2 && !/^\d+$/.test(term) && !PRODUCT_STOP_WORDS.has(term));
  return [...new Set(raw.flatMap(term => [term, ...(PRODUCT_ALIASES[term] || [])]))].slice(0, 10);
}

function productPriceRange(message) {
  const normalized = message.toLowerCase().replace(/,/g, '');
  const between = normalized.match(/(?:between|mula)\s*₱?\s*(\d+(?:\.\d+)?)\s*(?:and|to|hanggang|at)\s*₱?\s*(\d+(?:\.\d+)?)/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };
  const maximum = normalized.match(/(?:under|below|less than|max(?:imum)?|hanggang|hindi lalampas)\s*₱?\s*(\d+(?:\.\d+)?)/);
  if (maximum) return { min: null, max: Number(maximum[1]) };
  const minimum = normalized.match(/(?:over|above|more than|min(?:imum)?|at least|mahigit)\s*₱?\s*(\d+(?:\.\d+)?)/);
  if (minimum) return { min: Number(minimum[1]), max: null };
  return { min: null, max: null };
}

export function rankProducts(rows, message) {
  const terms = productSearchTerms(message);
  const range = productPriceRange(message);
  const ranked = [...(rows || [])].filter(product => {
    const price = Number(product.price);
    return Number.isFinite(price) && (range.min === null || price >= range.min) && (range.max === null || price <= range.max);
  }).map((product, index) => {
    const haystack = [product.name, product.category, product.materials, product.description].filter(Boolean).join(' ').toLowerCase();
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? (String(product.name || '').toLowerCase().includes(term) ? 3 : 1) : 0), 0);
    return { product, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  if (terms.length && !ranked.some(entry => entry.score > 0)) return [];
  return ranked.slice(0, 5).map(entry => entry.product);
}

const INVALID_AUTH_CODES = new Set([
  'bad_jwt',
  'invalid_token',
  'jwt_expired',
  'session_not_found',
  'user_not_found',
]);

const AUTH_CONFIGURATION_CODES = new Set([
  'invalid_api_key',
  'api_key_not_found',
  'apikey_not_found',
]);

export function classifyAuthVerificationError(error) {
  const status = Number(error?.status);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (AUTH_CONFIGURATION_CODES.has(code) || /invalid\s+(api\s*)?key|api\s*key.*(?:invalid|missing|not found)/i.test(message)) return 'configuration';
  if (status === 429 || status >= 500) return 'unavailable';
  if (INVALID_AUTH_CODES.has(code) || [400, 401, 403, 422].includes(status)) return 'invalid';
  return 'unavailable';
}

function authenticationError(kind) {
  const error = new Error(kind === 'invalid' ? 'Invalid or expired token' : 'Authentication verification unavailable');
  error.status = kind === 'invalid' ? 401 : 503;
  error.code = kind === 'invalid'
    ? 'AUTH_SESSION_INVALID'
    : kind === 'configuration' ? 'AUTH_CONFIGURATION_INVALID' : 'AUTH_VERIFICATION_UNAVAILABLE';
  error.authResult = kind;
  return error;
}

async function optionalAuthenticatedUser(req) {
  const header = req.headers?.authorization;
  if (!header) return { user: null, authResult: 'anonymous' };
  if (!header.startsWith('Bearer ') || header.length <= 7) {
    throw authenticationError('invalid');
  }
  let result;
  try {
    result = await supabase.auth.getUser(header.slice(7));
  } catch (error) {
    throw authenticationError(classifyAuthVerificationError(error));
  }
  const { data: { user } = {}, error } = result || {};
  if (error) throw authenticationError(classifyAuthVerificationError(error));
  if (!user) throw authenticationError('invalid');
  return { user, authResult: 'verified' };
}

function orderCard(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const first = items[0] || {};
  return {
    type: 'order', id: order.id, shortId: order.id.slice(0, 8),
    status: buyerOrderStatus(order.status, order.payment_status, order.delivery_status),
    deliveryStatus: order.delivery_status || 'pending', total: Number(order.total || 0),
    createdAt: order.created_at, itemCount: items.length, image: first.image || null,
    productName: first.product_name || first.productName || null,
    paymentStatus: order.payment_status || 'pending', deliveryOption: order.delivery_option || 'pickup',
    deliveryProvider: order.delivery_provider || null, trackingNumber: order.tracking_number || null,
    estimatedDelivery: order.estimated_delivery || null, deliveryNotes: order.delivery_notes || null,
    cancellationEligible: order.status === 'pending' && (order.payment_status || 'pending') !== 'paid',
    returnStatus: order.returnStatus || null, returnEligibility: order.returnEligibility || 'unknown',
    href: `/dashboard?tab=purchases&order=${encodeURIComponent(order.id)}`,
  };
}

const ORDER_STATUS_LABELS = Object.freeze({
  'to-pay': 'To Pay', 'to-ship': 'To Ship', preparing: 'Preparing',
  'to-receive': 'To Receive', shipped: 'Shipped', delivered: 'Delivered',
  completed: 'Completed', 'return-refund': 'Return / Refund', cancelled: 'Cancelled', pending: 'Pending',
});

function productCard(product) {
  return {
    type: 'product', id: product.id, name: product.name, category: product.category || '',
    materials: product.materials || '', price: Number(product.price || 0), image: product.image || '',
    stock: Number(product.stock || 0), href: `/product/${encodeURIComponent(product.id)}`,
  };
}

function shopCard(shop) {
  return {
    type: 'shop', id: shop.id, name: shop.name, description: shop.description || '',
    location: shop.location || '', href: `/shop/${encodeURIComponent(shop.id)}`,
  };
}

function returnEligibilityForSupport(order, activity = []) {
  if (!['delivered', 'completed'].includes(order.delivery_status) && order.status !== 'completed') return 'not_yet';
  const completion = activity.find(item => item.new_status === 'completed' || item.new_delivery_status === 'completed' || item.action_type === 'legacy_completion');
  if (!completion && order.delivery_status === 'delivered') return 'eligible';
  const completedAt = new Date(completion?.created_at || Date.now());
  const deadline = new Date(completedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  return deadline >= new Date() ? 'eligible' : 'expired';
}

async function buildContext(intents, message, user) {
  const context = [];
  const cards = [];
  const actions = [];
  const suggestions = [];
  const errors = [];
  const grounding = { order: 'not_requested', product: 'not_requested', shop: 'not_requested' };
  let requiresAuth = false;

  for (const intent of intents) {
    const knowledge = LIKHAI_KNOWLEDGE[intent];
    if (knowledge) {
      context.push(knowledge.context);
      actions.push(...knowledge.actions);
      suggestions.push(...knowledge.suggestions);
    }
  }

  const jobs = [];
  if (intents.includes('order')) {
    if (!user) {
      requiresAuth = true;
      grounding.order = 'auth_required';
      context.push('The customer is not authenticated. Do not provide order information; ask them to sign in.');
      actions.unshift(SIGN_IN_ACTION);
    } else {
      grounding.order = 'unavailable';
      actions.push({ id: 'view-purchases', label: 'View my purchases', href: '/dashboard?tab=purchases' });
      jobs.push((async () => {
        const { data, error } = await supabase.from('orders')
          .select('id,status,payment_status,delivery_status,delivery_option,delivery_provider,tracking_number,estimated_delivery,delivery_notes,total,created_at,items')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(5);
        if (error) throw new Error('orders_unavailable');
        const orders = [...(data || [])];
        if (intents.includes('returns') && orders.length) {
          const orderIds = orders.map(order => order.id);
          const [returnsResult, activityResult] = await Promise.all([
            supabase.from('order_return_requests').select('order_id,status,created_at').in('order_id', orderIds).neq('status', 'draft').order('created_at', { ascending: false }),
            supabase.from('order_activity_log').select('order_id,action_type,new_status,new_delivery_status,created_at').in('order_id', orderIds).order('created_at', { ascending: true }),
          ]);
          if (returnsResult.error || activityResult.error) throw new Error('orders_unavailable');
          const returnByOrder = new Map();
          for (const request of returnsResult.data || []) if (!returnByOrder.has(request.order_id)) returnByOrder.set(request.order_id, request.status);
          const activityByOrder = new Map();
          for (const activity of activityResult.data || []) {
            const entries = activityByOrder.get(activity.order_id) || [];
            entries.push(activity);
            activityByOrder.set(activity.order_id, entries);
          }
          for (const order of orders) {
            order.returnStatus = returnByOrder.get(order.id) || null;
            order.returnEligibility = order.returnStatus ? 'active' : returnEligibilityForSupport(order, activityByOrder.get(order.id) || []);
          }
        }
        const orderCards = orders.map(orderCard);
        cards.push(...orderCards);
        grounding.order = orderCards.length ? 'available' : 'empty';
        context.push(orderCards.length
          ? `<DATA type="customer_orders">${JSON.stringify(orderCards.map(({ id: _id, image: _image, href: _href, deliveryNotes: _deliveryNotes, ...safe }) => safe))}</DATA>`
          : 'No orders were found for the authenticated customer.');
      })().catch(error => errors.push(error.message)));
    }
  }

  if (intents.includes('product')) {
    grounding.product = 'unavailable';
    jobs.push((async () => {
      const { data, error } = await supabase.from('products')
        .select('id,name,description,category,materials,price,image,stock')
        .eq('status', 'active').limit(50);
      if (error) throw new Error('products_unavailable');
      const productCards = rankProducts(data, message).map(productCard);
      cards.push(...productCards);
      grounding.product = productCards.length ? 'available' : 'empty';
      context.push(productCards.length
        ? `<DATA type="catalog_products">${JSON.stringify(productCards.map(({ image: _image, href: _href, ...safe }) => safe))}</DATA>`
        : 'No matching active products were found.');
      actions.push({ id: 'browse-gallery', label: 'Browse all pottery', href: '/gallery' });
      suggestions.push('Show me another pottery style', 'Which materials are available?');
    })().catch(error => errors.push(error.message)));
  }

  if (intents.includes('shop')) {
    grounding.shop = 'unavailable';
    jobs.push((async () => {
      const { data, error } = await supabase.from('shops').select('id,name,description,location').limit(10);
      if (error) throw new Error('shops_unavailable');
      const terms = productSearchTerms(message);
      const ranked = [...(data || [])].sort((a, b) => {
        const score = shop => terms.reduce((sum, term) => sum + ([shop.name, shop.location, shop.description].join(' ').toLowerCase().includes(term) ? 1 : 0), 0);
        return score(b) - score(a);
      }).slice(0, 5).map(shopCard);
      cards.push(...ranked);
      grounding.shop = ranked.length ? 'available' : 'empty';
      context.push(ranked.length
        ? `<DATA type="artisan_shops">${JSON.stringify(ranked.map(({ href: _href, ...safe }) => safe))}</DATA>`
        : 'No artisan shops were found.');
      actions.push({ id: 'browse-shops', label: 'Browse all shops', href: '/shops' });
    })().catch(error => errors.push(error.message)));
  }

  await Promise.all(jobs);
  if (intents.includes('general')) {
    context.push('LikhAI provides first-party support for LikhArtisan products, shops, orders, checkout, delivery, returns, accounts, and the Freeform Designer.');
    actions.push(...GENERAL_ACTIONS);
    suggestions.push('Browse pottery', 'How does Freeform work?', 'What payment methods are accepted?');
  }

  const uniqueActions = [...new Map(actions.filter(action => isAllowedActionHref(action.href)).map(action => [action.id, action])).values()].slice(0, 3);
  const uniqueSuggestions = [...new Set(suggestions)].slice(0, 3);
  return {
    context: context.join('\n\n'), cards, actions: uniqueActions, suggestions: uniqueSuggestions,
    requiresAuth, groundingStatus: errors.length ? (context.length ? 'partial' : 'unavailable') : 'grounded', errors, grounding,
  };
}

const STATIC_FALLBACKS = Object.freeze({
  shipping: {
    en: 'Verified LikhArtisan info: delivery is handled through local pickup or courier delivery. Pickup has no delivery fee, while courier fees and timing depend on the destination and artisan order. Check My Purchases or message the seller for order-specific delivery details.',
    fil: 'Verified LikhArtisan info: puwedeng local pickup o courier delivery. Walang delivery fee ang pickup; ang courier fee at timing ay depende sa destination at artisan order. Tingnan ang My Purchases o i-message ang seller para sa detalye ng order.',
  },
  checkout: {
    en: 'Verified LikhArtisan info: checkout supports GCash, Maya, QR Ph, and cards through PayMongo. Payment has to be verified by LikhArtisan before the order is treated as paid. Start or resume checkout from your cart or purchase record.',
    fil: 'Verified LikhArtisan info: tumatanggap ang checkout ng GCash, Maya, QR Ph, at cards through PayMongo. Kailangang ma-verify muna ang payment bago ituring na paid ang order. Simulan o ituloy ang checkout mula sa cart o purchase record.',
  },
  returns: {
    en: 'Verified LikhArtisan info: returns, refunds, exchanges, and cancellations are reviewed per order. I cannot change an order, but you can open the purchase and message the seller through LikhArtisan Messages.',
    fil: 'Verified LikhArtisan info: nire-review ang returns, refunds, exchanges, at cancellations per order. Hindi ako makakapagbago ng order, pero puwede mong buksan ang purchase at i-message ang seller sa LikhArtisan Messages.',
  },
  freeform: {
    en: 'Verified LikhArtisan info: Freeform lets you customize a 3D pottery design, including shape, curvature, finish, color, patterns, effects, and supported attachments. I cannot edit or submit it for you, but you can open Freeform and send the saved snapshot to an artisan for a quote.',
    fil: 'Verified LikhArtisan info: sa Freeform, puwede kang mag-customize ng 3D pottery design gaya ng shape, curvature, finish, color, patterns, effects, at supported attachments. Hindi ko ito mae-edit o maisu-submit para sa iyo, pero puwede mong buksan ang Freeform at ipadala ang saved snapshot sa artisan for quote.',
  },
  account: {
    en: 'Verified LikhArtisan info: use the dashboard to manage your profile and review purchases. Sign-in, password recovery, and account creation each use the dedicated account pages.',
    fil: 'Verified LikhArtisan info: gamitin ang dashboard para sa profile at purchases. May hiwalay na pages para sa sign-in, password recovery, at account creation.',
  },
  general: {
    en: 'Verified LikhArtisan info: I can help with pottery products, artisan shops, orders, checkout, delivery, returns, accounts, and the Freeform Designer. Choose a suggested action or ask a more specific question.',
    fil: 'Verified LikhArtisan info: makakatulong ako tungkol sa pottery products, artisan shops, orders, checkout, delivery, returns, accounts, at Freeform Designer. Pumili ng action o magtanong nang mas specific.',
  },
});

function usesFilipino(message) {
  return /\b(ako|aking|ko|po|ba|paano|nasaan|magkano|gusto|hanap|bayad|order ko|tulong|kansela)\b/i.test(message);
}

function uniqueSupportItems(items, key) {
  return [...new Map(items.filter(Boolean).map(item => [item[key], item])).values()].slice(0, 3);
}

export function buildSupportExperience(primary, supportGoal, message, grounded) {
  const filipino = usesFilipino(message);
  const latestOrder = grounded.cards.find(card => card.type === 'order');
  const action = (id, label, href) => ({ id, label, href });
  if (grounded.requiresAuth) return {
    resolution: { state: 'sign_in', label: filipino ? 'Mag-sign in para makita ang order details.' : 'Sign in to view your order details.' },
    actions: [SIGN_IN_ACTION], suggestions: [filipino ? 'Paano mag-sign in?' : 'How do I sign in?'],
  };
  if (supportGoal === 'clarify') return {
    resolution: { state: 'clarify', label: filipino ? 'Sabihin kung order, delivery, payment, return, o account ang kailangan mo.' : 'Tell me whether you need help with an order, delivery, payment, return, or account.' },
    actions: [], suggestions: ['Track my order', 'Payment help', 'Returns and refunds'],
  };
  if (supportGoal === 'account_recovery') return {
    resolution: { state: 'action_needed', label: filipino ? 'I-reset ang password sa account page.' : 'Reset your password from the account page.' },
    actions: [action('reset-password', filipino ? 'I-reset ang password' : 'Reset password', '/forgot-password')],
    suggestions: [filipino ? 'Saan ang dashboard ko?' : 'Where is my dashboard?'],
  };
  if (supportGoal === 'contact_seller') {
    const href = latestOrder ? `/chat?order=${encodeURIComponent(latestOrder.id)}` : '/chat';
    return {
      resolution: { state: 'action_needed', label: filipino ? 'I-message ang seller para sa order-specific na tulong.' : 'Message the seller for order-specific help.' },
      actions: [action('contact-seller', filipino ? 'I-message ang seller' : 'Contact seller', href)],
      suggestions: latestOrder ? [filipino ? 'I-track ang order na ito' : 'Track this order'] : ['Track my order'],
    };
  }
  if (latestOrder) {
    const openOrder = action('open-order', filipino ? 'Buksan ang order' : 'Open order', latestOrder.href);
    if (supportGoal === 'payment_status') return {
      resolution: { state: 'action_needed', label: latestOrder.status === 'to-pay'
        ? (filipino ? 'Pending pa ang payment ng pinakabagong order.' : 'Your newest order is still waiting for payment.')
        : (filipino ? 'Na-check ang payment status ng pinakabagong order.' : 'Payment status found for your newest order.') },
      actions: [latestOrder.status === 'to-pay' ? action('resume-payment', filipino ? 'Ituloy ang payment' : 'Resume payment', latestOrder.href) : openOrder],
      suggestions: [filipino ? 'I-track ang order na ito' : 'Track this order'],
    };
    if (supportGoal === 'cancel_order') return {
      resolution: { state: 'action_needed', label: latestOrder.cancellationEligible
        ? (filipino ? 'Puwede mong tingnan ang cancellation option ng order na ito.' : 'You can review the cancellation option for this order.')
        : (filipino ? 'Hindi na available ang cancellation para sa status na ito.' : 'Cancellation is not available for this order status.') },
      actions: [openOrder, action('contact-seller', filipino ? 'I-message ang seller' : 'Contact seller', `/chat?order=${encodeURIComponent(latestOrder.id)}`)],
      suggestions: [filipino ? 'Ano ang return options ko?' : 'What are my return options?'],
    };
    if (supportGoal === 'return_status') {
      const label = latestOrder.returnStatus
        ? (filipino ? `May ${latestOrder.returnStatus.replaceAll('_', ' ')} return request ang order na ito.` : `This order has a ${latestOrder.returnStatus.replaceAll('_', ' ')} return request.`)
        : latestOrder.returnEligibility === 'eligible'
          ? (filipino ? 'Puwede mong tingnan ang return options ng order na ito.' : 'You can review return options for this order.')
          : (filipino ? 'Buksan ang order para makita ang available na return options.' : 'Open the order to review the available return options.');
      return { resolution: { state: 'action_needed', label }, actions: [action('view-return', filipino ? 'Tingnan ang return options' : 'View return options', latestOrder.href)], suggestions: [filipino ? 'I-message ang seller' : 'Contact the seller'] };
    }
    if (supportGoal === 'delivery_details' || supportGoal === 'order_status') return {
      resolution: { state: 'resolved', label: latestOrder.trackingNumber
        ? (filipino ? 'May verified tracking detail ang order na ito.' : 'Verified tracking details are available for this order.')
        : (filipino ? 'Tingnan ang buong order para sa latest delivery updates.' : 'Open the order for the latest delivery updates.') },
      actions: [openOrder, action('contact-seller', filipino ? 'I-message ang seller' : 'Contact seller', `/chat?order=${encodeURIComponent(latestOrder.id)}`)],
      suggestions: [filipino ? 'Kailan darating ang order ko?' : 'When will my order arrive?'],
    };
  }
  return {
    resolution: { state: grounded.groundingStatus === 'unavailable' ? 'unavailable' : 'resolved', label: filipino ? 'Narito ang verified na impormasyon at susunod na hakbang.' : 'Here is the verified information and the best next step.' },
    actions: [], suggestions: [],
  };
}

export function fallbackReply(primary, requiresAuth, message, cards = [], grounding = {}, supportGoal = detectSupportGoal(message, primary)) {
  const filipino = usesFilipino(message);
  if (supportGoal === 'clarify') return filipino
    ? 'Matutulungan kita sa order, delivery, payment, return, o account. Ano ang gusto mong ayusin?'
    : 'I can help with an order, delivery, payment, return, or account. What would you like to sort out?';
  if (requiresAuth) return filipino
    ? 'Mag-sign in muna para ligtas kong makita ang iyong order details. Hindi ako gumagamit ng ID na ipinapadala lang ng browser.'
    : 'Please sign in so I can securely look up your order details.';

  const matchingCards = cards.filter(card => card.type === primary);
  const orderCards = cards.filter(card => card.type === 'order');
  const relevantOrder = orderCards[0];
  if (['payment_status', 'cancel_order', 'return_status', 'delivery_details'].includes(supportGoal) && relevantOrder) {
    const status = ORDER_STATUS_LABELS[relevantOrder.status] || ORDER_STATUS_LABELS.pending;
    if (supportGoal === 'payment_status') return relevantOrder.status === 'to-pay'
      ? (filipino ? `Pending pa ang payment ng order #${relevantOrder.shortId}. Buksan ang order para ituloy ang payment.` : `Payment for order #${relevantOrder.shortId} is still pending. Open the order to resume payment.`)
      : (filipino ? `Na-check ang payment status ng order #${relevantOrder.shortId}. Buksan ang order para sa buong detalye.` : `I found the payment status for order #${relevantOrder.shortId}. Open the order for the full details.`);
    if (supportGoal === 'cancel_order') return relevantOrder.cancellationEligible
      ? (filipino ? `Puwede mong tingnan ang cancellation option ng order #${relevantOrder.shortId}. Buksan ang order para magpatuloy.` : `You can review the cancellation option for order #${relevantOrder.shortId}. Open the order to continue.`)
      : (filipino ? `Hindi na available ang cancellation para sa current status ng order #${relevantOrder.shortId}. Maaari mong i-message ang seller para sa tulong.` : `Cancellation is no longer available for the current status of order #${relevantOrder.shortId}. Contact the seller for help.`);
    if (supportGoal === 'return_status') return relevantOrder.returnStatus
      ? (filipino ? `Ang return request para sa order #${relevantOrder.shortId} ay ${relevantOrder.returnStatus.replaceAll('_', ' ')}. Buksan ang order para sa updates.` : `The return request for order #${relevantOrder.shortId} is ${relevantOrder.returnStatus.replaceAll('_', ' ')}. Open the order for updates.`)
      : (filipino ? `Buksan ang order #${relevantOrder.shortId} para makita ang return options at eligibility.` : `Open order #${relevantOrder.shortId} to review its return options and eligibility.`);
    if (supportGoal === 'delivery_details' && relevantOrder.trackingNumber) return filipino
      ? `Ang order #${relevantOrder.shortId} ay ${status}. Tracking number: ${relevantOrder.trackingNumber}${relevantOrder.deliveryProvider ? ` via ${relevantOrder.deliveryProvider}` : ''}. Buksan ang order para sa latest delivery details.`
      : `Order #${relevantOrder.shortId} is ${status}. Tracking number: ${relevantOrder.trackingNumber}${relevantOrder.deliveryProvider ? ` via ${relevantOrder.deliveryProvider}` : ''}. Open the order for the latest delivery details.`;
  }
  if (primary === 'order') {
    if (grounding.order === 'unavailable') return filipino
      ? 'Verified fallback: hindi ko ma-check ang live order data ngayon, kaya hindi ako mag-a-assume ng status. Buksan ang My Purchases para sa pinakabagong order details o subukan ulit mamaya.'
      : 'Verified fallback: I could not check live order data right now, so I will not guess your status. Open My Purchases for the latest order details or try again shortly.';
    const latest = matchingCards[0];
    if (latest) {
      const status = ORDER_STATUS_LABELS[latest.status] || ORDER_STATUS_LABELS.pending;
      if (supportGoal === 'payment_status') return latest.status === 'to-pay'
        ? (filipino ? `Pending pa ang payment ng order #${latest.shortId}. Buksan ang order para ituloy ang payment.` : `Payment for order #${latest.shortId} is still pending. Open the order to resume payment.`)
        : (filipino ? `Na-check ang payment status ng order #${latest.shortId}. Buksan ang order para sa buong detalye.` : `I found the payment status for order #${latest.shortId}. Open the order for the full details.`);
      if (supportGoal === 'cancel_order') return latest.cancellationEligible
        ? (filipino ? `Puwede mong tingnan ang cancellation option ng order #${latest.shortId}. Buksan ang order para magpatuloy.` : `You can review the cancellation option for order #${latest.shortId}. Open the order to continue.`)
        : (filipino ? `Hindi na available ang cancellation para sa current status ng order #${latest.shortId}. Maaari mong i-message ang seller para sa tulong.` : `Cancellation is no longer available for the current status of order #${latest.shortId}. Contact the seller for help.`);
      if (supportGoal === 'return_status') {
        if (latest.returnStatus) return filipino
          ? `Ang return request para sa order #${latest.shortId} ay ${latest.returnStatus.replaceAll('_', ' ')}. Buksan ang order para sa updates.`
          : `The return request for order #${latest.shortId} is ${latest.returnStatus.replaceAll('_', ' ')}. Open the order for updates.`;
        return filipino
          ? `Buksan ang order #${latest.shortId} para makita ang return options at eligibility.`
          : `Open order #${latest.shortId} to review its return options and eligibility.`;
      }
      if (supportGoal === 'delivery_details' && latest.trackingNumber) return filipino
        ? `Ang order #${latest.shortId} ay ${status}. Tracking number: ${latest.trackingNumber}${latest.deliveryProvider ? ` via ${latest.deliveryProvider}` : ''}. Buksan ang order para sa latest delivery details.`
        : `Order #${latest.shortId} is ${status}. Tracking number: ${latest.trackingNumber}${latest.deliveryProvider ? ` via ${latest.deliveryProvider}` : ''}. Open the order for the latest delivery details.`;
      return filipino
        ? `May nahanap akong ${matchingCards.length} verified order${matchingCards.length === 1 ? '' : 's'}. Ang pinakabago, order #${latest.shortId}, ay ${status}. Buksan ang order card para sa buong detalye.`
        : `I found ${matchingCards.length} verified order${matchingCards.length === 1 ? '' : 's'}. Your newest order, #${latest.shortId}, is ${status}. Open the order card for the full details.`;
    }
    return filipino
      ? 'Wala akong nakitang verified order sa account na ito. Maaari mong tingnan ang My Purchases para sa pinakabagong detalye.'
      : 'I could not find a verified order for this account. Check My Purchases for the latest details.';
  }

  if (primary === 'product' && grounding.product === 'unavailable') return filipino
    ? 'Verified fallback: hindi ko ma-check ang live catalog ngayon, kaya hindi ako mag-a-assume ng availability o presyo. I-browse ang gallery o subukan ulit mamaya.'
    : 'Verified fallback: I could not check the live catalog right now, so I will not guess availability or prices. Browse the gallery or try again shortly.';

  if (primary === 'shop' && grounding.shop === 'unavailable') return filipino
    ? 'Verified fallback: hindi ko ma-check ang live shop list ngayon. Maaari mong buksan ang Shops page para mag-explore ng artisans o subukan ulit mamaya.'
    : 'Verified fallback: I could not check the live shop list right now. Open the Shops page to explore artisans or try again shortly.';

  const replies = {
    product: matchingCards.length
      ? (filipino
        ? `May nahanap akong ${matchingCards.length} verified matching product${matchingCards.length === 1 ? '' : 's'}. Tingnan ang product cards para sa latest details.`
        : `I found ${matchingCards.length} verified matching product${matchingCards.length === 1 ? '' : 's'}. Review the product cards for the latest details.`)
      : (filipino
        ? 'Wala akong nakitang verified matching product. Subukang palawakin ang search o i-browse ang lahat ng pottery.'
        : 'I could not find a verified matching product. Try broadening your search or browse all pottery.'),
    shop: matchingCards.length
      ? (filipino
        ? `May nahanap akong ${matchingCards.length} verified artisan shop${matchingCards.length === 1 ? '' : 's'}. Tingnan ang shop cards para sa latest details.`
        : `I found ${matchingCards.length} verified artisan shop${matchingCards.length === 1 ? '' : 's'}. Review the shop cards for the latest details.`)
      : (filipino
        ? 'Wala akong nakitang verified artisan shop para sa request na iyon. I-browse ang lahat ng shops para makakita pa ng makers.'
        : 'I could not find a verified artisan shop for that request. Browse all shops to explore more makers.'),
  };
  if (replies[primary]) return replies[primary];

  const staticReply = STATIC_FALLBACKS[primary] || STATIC_FALLBACKS.general;
  return filipino ? staticReply.fil : staticReply.en;
}

function logLikhAIResponse({
  responseId,
  intent,
  generationStatus,
  providerErrorCode,
  model,
  groundingStatus,
  attemptCount,
  latencyMs,
  authResult,
  authRetryCount,
}) {
  console.info(JSON.stringify({
    event: 'likhai_response',
    responseId,
    intent,
    generationStatus,
    providerErrorCode,
    model,
    groundingStatus,
    attemptCount,
    latencyMs,
    authResult,
    authRetryCount,
  }));
}

async function recordMetric(metric) {
  const { error } = await supabase.from('likhai_response_metrics').insert(metric);
  if (error) console.warn('LikhAI metric write failed:', error.code || 'database_error');
}

export async function handleChat(req, res) {
  const responseId = crypto.randomUUID();
  const startedAt = Date.now();
  const authRetryCount = req.headers?.['x-likhai-auth-retry'] === '1' ? 1 : 0;
  let authResult = 'not_checked';
  let metric = null;
  try {
    const { message, history = [] } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    if (message.length > 1000) return res.status(400).json({ error: 'Message must be 1000 characters or fewer' });

    const authentication = await optionalAuthenticatedUser(req);
    const user = authentication.user;
    authResult = authentication.authResult;
    const sanitized = xss(message.trim());
    const { primary, all } = detectIntent(sanitized);
    const grounded = await buildContext(all, sanitized, user);
    const supportGoal = detectSupportGoal(sanitized, primary);
    const support = buildSupportExperience(primary, supportGoal, sanitized, grounded);
    const actions = uniqueSupportItems([...support.actions, ...grounded.actions], 'id');
    const suggestions = [...new Set([...support.suggestions, ...grounded.suggestions])].slice(0, 3);
    const messages = normalizeHistory(history, sanitized);
    let generated;
    let generationStatus = 'generated';
    let errorCode = grounded.errors[0] || null;
    let providerErrorCode = null;
    try {
      generated = await chatWithGroq(
        messages,
        `${grounded.context}\n\n<SUPPORT_GOAL>${supportGoal}</SUPPORT_GOAL>`,
      );
    } catch (error) {
      errorCode = error.code || 'provider_error';
      providerErrorCode = errorCode;
      generationStatus = 'fallback';
      generated = {
        reply: fallbackReply(
          primary,
          grounded.requiresAuth,
          sanitized,
          grounded.cards,
          grounded.grounding,
          supportGoal,
        ),
        model: error.model || GROQ_MODEL,
        latencyMs: Date.now() - startedAt,
        attemptCount: error.attemptCount || 0,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    const latencyMs = Date.now() - startedAt;
    metric = {
      response_id: responseId, intent: primary, authenticated: Boolean(user), model: generated.model,
      latency_ms: latencyMs, provider_latency_ms: generated.latencyMs,
      input_tokens: generated.usage.inputTokens, output_tokens: generated.usage.outputTokens,
      grounding_status: grounded.groundingStatus, card_types: [...new Set(grounded.cards.map(card => card.type))],
      action_ids: actions.map(action => action.id), error_code: errorCode,
    };
    await recordMetric(metric);
    logLikhAIResponse({
      responseId,
      intent: primary,
      generationStatus,
      providerErrorCode,
      model: generated.model,
      groundingStatus: grounded.groundingStatus,
      attemptCount: generated.attemptCount || 0,
      latencyMs,
      authResult,
      authRetryCount,
    });

    const payload = {
      responseId, reply: generated.reply, intent: primary, groundingStatus: grounded.groundingStatus,
      generationStatus,
      cards: grounded.cards, actions, suggestions, resolution: support.resolution,
      requiresAuth: grounded.requiresAuth,
    };
    if (process.env.LIKHAI_LEGACY_RESPONSE_CONTRACT === 'true') {
      payload.orders = grounded.cards.filter(card => card.type === 'order');
      payload.products = grounded.cards.filter(card => card.type === 'product');
    }
    return res.json(payload);
  } catch (error) {
    const status = error.status || 500;
    if (error.authResult) authResult = error.authResult;
    if (status === 401 || (status === 503 && ['AUTH_VERIFICATION_UNAVAILABLE', 'AUTH_CONFIGURATION_INVALID'].includes(error.code))) {
      logLikhAIResponse({
        responseId,
        intent: 'not_detected',
        generationStatus: 'not_started',
        providerErrorCode: null,
        model: null,
        groundingStatus: 'not_started',
        attemptCount: 0,
        latencyMs: Date.now() - startedAt,
        authResult,
        authRetryCount,
      });
    }
    if (status >= 500 && !['AUTH_VERIFICATION_UNAVAILABLE', 'AUTH_CONFIGURATION_INVALID'].includes(error.code)) {
      console.error('Chatbot request failed:', error.message);
    }
    if (status === 401) return res.status(401).json({
      responseId,
      code: 'AUTH_SESSION_INVALID',
      error: 'Your session is invalid or expired. Please sign in again.',
    });
    if (status === 503 && ['AUTH_VERIFICATION_UNAVAILABLE', 'AUTH_CONFIGURATION_INVALID'].includes(error.code)) return res.status(503).json({
      responseId,
      code: error.code,
      error: 'Your signed-in session could not be verified right now. Please retry in a moment.',
    });
    return res.status(status).json({ error: 'LikhAI is temporarily unavailable. Please try again later.' });
  }
}

export async function handleFeedback(req, res) {
  try {
    const { responseId, rating } = req.body || {};
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(responseId || ''))) {
      return res.status(400).json({ error: 'A valid responseId is required' });
    }
    if (!['positive', 'negative'].includes(rating)) return res.status(400).json({ error: 'Rating must be positive or negative' });
    const { data, error } = await supabase.from('likhai_response_metrics')
      .update({ rating: rating === 'positive' ? 1 : -1, rated_at: new Date().toISOString() })
      .eq('response_id', responseId).select('response_id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Response not found' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('LikhAI feedback failed:', error.code || error.message);
    return res.status(500).json({ error: 'Could not save feedback' });
  }
}
