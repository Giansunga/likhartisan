import type { CartCheckoutDraft, CartItem, CartLineKey } from '../types';

export const CART_CHECKOUT_DRAFT_KEY = 'lk_cart_checkout_draft_v1';
export const CART_CHECKOUT_AUTH_PENDING_KEY = 'lk_cart_checkout_auth_pending';
const PURCHASE_KEYS_PREFIX = 'lk_cart_purchase_keys:';

export function getCartLineKey(item: Pick<CartItem, 'productId' | 'variationId'>): CartLineKey {
  return `${item.productId}\v${item.variationId || ''}`;
}

export function getCartShopKey(item: Pick<CartItem, 'shopId' | 'shopName'>): string {
  return item.shopId || `name:${item.shopName}`;
}

export function resolveCartDraftItems(cart: CartItem[], draft: CartCheckoutDraft | null): CartItem[] {
  if (!draft || draft.version !== 1 || draft.source !== 'cart') return [];
  const wanted = new Set(draft.lineKeys);
  return cart.filter(item => (
    getCartShopKey(item) === draft.shopId && wanted.has(getCartLineKey(item))
  ));
}

export function readCartCheckoutDraft(): CartCheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(CART_CHECKOUT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartCheckoutDraft;
    if (parsed.version !== 1 || parsed.source !== 'cart' || !Array.isArray(parsed.lineKeys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCartCheckoutDraft(draft: CartCheckoutDraft): void {
  try { sessionStorage.setItem(CART_CHECKOUT_DRAFT_KEY, JSON.stringify(draft)); } catch { /* unavailable storage */ }
}

export function clearCartCheckoutDraft(): void {
  try {
    sessionStorage.removeItem(CART_CHECKOUT_DRAFT_KEY);
    sessionStorage.removeItem(CART_CHECKOUT_AUTH_PENDING_KEY);
  } catch { /* unavailable storage */ }
}

export function markCartCheckoutAuthPending(): void {
  try { sessionStorage.setItem(CART_CHECKOUT_AUTH_PENDING_KEY, '1'); } catch { /* unavailable storage */ }
}

export function consumeCartCheckoutAuthPending(): CartCheckoutDraft | null {
  try {
    if (sessionStorage.getItem(CART_CHECKOUT_AUTH_PENDING_KEY) !== '1') return null;
    const draft = readCartCheckoutDraft();
    if (!draft) return null;
    sessionStorage.removeItem(CART_CHECKOUT_AUTH_PENDING_KEY);
    return draft;
  } catch {
    return null;
  }
}

export function savePendingPurchase(sessionId: string, lineKeys: CartLineKey[]): void {
  try { localStorage.setItem(`${PURCHASE_KEYS_PREFIX}${sessionId}`, JSON.stringify(lineKeys)); } catch { /* unavailable storage */ }
}

export function readPendingPurchase(sessionId: string): CartLineKey[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PURCHASE_KEYS_PREFIX}${sessionId}`) || '[]');
    return Array.isArray(parsed) ? parsed.filter(key => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

export function clearPendingPurchase(sessionId: string): void {
  try { localStorage.removeItem(`${PURCHASE_KEYS_PREFIX}${sessionId}`); } catch { /* unavailable storage */ }
}
