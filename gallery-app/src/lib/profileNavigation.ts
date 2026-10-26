import type { CartCheckoutDraft, CartItem } from '../types';

export interface ProfileReturn {
  pathname: '/cart' | '/checkout';
  state?: { buyNowItem?: CartItem; checkoutDraft?: CartCheckoutDraft; deliveryOption?: 'pickup' | 'courier'; cartSelection?: { shopKey: string | null; lineKeys: string[]; deliveryOption: 'pickup' | 'courier' | null } };
}

/** Only the two shopping surfaces may be resumed; never follow arbitrary URLs. */
export function profileReturnFromState(state: unknown): ProfileReturn | null {
  if (!state || typeof state !== 'object' || !('profileReturn' in state)) return null;
  const value = state.profileReturn;
  if (!value || typeof value !== 'object' || !('pathname' in value) || !['/cart', '/checkout'].includes(String(value.pathname))) return null;
  return value as ProfileReturn;
}
