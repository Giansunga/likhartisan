import { beforeEach, describe, expect, it } from 'vitest';
import { addToCart, getCart, removeCartLines } from './store';
import { getCartLineKey } from '../lib/cartCheckout';
const item = { productId: 'vase', productName: 'Vase', price: 10, image: '', shopName: 'Shop', qty: 1 };
describe('account cart isolation', () => {
 beforeEach(() => localStorage.clear());
 it('ignores guest writes and legacy shared contents', () => {
  localStorage.setItem('lk_cart', JSON.stringify([item]));
  expect(addToCart(null, item).addedQty).toBe(0);
  expect(getCart(null)).toEqual([]); expect(getCart('a')).toEqual([]);
  expect(localStorage.getItem('lk_cart')).toBeTruthy();
 });
 it('retains separate carts and removes only the account purchase lines', () => {
  addToCart('a', item); addToCart('b', { ...item, qty: 2 });
  expect(getCart(null)).toEqual([]);
  expect(getCart('a')[0].qty).toBe(1);
  removeCartLines('a', [getCartLineKey(item)]);
  expect(getCart('a')).toEqual([]); expect(getCart('b')[0].qty).toBe(2);
 });
});
