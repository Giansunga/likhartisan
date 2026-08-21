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
  return { primary: all[0] || 'general', all: all.length ? all : ['general'] };
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

async function optionalAuthenticatedUser(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  if (!header.startsWith('Bearer ') || header.length <= 7) {
    const error = new Error('Invalid authorization header');
    error.status = 401;
    throw error;
  }
  const { data: { user }, error } = await supabase.auth.getUser(header.slice(7));
  if (error || !user) {
    const authError = new Error('Invalid or expired token');
    authError.status = 401;
    throw authError;
  }
  return user;
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

async function buildContext(intents, message, user) {
  const context = [];
  const cards = [];
  const actions = [];
  const suggestions = [];
  const errors = [];
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
      context.push('The customer is not authenticated. Do not provide order information; ask them to sign in.');
      actions.unshift(SIGN_IN_ACTION);
    } else {
      actions.push({ id: 'view-purchases', label: 'View my purchases', href: '/dashboard?tab=purchases' });
      jobs.push((async () => {
        const { data, error } = await supabase.from('orders')
          .select('id,status,payment_status,delivery_status,total,created_at,items')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(5);
        if (error) throw new Error('orders_unavailable');
        const orderCards = (data || []).map(orderCard);
        cards.push(...orderCards);
        context.push(orderCards.length
          ? `<DATA type="customer_orders">${JSON.stringify(orderCards.map(({ id: _id, image: _image, href: _href, ...safe }) => safe))}</DATA>`
          : 'No orders were found for the authenticated customer.');
      })().catch(error => errors.push(error.message)));
    }
  }

  if (intents.includes('product')) {
    jobs.push((async () => {
      const { data, error } = await supabase.from('products')
        .select('id,name,description,category,materials,price,image,stock')
        .eq('status', 'active').limit(50);
      if (error) throw new Error('products_unavailable');
      const productCards = rankProducts(data, message).map(productCard);
      cards.push(...productCards);
      context.push(productCards.length
        ? `<DATA type="catalog_products">${JSON.stringify(productCards.map(({ image: _image, href: _href, ...safe }) => safe))}</DATA>`
        : 'No matching active products were found.');
      actions.push({ id: 'browse-gallery', label: 'Browse all pottery', href: '/gallery' });
      suggestions.push('Show me another pottery style', 'Which materials are available?');
    })().catch(error => errors.push(error.message)));
  }

  if (intents.includes('shop')) {
    jobs.push((async () => {
      const { data, error } = await supabase.from('shops').select('id,name,description,location').limit(10);
      if (error) throw new Error('shops_unavailable');
      const terms = productSearchTerms(message);
      const ranked = [...(data || [])].sort((a, b) => {
        const score = shop => terms.reduce((sum, term) => sum + ([shop.name, shop.location, shop.description].join(' ').toLowerCase().includes(term) ? 1 : 0), 0);
        return score(b) - score(a);
      }).slice(0, 5).map(shopCard);
      cards.push(...ranked);
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
    requiresAuth, groundingStatus: errors.length ? (context.length ? 'partial' : 'unavailable') : 'grounded', errors,
  };
}

export function fallbackReply(primary, requiresAuth, message, cards = []) {
  const filipino = /\b(ako|aking|ko|po|ba|paano|nasaan|magkano|gusto|hanap|bayad|order ko)\b/i.test(message);
  if (requiresAuth) return filipino
    ? 'Mag-sign in muna para ligtas kong makita ang iyong order details. Hindi ako gumagamit ng ID na ipinapadala lang ng browser.'
    : 'Please sign in so I can securely look up your order details.';

  const matchingCards = cards.filter(card => card.type === primary);
  if (primary === 'order') {
    const latest = matchingCards[0];
    if (latest) {
      const status = ORDER_STATUS_LABELS[latest.status] || ORDER_STATUS_LABELS.pending;
      return filipino
        ? `May nahanap akong ${matchingCards.length} verified order${matchingCards.length === 1 ? '' : 's'}. Ang pinakabago, order #${latest.shortId}, ay ${status}. Buksan ang order card para sa buong detalye.`
        : `I found ${matchingCards.length} verified order${matchingCards.length === 1 ? '' : 's'}. Your newest order, #${latest.shortId}, is ${status}. Open the order card for the full details.`;
    }
    return filipino
      ? 'Wala akong nakitang verified order sa account na ito. Maaari mong tingnan ang My Purchases para sa pinakabagong detalye.'
      : 'I could not find a verified order for this account. Check My Purchases for the latest details.';
  }

  const replies = {
    product: matchingCards.length
      ? `I found ${matchingCards.length} verified matching product${matchingCards.length === 1 ? '' : 's'}. Review the product cards for the latest details.`
      : 'I could not find a verified matching product. Try broadening your search or browse all pottery.',
    shop: matchingCards.length
      ? `I found ${matchingCards.length} verified artisan shop${matchingCards.length === 1 ? '' : 's'}. Review the shop cards for the latest details.`
      : 'I could not find a verified artisan shop for that request. Browse all shops to explore more makers.',
  };
  return replies[primary] || 'LikhAI is temporarily unable to write a full reply. Please try again shortly.';
}

async function recordMetric(metric) {
  const { error } = await supabase.from('likhai_response_metrics').insert(metric);
  if (error) console.warn('LikhAI metric write failed:', error.code || 'database_error');
}

export async function handleChat(req, res) {
  const responseId = crypto.randomUUID();
  const startedAt = Date.now();
  let metric = null;
  try {
    const { message, history = [] } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    if (message.length > 1000) return res.status(400).json({ error: 'Message must be 1000 characters or fewer' });

    const user = await optionalAuthenticatedUser(req);
    const sanitized = xss(message.trim());
    const { primary, all } = detectIntent(sanitized);
    const grounded = await buildContext(all, sanitized, user);
    const messages = normalizeHistory(history, sanitized);
    let generated;
    let generationStatus = 'generated';
    let errorCode = grounded.errors[0] || null;
    try {
      generated = await chatWithGroq(messages, grounded.context);
    } catch (error) {
      errorCode = error.code || 'provider_error';
      generationStatus = 'fallback';
      generated = { reply: fallbackReply(primary, grounded.requiresAuth, sanitized, grounded.cards), model: GROQ_MODEL, latencyMs: Date.now() - startedAt, usage: { inputTokens: 0, outputTokens: 0 } };
    }

    metric = {
      response_id: responseId, intent: primary, authenticated: Boolean(user), model: generated.model,
      latency_ms: Date.now() - startedAt, provider_latency_ms: generated.latencyMs,
      input_tokens: generated.usage.inputTokens, output_tokens: generated.usage.outputTokens,
      grounding_status: grounded.groundingStatus, card_types: [...new Set(grounded.cards.map(card => card.type))],
      action_ids: grounded.actions.map(action => action.id), error_code: errorCode,
    };
    await recordMetric(metric);

    const payload = {
      responseId, reply: generated.reply, intent: primary, groundingStatus: grounded.groundingStatus,
      generationStatus,
      cards: grounded.cards, actions: grounded.actions, suggestions: grounded.suggestions,
      requiresAuth: grounded.requiresAuth,
    };
    if (process.env.LIKHAI_LEGACY_RESPONSE_CONTRACT === 'true') {
      payload.orders = grounded.cards.filter(card => card.type === 'order');
      payload.products = grounded.cards.filter(card => card.type === 'product');
    }
    return res.json(payload);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Chatbot request failed:', error.message);
    if (status === 401) return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
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
