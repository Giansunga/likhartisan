import { describe, expect, it } from 'vitest';
import { checkoutQuoteKey } from '../checkoutQuote';

const items = [{ productId: 'p1', variationId: 'v1', qty: 1 }];
const pickup = { lat: 15, lng: 120 };
const dropoff = { lat: 15.1, lng: 120.1 };

describe('checkout quote snapshot', () => {
  it('keeps a quote tied to its cart, address, and delivery pins', () => {
    const key = checkoutQuoteKey(items, 'Shop', 'Buyer', pickup, dropoff);
    expect(checkoutQuoteKey([...items], 'Shop', 'Buyer', { ...pickup }, { ...dropoff })).toBe(key);
    expect(checkoutQuoteKey([{ ...items[0], qty: 2 }], 'Shop', 'Buyer', pickup, dropoff)).not.toBe(key);
    expect(checkoutQuoteKey([{ ...items[0], variationId: 'v2' }], 'Shop', 'Buyer', pickup, dropoff)).not.toBe(key);
    expect(checkoutQuoteKey(items, 'Shop', 'Buyer', pickup, { ...dropoff, lat: 15.2 })).not.toBe(key);
    expect(checkoutQuoteKey(items, 'Shop', 'Buyer', { ...pickup, lng: 120.2 }, dropoff)).not.toBe(key);
    expect(checkoutQuoteKey(items, 'Shop', 'New Buyer', pickup, dropoff)).not.toBe(key);
  });
});
