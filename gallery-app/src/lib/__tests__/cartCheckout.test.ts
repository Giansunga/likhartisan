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
import { addToCart, getCart, removeCartLines, setCart } from '../../data/store';

const cart: CartItem[] = [
  { productId: 'p1', variationId: 'v1', productName: 'Vase', image: '', price: 100, qty: 1, shopId: 's1', shopName: 'Clay House' },
  { productId: 'p1', variationId: 'v2', productName: 'Vase', image: '', price: 120, qty: 1, shopId: 's1', shopName: 'Clay House' },
  { productId: 'p2', productName: 'Jar', image: '', price: 200, qty: 1, shopId: 's2', shopName: 'Earth Studio' },
];

function draft(overrides: Partial<CartCheckoutDraft> = {}): CartCheckoutDraft {
  return {
    version: 1, ownerUserId: 'buyer',
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
    writeCartCheckoutDraft('buyer', value);
    expect(readCartCheckoutDraft('buyer')).toEqual(value);
    clearCartCheckoutDraft('buyer');
    expect(readCartCheckoutDraft('buyer')).toBeNull();
  });

  it('associates purchased line keys with the server-created order', () => {
    const keys = cart.slice(0, 2).map(getCartLineKey);
    savePendingPurchase('buyer', 'order_test', keys);
    expect(readPendingPurchase('buyer', 'order_test')).toEqual(keys);
    clearPendingPurchase('buyer', 'order_test');
    expect(readPendingPurchase('buyer', 'order_test')).toEqual([]);
  });

  it('removes only purchased lines and preserves the rest of the cart', () => {
    setCart('buyer', cart);
    removeCartLines('buyer', [getCartLineKey(cart[1])]);

    expect(getCart('buyer')).toEqual([cart[0], cart[2]]);
  });

  it('never adds more than the available stock for a cart line', () => {
    const item = { ...cart[0], qty: 1 };

    expect(addToCart('buyer', item, 2)).toMatchObject({ addedQty: 1, quantity: 1, maximum: 2 });
    expect(addToCart('buyer', item, 2)).toMatchObject({ addedQty: 1, quantity: 2, maximum: 2 });
    expect(addToCart('buyer', item, 2)).toMatchObject({ addedQty: 0, quantity: 2, maximum: 2 });
    expect(getCart('buyer')).toEqual([{ ...item, qty: 2 }]);
  });

  it('keeps variation stock limits independent', () => {
    const first = { ...cart[0], qty: 2 };
    const second = { ...cart[1], qty: 2 };

    addToCart('buyer', first, 1);
    addToCart('buyer', second, 3);

    expect(getCart('buyer')).toEqual([second, { ...first, qty: 1 }]);
  });

  it('moves a line to the top only when another unit is added', () => {
    const first = { ...cart[0], qty: 1 };
    const second = { ...cart[1], qty: 1 };
    setCart('buyer', [second, first]);

    expect(addToCart('buyer', first, 1).addedQty).toBe(0);
    expect(getCart('buyer')).toEqual([second, first]);

    expect(addToCart('buyer', first, 2).addedQty).toBe(1);
    expect(getCart('buyer')).toEqual([{ ...first, qty: 2 }, second]);
  });
});
