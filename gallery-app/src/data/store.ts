import type { CartItem } from '../types';

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
export function addToCart(item: CartItem) {
  const cart = getCart();
  const existing = cart.find(i => i.productId === item.productId && i.variationId === item.variationId);
  if (existing) existing.qty += item.qty;
  else cart.push(item);
  setCart(cart);
}
export function removeFromCart(productId: string, variationId?: string) {
  if (variationId) {
    setCart(getCart().filter(i => !(i.productId === productId && i.variationId === variationId)));
  } else {
    setCart(getCart().filter(i => i.productId !== productId));
  }
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