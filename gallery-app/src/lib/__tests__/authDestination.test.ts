import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { getAuthDestination } from '../authDestination';

const mocks = vi.hoisted(() => ({ from: vi.fn(), limit: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('../constants', () => ({ SHOP_EMAILS: ['known-shop@example.com'] }));

describe('post-auth destination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ limit: mocks.limit }) }) }) });
  });

  it('uses the shop role for owners outside the email hint list', async () => {
    mocks.limit.mockResolvedValue({ data: [{ role: 'shop_owner' }], error: null });
    expect(await getAuthDestination({ id: 'shop-1', email: 'shop@example.com' } as User)).toBe('/artisan-dashboard');
    expect(mocks.from).toHaveBeenCalledWith('user_roles');
  });

  it('sends ordinary users home', async () => {
    mocks.limit.mockResolvedValue({ data: [], error: null });
    expect(await getAuthDestination({ id: 'buyer-1', email: 'buyer@example.com' } as User)).toBe('/');
  });
});
