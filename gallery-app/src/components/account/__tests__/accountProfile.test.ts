import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import {
  accountProfileFromUser,
  isAccountDraftDirty,
  maskEmail,
  normalizeAccountDraft,
  validateAccountDraft,
  validateAvatarFile,
} from '../accountProfile';

function userWith(metadata: Record<string, unknown>): User {
  return { id: 'buyer-1', email: 'buyer@example.com', user_metadata: metadata } as User;
}

describe('account profile helpers', () => {
  it('normalizes profile metadata without inventing missing coordinates', () => {
    const profile = accountProfileFromUser(userWith({
      name: '  Maria Santos  ',
      phone: ' 09171234567 ',
      address: ' Pampanga ',
      address_lat: null,
      address_lng: undefined,
    }));

    expect(profile).toMatchObject({
      fullName: 'Maria Santos',
      phone: '09171234567',
      address: 'Pampanga',
      addressLat: null,
      addressLng: null,
    });
  });

  it('compares normalized drafts against the original saved snapshot', () => {
    const profile = accountProfileFromUser(userWith({ name: 'Maria Santos', phone: '09171234567', address: 'San Fernando, Pampanga' }));
    expect(isAccountDraftDirty({ fullName: ' Maria   Santos ', phone: '09171234567', address: 'San Fernando,   Pampanga' }, profile)).toBe(false);
    expect(isAccountDraftDirty({ fullName: 'Maria Cruz', phone: '09171234567', address: 'San Fernando, Pampanga' }, profile)).toBe(true);
    expect(normalizeAccountDraft({ fullName: ' Maria   Cruz ', phone: ' 0917 ', address: ' A   B ' })).toEqual({ fullName: 'Maria Cruz', phone: '0917', address: 'A B' });
  });

  it('returns field-level validation errors for invalid details', () => {
    expect(validateAccountDraft({ fullName: 'M', phone: 'abc', address: 'x' })).toEqual({
      fullName: 'Enter your full name.',
      phone: 'Enter a valid phone number.',
      address: 'Enter a more complete address.',
    });
  });

  it('masks email and validates avatar type and size', () => {
    expect(maskEmail('buyer@example.com')).not.toContain('buyer@');
    expect(maskEmail('buyer@example.com')).toContain('@example.com');
    expect(validateAvatarFile(new File(['photo'], 'avatar.png', { type: 'image/png' }))).toBeNull();
    expect(validateAvatarFile(new File(['photo'], 'avatar.gif', { type: 'image/gif' }))).toMatch(/JPG/);
    expect(validateAvatarFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'avatar.webp', { type: 'image/webp' }))).toMatch(/5 MB/);
  });
});
