import type { CartItem } from '../types';

interface Coordinates {
  lat: number;
  lng: number;
}

export function checkoutQuoteKey(
  items: Pick<CartItem, 'productId' | 'variationId' | 'qty'>[],
  pickupAddress: string,
  dropoffAddress: string,
  pickupCoords: Coordinates,
  dropoffCoords: Coordinates | null,
): string {
  return JSON.stringify({
    items: items.map(item => [item.productId, item.variationId || null, item.qty]),
    pickupAddress,
    dropoffAddress,
    pickupCoords,
    dropoffCoords,
  });
}
