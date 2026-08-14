export const LIKHAI_KNOWLEDGE = Object.freeze({
  shipping: {
    context: 'Delivery options are local pickup or courier delivery. Pickup has no delivery fee. Courier fees and timing depend on the destination and the artisan order. Customers can review delivery details in My Purchases or contact the seller in Messages.',
    actions: [
      { id: 'view-purchases', label: 'View my purchases', href: '/dashboard?tab=purchases' },
      { id: 'contact-seller', label: 'Message a seller', href: '/chat' },
    ],
    suggestions: ['Track my latest order', 'How do I contact the seller?'],
  },
  checkout: {
    context: 'Checkout supports GCash, Maya, QR Ph, and cards through PayMongo. Payment must be verified by LikhArtisan before an order is treated as paid. Customers should start or resume checkout from their cart or purchase record.',
    actions: [
      { id: 'open-cart', label: 'Open cart', href: '/cart' },
      { id: 'view-purchases', label: 'View my purchases', href: '/dashboard?tab=purchases' },
    ],
    suggestions: ['What payment methods are accepted?', 'Track my payment status'],
  },
  returns: {
    context: 'Return, refund, exchange, and cancellation concerns are reviewed for the specific order. LikhAI cannot change an order. The customer should open the purchase and contact the seller through LikhArtisan Messages.',
    actions: [
      { id: 'view-purchases', label: 'View my purchases', href: '/dashboard?tab=purchases' },
      { id: 'contact-seller', label: 'Contact the seller', href: '/chat' },
    ],
    suggestions: ['Show my recent orders', 'How do I message the seller?'],
  },
  freeform: {
    context: 'The Freeform Designer is a 3D pottery customization tool. A buyer can choose a model, adjust shape dimensions and curvature, select a finish and color, apply available patterns and effects, add supported attachments, save the design, and submit the current design snapshot to an artisan for a quote. LikhAI cannot edit or submit a design for the customer.',
    actions: [{ id: 'open-freeform', label: 'Open Freeform Designer', href: '/freeform' }],
    suggestions: ['How do I submit a design request?', 'What can I customize?'],
  },
  account: {
    context: 'Customers can manage their profile and review purchases from the dashboard. Sign-in, password recovery, and account creation use the dedicated account pages.',
    actions: [
      { id: 'open-dashboard', label: 'Open dashboard', href: '/dashboard' },
      { id: 'sign-in', label: 'Sign in', href: '/signin' },
    ],
    suggestions: ['How do I reset my password?', 'Where are my purchases?'],
  },
});

export const SIGN_IN_ACTION = Object.freeze({ id: 'sign-in', label: 'Sign in to view orders', href: '/signin' });

export const GENERAL_ACTIONS = Object.freeze([
  { id: 'browse-gallery', label: 'Browse pottery', href: '/gallery' },
  { id: 'browse-shops', label: 'Browse artisan shops', href: '/shops' },
  { id: 'contact-support', label: 'Talk to a seller', href: '/chat' },
]);

const ALLOWED_ACTION_PATHS = Object.freeze([
  '/', '/gallery', '/shops', '/cart', '/checkout', '/dashboard', '/signin', '/signup',
  '/forgot-password', '/chat', '/freeform', '/product/', '/shop/',
]);

export function isAllowedActionHref(href) {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return false;
  return ALLOWED_ACTION_PATHS.some(path => href === path || (path.endsWith('/') && href.startsWith(path)) || href.startsWith(`${path}?`));
}
