import type { CartItem, CartLineKey } from '../types';
import { getCartLineKey } from '../lib/cartCheckout';

const CART_EVENT = 'lk_cart_update';

function get<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function set<T>(key: string, val: T) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota exceeded or storage full */ }
}

// ─── Cart ───
export function getCart(userId: string | null | undefined): CartItem[] { return userId ? get<CartItem[]>(`lk_cart:${userId}`, []) : []; }
export function setCart(userId: string | null | undefined, items: CartItem[]) { if (!userId) return; set(`lk_cart:${userId}`, items); emitCartUpdate(); }
export interface AddToCartResult {
  addedQty: number;
  quantity: number;
  maximum: number | null;
}

export function addToCart(userId: string | null | undefined, item: CartItem, maximumQuantity?: number): AddToCartResult {
  if (!userId) return { addedQty: 0, quantity: 0, maximum: null };
  const cart = getCart(userId);
  const existingIndex = cart.findIndex(i => i.productId === item.productId && i.variationId === item.variationId);
  const existing = cart[existingIndex];
  const requested = Math.max(0, Math.floor(Number(item.qty) || 0));
  const maximum = Number.isFinite(maximumQuantity)
    ? Math.max(0, Math.floor(maximumQuantity as number))
    : Number.POSITIVE_INFINITY;
  const current = existing ? Math.max(0, Math.floor(Number(existing.qty) || 0)) : 0;
  const quantity = Math.min(current + requested, maximum);
  const addedQty = Math.max(0, quantity - current);

  if (addedQty === 0) {
    return { addedQty, quantity: current, maximum: Number.isFinite(maximum) ? maximum : null };
  }

  if (existing) cart.splice(existingIndex, 1);
  cart.unshift({ ...(existing ?? item), qty: quantity });
  setCart(userId, cart);
  return { addedQty, quantity, maximum: Number.isFinite(maximum) ? maximum : null };
}
export function removeFromCart(userId: string | null | undefined, productId: string, variationId?: string) {
  if (variationId) {
    setCart(userId, getCart(userId).filter(i => !(i.productId === productId && i.variationId === variationId)));
  } else {
    setCart(userId, getCart(userId).filter(i => i.productId !== productId));
  }
}
export function removeCartLines(userId: string | null | undefined, lineKeys: CartLineKey[]) {
  const keys = new Set(lineKeys);
  setCart(userId, getCart(userId).filter(item => !keys.has(getCartLineKey(item))));
}
export function clearCart(userId: string | null | undefined) { setCart(userId, []); }
export function getCartCount(userId: string | null | undefined): number { return getCart(userId).reduce((s, i) => s + i.qty, 0); }

function emitCartUpdate() {
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

export function onCartUpdate(cb: () => void) {
  window.addEventListener(CART_EVENT, cb);
  return () => window.removeEventListener(CART_EVENT, cb);
}
