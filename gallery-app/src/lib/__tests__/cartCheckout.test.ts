import { beforeEach, describe, expect, it } from 'vitest';
import type { CartCheckoutDraft, CartItem } from '../../types';
import {
  clearCartCheckoutDraft,
  clearPendingPurchase,
  getCartLineKey,
  readCartCheckoutDraft,
  readPendingPurchase,
  resolveCartDraftItems,
  savePendingPurchase,
  writeCartCheckoutDraft,
} from '../cartCheckout';
import { getCart, removeCartLines, setCart } from '../../data/store';

const cart: CartItem[] = [
  { productId: 'p1', variationId: 'v1', productName: 'Vase', image: '', price: 100, qty: 1, shopId: 's1', shopName: 'Clay House' },
  { productId: 'p1', variationId: 'v2', productName: 'Vase', image: '', price: 120, qty: 1, shopId: 's1', shopName: 'Clay House' },
  { productId: 'p2', productName: 'Jar', image: '', price: 200, qty: 1, shopId: 's2', shopName: 'Earth Studio' },
];

function draft(overrides: Partial<CartCheckoutDraft> = {}): CartCheckoutDraft {
  return {
    version: 1,
    source: 'cart',
    shopId: 's1',
    lineKeys: [getCartLineKey(cart[1])],
    ...overrides,
  };
}

describe('cart checkout contract', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('uses the variation in a stable line key', () => {
    expect(getCartLineKey(cart[0])).not.toBe(getCartLineKey(cart[1]));
  });

  it('resolves only selected lines from the draft shop', () => {
    const result = resolveCartDraftItems(cart, draft({ lineKeys: [getCartLineKey(cart[1]), getCartLineKey(cart[2])] }));
    expect(result).toEqual([cart[1]]);
  });

  it('persists and clears a versioned checkout draft', () => {
    const value = draft({ deliveryOption: 'courier' });
    writeCartCheckoutDraft(value);
    expect(readCartCheckoutDraft()).toEqual(value);
    clearCartCheckoutDraft();
    expect(readCartCheckoutDraft()).toBeNull();
  });

  it('associates purchased line keys with the server-created order', () => {
    const keys = cart.slice(0, 2).map(getCartLineKey);
    savePendingPurchase('order_test', keys);
    expect(readPendingPurchase('order_test')).toEqual(keys);
    clearPendingPurchase('order_test');
    expect(readPendingPurchase('order_test')).toEqual([]);
  });

  it('removes only purchased lines and preserves the rest of the cart', () => {
    setCart(cart);
    removeCartLines([getCartLineKey(cart[1])]);

    expect(getCart()).toEqual([cart[0], cart[2]]);
  });
});
