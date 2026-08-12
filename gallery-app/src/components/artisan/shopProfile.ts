import type { ArtisanShop } from '../../types/artisan';

export interface ShopProfileDraft {
  name: string;
  description: string;
  about: string;
  location: string;
  image: string;
  banner: string;
}

export const SHOP_PROFILE_LIMITS = {
  name: 80,
  description: 180,
  about: 2000,
  location: 180,
} as const;

export function makeShopProfileDraft(shop: ArtisanShop): ShopProfileDraft {
  return {
    name: shop.name || '',
    description: shop.description || '',
    about: shop.about || '',
    location: shop.location || '',
    image: shop.image || '',
    banner: shop.banner || '',
  };
}

export function validateShopProfile(draft: ShopProfileDraft): Partial<Record<keyof ShopProfileDraft, string>> {
  const errors: Partial<Record<keyof ShopProfileDraft, string>> = {};
  const nameLength = draft.name.trim().length;
  if (nameLength < 2) errors.name = 'Enter a shop name with at least 2 characters.';
  if (nameLength > SHOP_PROFILE_LIMITS.name) errors.name = `Keep the shop name under ${SHOP_PROFILE_LIMITS.name} characters.`;
  if (draft.description.length > SHOP_PROFILE_LIMITS.description) errors.description = `Keep the tagline under ${SHOP_PROFILE_LIMITS.description} characters.`;
  if (draft.about.length > SHOP_PROFILE_LIMITS.about) errors.about = `Keep the story under ${SHOP_PROFILE_LIMITS.about} characters.`;
  if (draft.location.length > SHOP_PROFILE_LIMITS.location) errors.location = `Keep the location under ${SHOP_PROFILE_LIMITS.location} characters.`;
  return errors;
}

export function getShopProfileCompletion(draft: ShopProfileDraft) {
  const checks = [
    { label: 'Shop name', complete: draft.name.trim().length >= 2 },
    { label: 'Tagline', complete: draft.description.trim().length >= 20 },
    { label: 'Shop story', complete: draft.about.trim().length >= 80 },
    { label: 'Location', complete: Boolean(draft.location.trim()) },
    { label: 'Profile photo', complete: Boolean(draft.image) },
    { label: 'Cover photo', complete: Boolean(draft.banner) },
  ];
  const completed = checks.filter(check => check.complete).length;
  return { checks, completed, percent: Math.round((completed / checks.length) * 100) };
}
