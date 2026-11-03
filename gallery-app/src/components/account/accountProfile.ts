import type { User } from '@supabase/supabase-js';
import { readAddressParts, type AddressParts } from '../../lib/profileAddress';
import { readProfileAddressBook, type SavedProfileAddress } from '../../lib/profileAddressBook';

export interface AccountProfile {
  addresses?: SavedProfileAddress[];
  defaultAddressId?: string | null;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  addressLat: number | null;
  addressLng: number | null;
  avatarUrl: string;
  addressParts?: AddressParts | null;
}

export interface AccountProfileDraft {
  addresses?: SavedProfileAddress[];
  defaultAddressId?: string | null;
  fullName: string;
  phone: string;
  address: string;
  addressParts?: AddressParts | null;
  addressLat?: number | null;
  addressLng?: number | null;
}

export type AccountFieldErrors = Partial<Record<keyof AccountProfileDraft, string>>;

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export function accountProfileFromUser(user: User): AccountProfile {
  const metadata = user.user_metadata || {};
  const book=readProfileAddressBook(metadata);
  const active=book.addresses.find(item=>item.id===book.defaultAddressId);
  const addressLat = metadata.address_lat === null || metadata.address_lat === undefined
    ? null
    : Number(metadata.address_lat);
  const addressLng = metadata.address_lng === null || metadata.address_lng === undefined
    ? null
    : Number(metadata.address_lng);

  return {
    ...book,
    fullName: String(metadata.name || '').trim(),
    email: user.email || '',
    phone: String(metadata.phone || '').trim(),
    address: metadata.address_book_version===1 ? active?.address||'' : String(metadata.address || '').trim(),
    addressLat: metadata.address_book_version===1 ? active?.addressLat??null : addressLat !== null && Number.isFinite(addressLat) ? addressLat : null,
    addressLng: metadata.address_book_version===1 ? active?.addressLng??null : addressLng !== null && Number.isFinite(addressLng) ? addressLng : null,
    avatarUrl: String(metadata.avatar_url || ''),
    addressParts: metadata.address_book_version===1 ? active?.addressParts??null : readAddressParts(metadata.address_parts),
  };
}

export function profileToDraft(profile: AccountProfile): AccountProfileDraft {
  return {
    addresses:profile.addresses||[],defaultAddressId:profile.defaultAddressId??null,
    fullName: profile.fullName,
    phone: profile.phone,
    address: profile.address,
    addressParts: profile.addressParts ?? null,
    addressLat: profile.addressLat,
    addressLng: profile.addressLng,
  };
}

export function normalizeAccountDraft(draft: AccountProfileDraft): AccountProfileDraft {
  return {
    ...draft,
    fullName: draft.fullName.trim().replace(/\s+/g, ' '),
    phone: draft.phone.trim(),
    address: draft.address.trim().replace(/\s+/g, ' '),
  };
}

export function isAccountDraftDirty(draft: AccountProfileDraft, profile: AccountProfile): boolean {
  const normalized = normalizeAccountDraft(draft);
  return normalized.fullName !== profile.fullName
    || normalized.phone !== profile.phone
    || (draft.address !== profile.address && normalized.address !== profile.address)
    || JSON.stringify(normalized.addressParts ?? null) !== JSON.stringify(profile.addressParts ?? null)
    || (normalized.addressLat !== undefined && normalized.addressLat !== profile.addressLat)
    || (normalized.addressLng !== undefined && normalized.addressLng !== profile.addressLng)
    || (normalized.addresses !== undefined && JSON.stringify(normalized.addresses)!==JSON.stringify(profile.addresses||[]))
    || (normalized.defaultAddressId !== undefined && normalized.defaultAddressId!==(profile.defaultAddressId??null));
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
  if (normalized.addressParts && (!normalized.addressParts.region || !normalized.addressParts.city || !normalized.addressParts.barangay || !normalized.addressParts.street.trim())) {
    errors.address = 'Choose your region, city or municipality, barangay, and enter a street or landmark.';
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
