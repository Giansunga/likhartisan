import { chatWithGroq } from '../services/groqService.js';
import xss from 'xss';

let supabase = null;

export function initChatbotController(supabaseClient) {
  supabase = supabaseClient;
}

function detectIntent(message) {
  const lower = message.toLowerCase();
  const intents = new Set();

  // Exact phrase matches first (highest priority)
  if (/\b(my order|order.*item|what.*order|item.*order|order.*contain|order.*include)\b/.test(lower)) {
    intents.add('order');
    intents.add('product'); // "What's in my order?" needs both
  }
  if (/\b(my.*pottery|pottery.*order|clay.*order|vase.*order)\b/.test(lower)) {
    intents.add('product');
    intents.add('order');
  }
  if (/\b(ship.*order|deliver.*order|shipping.*fee.*order|how.*ship)\b/.test(lower)) {
    intents.add('shipping');
    intents.add('order');
  }
  if (/\b(return.*order|refund.*order|cancel.*order|exchange.*order)\b/.test(lower)) {
    intents.add('returns');
    intents.add('order');
  }

  // Order tracking / status
  if (/\b(track|tracking|status|where.*(is|my).*\b(order|package|delivery)|shipped|delivered|preparing)\b/.test(lower)) {
    intents.add('order');
  }

  // Product inquiry
  if (/\b(product|products|pottery|vase|bowl|jar|clay|terracotta|ceramic|glazed|matte|metallic|price|cost|how much)\b/.test(lower)) {
    intents.add('product');
  }

  // Shop / artisan
  if (/\b(shop|shops|artisan|artisans|seller|store|maker)\b/.test(lower)) {
    intents.add('shop');
  }

  // Freeform designer
  if (/\b(freeform|design|designer|customize|custom|shape|material|decor|engrav)\b/.test(lower)) {
    intents.add('freeform');
  }

  // Checkout / payment
  if (/\b(checkout|payment|pay|gcash|maya|qr ph|cart|buy|purchase)\b/.test(lower)) {
    intents.add('checkout');
  }

  // Shipping
  if (/\b(ship|shipping|deliver|delivery|pickup|fee|cost.*deliver)\b/.test(lower)) {
    intents.add('shipping');
  }

  // Returns / refunds
  if (/\b(return|refund|exchange|cancel)\b/.test(lower)) {
    intents.add('returns');
  }

  // Account
  if (/\b(account|profile|password|login|sign in|sign up|register)\b/.test(lower)) {
    intents.add('account');
  }

  const all = Array.from(intents);
  return { primary: all[0] || 'general', all };
}

async function buildContext(intents, message, userId) {
  const parts = [];
  const fetchedIntents = new Set(); // Avoid duplicate fetches
  let orders = []; // Structured order data for UI cards (when order intent + logged in)
  let products = []; // Structured product data for UI cards (when product intent)

  // Static (no DB) intents can be appended immediately in intent order.
  const staticParts = {
    shipping: 'Shipping options: Local pickup (free) or delivery via courier. Delivery fees vary by location. Contact the shop for exact shipping quotes.',
    checkout: 'LikhArtisan supports GCash, Maya, QR Ph, and Card payments via PayMongo. Complete checkout from your cart page.',
    returns: 'Returns and refunds are handled on a case-by-case basis. Contact the artisan shop directly through the messaging system to discuss any issues with your order.',
    freeform: 'The Freeform Designer lets you customize pottery in 3D — choose a model, adjust shape, select material/color, add text engravings, and save or submit your design to a shop for creation.',
  };

  // DB-backed intents: fetch concurrently, then attach by intent so the
  // final context preserves the order the intents were detected in.
  const dbFetchers = {
    order: async () => {
      if (!userId) return 'Customer is not logged in. Ask them to sign in to view their orders.';
      const { data: orderRows } = await supabase
        .from('orders')
        .select('id, status, delivery_status, total, created_at, items')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (orderRows && orderRows.length > 0) {
        // Expose structured data to the UI for order cards.
        orders = orderRows.map(o => ({
          id: o.id,
          shortId: o.id.slice(0, 8),
          status: o.status,
          deliveryStatus: o.delivery_status || 'pending',
          total: o.total,
          createdAt: o.created_at,
          itemCount: Array.isArray(o.items) ? o.items.length : 0,
        }));
        const orderList = orderRows.map(o =>
          `Order ${o.id.slice(0, 8)}... | Status: ${o.status} | Delivery: ${o.delivery_status || 'pending'} | Total: ₱${o.total} | Date: ${new Date(o.created_at).toLocaleDateString()}`
        ).join('\n');
        return `Recent orders for this customer:\n${orderList}`;
      }
      return 'No orders found for this customer.';
    },
    product: async () => {
      const { data: productRows } = await supabase
        .from('products')
        .select('id, name, category, material, price, image')
        .eq('status', 'active')
        .limit(10);
      if (productRows && productRows.length > 0) {
        products = productRows.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category || '',
          material: p.material || '',
          price: p.price,
          image: p.image || '',
        }));
        const productList = productRows.map(p =>
          `${p.name} | Category: ${p.category} | Material: ${p.material || 'N/A'} | Price: ₱${p.price}`
        ).join('\n');
        return `Available products:\n${productList}`;
      }
      return '';
    },
    shop: async () => {
      const { data: shops } = await supabase
        .from('shops')
        .select('id, name, description, location')
        .limit(5);
      if (shops && shops.length > 0) {
        const shopList = shops.map(s =>
          `${s.name} | Location: ${s.location || 'N/A'} | ${s.description || ''}`
        ).join('\n');
        return `Shops on LikhArtisan:\n${shopList}`;
      }
      return '';
    },
  };

  const dbResults = {};
  const dbPromises = [];
  for (const intent of intents) {
    if (fetchedIntents.has(intent)) continue;
    fetchedIntents.add(intent);
    if (dbFetchers[intent]) {
      const p = dbFetchers[intent]().then(r => { dbResults[intent] = r; });
      dbPromises.push(p);
    }
  }
  // Run DB-backed fetches concurrently (latency win), fail-safe per intent.
  await Promise.allSettled(dbPromises);

  // Assemble in detected-intent order so the LLM context stays stable.
  for (const intent of intents) {
    if (staticParts[intent] !== undefined) parts.push(staticParts[intent]);
    else if (dbResults[intent] !== undefined && dbResults[intent] !== '') parts.push(dbResults[intent]);
  }

  return { context: parts.join('\n\n'), orders, products };
}

export async function handleChat(req, res) {
  try {
    const { message, history = [], userId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const sanitized = xss(message.trim().slice(0, 1000));
    const { primary, all } = detectIntent(sanitized);
    const { context, orders, products } = await buildContext(all, sanitized, userId);

    const messages = [
      ...history.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: xss(String(m.content || '').slice(0, 1000)),
      })),
      { role: 'user', content: sanitized },
    ];

    const reply = await chatWithGroq(messages, context);

    res.json({ reply, intent: primary, orders: orders || [], products: products || [] });
  } catch (err) {
    console.error('Chatbot error:', err);
    res.status(500).json({
      error: 'Sorry, LikhAI is temporarily unavailable. Please try again later.',
      reply: 'I apologize, but I am experiencing technical difficulties. Please try again in a moment or contact support directly.',
    });
  }
}
