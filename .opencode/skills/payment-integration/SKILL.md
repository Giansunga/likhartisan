---
name: payment-integration
description: PayMongo payment integration for LikhArtisan web and mobile
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: paymongo
---

## What I do
- Guide PayMongo checkout session creation
- Handle GCash, Maya, QR Ph, and card payments
- Implement webhook verification
- Manage order confirmation after payment

## When to use me
Use this when modifying payment flows or debugging payment issues.

## Architecture
```
Frontend → Backend (Express) → PayMongo API
                ↓
          Checkout Session
                ↓
          User pays via PayMongo
                ↓
          Webhook → Backend confirms payment
                ↓
          Order created in Supabase
```

## Backend endpoints

### Create checkout session
```js
// POST /api/create-checkout
router.post('/api/create-checkout', async (req, res) => {
  const { items, total, deliveryOption, deliveryAddress, buyerId } = req.body;

  const lineItems = items.map((item) => ({
    name: item.productName,
    amount: Math.round(item.price * 100), // Pesos to centavos
    currency: 'PHP',
    quantity: item.qty,
  }));

  const { data } = await paymongo.checkoutSessions.create({
    payment_method_types: ['gcash', 'paymaya', 'qrph'],
    line_items: lineItems,
    amount: Math.round(total * 100),
    currency: 'PHP',
    success_url: `${FRONTEND_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${FRONTEND_URL}/cart`,
    metadata: { buyerId, deliveryOption, deliveryAddress },
  });

  res.json({ checkoutUrl: data.attributes.checkout_url, sessionId: data.id });
});
```

### Confirm payment (webhook)
```js
// POST /api/webhooks/paymongo
router.post('/api/webhooks/paymongo', async (req, res) => {
  const signature = req.headers['paymongo-signature'];
  // Verify webhook signature
  const event = verifyWebhookSignature(req.body, signature);

  if (event.type === 'checkout_session.completed') {
    const session = event.data.attributes;
    // Create order in Supabase
    await createOrder(session);
  }

  res.json({ received: true });
});
```

## Frontend flow

### Web (gallery-app)
```tsx
// CheckoutPage.tsx
const handleCheckout = async () => {
  const response = await fetch(`${API_BASE}/api/create-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: cartItems,
      total: cartTotal,
      deliveryOption,
      deliveryAddress,
      buyerId: user.id,
    }),
  });
  const { checkoutUrl } = await response.json();
  window.location.href = checkoutUrl; // Redirect to PayMongo
};
```

### Mobile (mobile-app)
```tsx
// checkout.tsx
import * as WebBrowser from 'expo-web-browser';

const handleCheckout = async () => {
  const result = await apiPost<{ checkoutUrl: string; sessionId: string }>(
    '/api/create-checkout',
    { items, total, deliveryOption, deliveryAddress, buyerId: user.id }
  );
  await WebBrowser.openBrowserAsync(result.checkoutUrl);
  // On return, check session status
  router.push('/checkout-success');
};
```

## Payment methods
| Method | Code | Flow |
|---|---|---|
| GCash | `gcash` | Redirect to GCash app/web |
| Maya | `paymaya` | Redirect to Maya app/web |
| QR Ph | `qrph` | Show QR code for scanning |
| Card | `card` | Card details form |

## Amount handling
PayMongo uses **centavos** (smallest unit):
- ₱100.00 = 10000 centavos
- Always `Math.round(amount * 100)`
- Always divide by 100 when displaying from PayMongo

## Webhook verification
```js
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  return signature === digest;
}
```

## Session status check
```js
// GET /api/session/:sessionId
router.get('/api/session/:sessionId', async (req, res) => {
  const { data } = await paymongo.checkoutSessions.retrieve(req.params.sessionId);
  res.json({
    status: data.attributes.payment_status,
    amount: data.attributes.amount,
  });
});
```

## Order creation after payment
```js
async function createOrder(session) {
  const { buyerId, deliveryOption, deliveryAddress } = session.metadata;
  const items = session.attributes.line_items;

  await supabase.from('orders').insert({
    customer_id: buyerId,
    items: items.map((i) => ({
      productName: i.name,
      price: i.amount / 100,
      qty: i.quantity,
    })),
    total: session.attributes.amount / 100,
    status: 'to-ship',
    delivery_option: deliveryOption,
    delivery_address: deliveryAddress,
    checkout_session_id: session.id,
  });
}
```

## Environment variables
- `PAYMONGO_SECRET_KEY` — Server-side secret key
- `PAYMONGO_PUBLIC_KEY` — Client-side public key
- `PAYMONGO_WEBHOOK_SECRET` — Webhook signature secret

## Common issues
1. **Amount mismatch** — Always verify server-side before creating order
2. **Webhook not received** — Check ngrok/tunnel for local dev
3. **Session expired** — PayMongo sessions expire after 1 hour
4. **Currency must be PHP** — PayMongo only supports PHP for PH merchants
