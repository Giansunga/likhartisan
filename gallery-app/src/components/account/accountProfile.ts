import type { User } from '@supabase/supabase-js';

export interface AccountProfile {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  addressLat: number | null;
  addressLng: number | null;
  avatarUrl: string;
}

export interface AccountProfileDraft {
  fullName: string;
  phone: string;
  address: string;
}

export type AccountFieldErrors = Partial<Record<keyof AccountProfileDraft, string>>;

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export function accountProfileFromUser(user: User): AccountProfile {
  const metadata = user.user_metadata || {};
  const addressLat = metadata.address_lat === null || metadata.address_lat === undefined
    ? null
    : Number(metadata.address_lat);
  const addressLng = metadata.address_lng === null || metadata.address_lng === undefined
    ? null
    : Number(metadata.address_lng);

  return {
    fullName: String(metadata.name || '').trim(),
    email: user.email || '',
    phone: String(metadata.phone || '').trim(),
    address: String(metadata.address || '').trim(),
    addressLat: addressLat !== null && Number.isFinite(addressLat) ? addressLat : null,
    addressLng: addressLng !== null && Number.isFinite(addressLng) ? addressLng : null,
    avatarUrl: String(metadata.avatar_url || ''),
  };
}

export function profileToDraft(profile: AccountProfile): AccountProfileDraft {
  return {
    fullName: profile.fullName,
    phone: profile.phone,
    address: profile.address,
  };
}

export function normalizeAccountDraft(draft: AccountProfileDraft): AccountProfileDraft {
  return {
    fullName: draft.fullName.trim().replace(/\s+/g, ' '),
    phone: draft.phone.trim(),
    address: draft.address.trim().replace(/\s+/g, ' '),
  };
}

export function isAccountDraftDirty(draft: AccountProfileDraft, profile: AccountProfile): boolean {
  const normalized = normalizeAccountDraft(draft);
  return normalized.fullName !== profile.fullName
    || normalized.phone !== profile.phone
    || normalized.address !== profile.address;
}

export function validateAccountDraft(draft: AccountProfileDraft): AccountFieldErrors {
  const normalized = normalizeAccountDraft(draft);
  const errors: AccountFieldErrors = {};

  if (normalized.fullName.length < 2) errors.fullName = 'Enter your full name.';
  if (normalized.phone && !/^[+\d][\d\s()-]{6,19}$/.test(normalized.phone)) {
    errors.phone = 'Enter a valid phone number.';
  }
  if (normalized.address && normalized.address.length < 5) {
    errors.address = 'Enter a more complete address.';
  }

  return errors;
}

export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain) return email ? `${email.slice(0, 2)}••••` : 'Not available';
  const visible = localPart.slice(0, Math.min(3, localPart.length));
  return `${visible}${'•'.repeat(Math.max(4, localPart.length - visible.length))}@${domain}`;
}

export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) return 'Choose a JPG, PNG, or WebP image.';
  if (file.size > MAX_AVATAR_SIZE) return 'Avatar images must be 5 MB or smaller.';
  return null;
}
