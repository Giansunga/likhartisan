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

  try {
    for (const intent of intents) {
      if (fetchedIntents.has(intent)) continue;
      fetchedIntents.add(intent);

      switch (intent) {
        case 'order': {
          if (userId) {
            const { data: orders } = await supabase
              .from('orders')
              .select('id, status, delivery_status, total, created_at, items')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(5);

            if (orders && orders.length > 0) {
              const orderList = orders.map(o =>
                `Order ${o.id.slice(0, 8)}... | Status: ${o.status} | Delivery: ${o.delivery_status || 'pending'} | Total: ₱${o.total} | Date: ${new Date(o.created_at).toLocaleDateString()}`
              ).join('\n');
              parts.push(`Recent orders for this customer:\n${orderList}`);
            } else {
              parts.push('No orders found for this customer.');
            }
          } else {
            parts.push('Customer is not logged in. Ask them to sign in to view their orders.');
          }
          break;
        }

        case 'product': {
          const { data: products } = await supabase
            .from('products')
            .select('id, name, category, material, price')
            .eq('status', 'active')
            .limit(10);

          if (products && products.length > 0) {
            const productList = products.map(p =>
              `${p.name} | Category: ${p.category} | Material: ${p.material || 'N/A'} | Price: ₱${p.price}`
            ).join('\n');
            parts.push(`Available products:\n${productList}`);
          }
          break;
        }

        case 'shop': {
          const { data: shops } = await supabase
            .from('shops')
            .select('id, name, description, location')
            .limit(5);

          if (shops && shops.length > 0) {
            const shopList = shops.map(s =>
              `${s.name} | Location: ${s.location || 'N/A'} | ${s.description || ''}`
            ).join('\n');
            parts.push(`Shops on LikhArtisan:\n${shopList}`);
          }
          break;
        }

        case 'shipping': {
          parts.push('Shipping options: Local pickup (free) or delivery via courier. Delivery fees vary by location. Contact the shop for exact shipping quotes.');
          break;
        }

        case 'checkout': {
          parts.push('LikhArtisan supports GCash, Maya, QR Ph, and Card payments via PayMongo. Complete checkout from your cart page.');
          break;
        }

        case 'returns': {
          parts.push('Returns and refunds are handled on a case-by-case basis. Contact the artisan shop directly through the messaging system to discuss any issues with your order.');
          break;
        }

        case 'freeform': {
          parts.push('The Freeform Designer lets you customize pottery in 3D — choose a model, adjust shape, select material/color, add text engravings, and save or submit your design to a shop for creation.');
          break;
        }
      }
    }
  } catch (err) {
    console.error('Context build error:', err);
  }

  return parts.join('\n\n');
}

export async function handleChat(req, res) {
  try {
    const { message, history = [], userId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const sanitized = xss(message.trim().slice(0, 1000));
    const { primary, all } = detectIntent(sanitized);
    const context = await buildContext(all, sanitized, userId);

    const messages = [
      ...history.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: xss(String(m.content || '').slice(0, 1000)),
      })),
      { role: 'user', content: sanitized },
    ];

    const reply = await chatWithGroq(messages, context);

    res.json({ reply, intent: primary });
  } catch (err) {
    console.error('Chatbot error:', err);
    res.status(500).json({
      error: 'Sorry, LikhAI is temporarily unavailable. Please try again later.',
      reply: 'I apologize, but I am experiencing technical difficulties. Please try again in a moment or contact support directly.',
    });
  }
}
