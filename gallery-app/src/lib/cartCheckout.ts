import type { CartCheckoutDraft, CartItem, CartLineKey } from '../types';

export const CART_CHECKOUT_DRAFT_KEY = 'lk_cart_checkout_draft_v1';
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

export function readCartCheckoutDraft(userId: string): CartCheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(`${CART_CHECKOUT_DRAFT_KEY}:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartCheckoutDraft;
    if (parsed.ownerUserId !== userId || parsed.version !== 1 || parsed.source !== 'cart' || !Array.isArray(parsed.lineKeys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCartCheckoutDraft(userId: string, draft: CartCheckoutDraft): void {
  try { sessionStorage.setItem(`${CART_CHECKOUT_DRAFT_KEY}:${userId}`, JSON.stringify(draft)); } catch { /* unavailable storage */ }
}

export function clearCartCheckoutDraft(userId: string): void {
  try {
    sessionStorage.removeItem(`${CART_CHECKOUT_DRAFT_KEY}:${userId}`);
  } catch { /* unavailable storage */ }
}

export function savePendingPurchase(userId: string, purchaseKey: string, lineKeys: CartLineKey[]): void {
  try { localStorage.setItem(`${PURCHASE_KEYS_PREFIX}${userId}:${purchaseKey}`, JSON.stringify(lineKeys)); } catch { /* unavailable storage */ }
}

export function readPendingPurchase(userId: string, purchaseKey: string): CartLineKey[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PURCHASE_KEYS_PREFIX}${userId}:${purchaseKey}`) || '[]');
    return Array.isArray(parsed) ? parsed.filter(key => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

export function clearPendingPurchase(userId: string, purchaseKey: string): void {
  try { localStorage.removeItem(`${PURCHASE_KEYS_PREFIX}${userId}:${purchaseKey}`); } catch { /* unavailable storage */ }
}
