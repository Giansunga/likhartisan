import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateFeaturedArtisan } from '../featuredArtisan';
const mocks = vi.hoisted(() => ({ single: vi.fn(), eq: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: (key: string, value: string) => { mocks.eq(key, value); return { eq: (key: string, value: string) => { mocks.eq(key, value); return { single: mocks.single }; } }; } }) }) } }));
beforeEach(() => { vi.clearAllMocks(); mocks.single.mockResolvedValue({ data: { id: 'juan' }, error: null }); });
describe('artisan save validation', () => {
  it('requires a shop and artisan before querying', async () => {
    await expect(validateFeaturedArtisan('shop', '')).rejects.toThrow('Select a Featured Artisan');
    expect(mocks.single).not.toHaveBeenCalled();
  });
  it('checks the current artisan and shop before saving', async () => {
    await validateFeaturedArtisan('shop', 'juan');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'juan');
    expect(mocks.eq).toHaveBeenCalledWith('shop_id', 'shop');
  });
  it('rejects an artisan removed or moved since the form loaded', async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    await expect(validateFeaturedArtisan('shop', 'juan')).rejects.toThrow('no longer available for this shop');
  });
});
