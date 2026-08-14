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
export function getCart(): CartItem[] { return get<CartItem[]>('lk_cart', []); }
export function setCart(items: CartItem[]) { set('lk_cart', items); emitCartUpdate(); }
export interface AddToCartResult {
  addedQty: number;
  quantity: number;
  maximum: number | null;
}

export function addToCart(item: CartItem, maximumQuantity?: number): AddToCartResult {
  const cart = getCart();
  const existing = cart.find(i => i.productId === item.productId && i.variationId === item.variationId);
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

  if (existing) existing.qty = quantity;
  else cart.push({ ...item, qty: quantity });
  setCart(cart);
  return { addedQty, quantity, maximum: Number.isFinite(maximum) ? maximum : null };
}
export function removeFromCart(productId: string, variationId?: string) {
  if (variationId) {
    setCart(getCart().filter(i => !(i.productId === productId && i.variationId === variationId)));
  } else {
    setCart(getCart().filter(i => i.productId !== productId));
  }
}
export function removeCartLines(lineKeys: CartLineKey[]) {
  const keys = new Set(lineKeys);
  setCart(getCart().filter(item => !keys.has(getCartLineKey(item))));
}
export function clearCart() { setCart([]); }
export function getCartCount(): number { return getCart().reduce((s, i) => s + i.qty, 0); }

function emitCartUpdate() {
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

export function onCartUpdate(cb: () => void) {
  window.addEventListener(CART_EVENT, cb);
  return () => window.removeEventListener(CART_EVENT, cb);
}
