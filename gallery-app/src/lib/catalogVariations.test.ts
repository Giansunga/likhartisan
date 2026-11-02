import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCatalogVariations } from './catalogVariations';
const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from: () => ({
  insert: (row: Record<string, unknown>) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
  update: (row: Record<string, unknown>) => ({ eq: (_key: string, id: string) => ({ eq: (_key: string, product: string) => ({ select: () => ({ single: () => mocks.update(id, product, row) }) }) }) }),
}) } }));
beforeEach(() => vi.clearAllMocks());
describe('resumable catalog variation saves', () => {
  it('resumes a lost insert response with the same draft ID and creates no duplicate', async () => {
    const stored = new Map<string, unknown>();
    mocks.insert.mockImplementation(async row => {
      if (stored.has(row.id)) return { data: null, error: { code: '23505' } };
      stored.set(row.id, row); throw new Error('Response lost');
    });
    mocks.update.mockImplementation(async (id, product) => ({ data: stored.has(id) && product === 'product-1' ? { id } : null, error: null }));
    const rows = [{ clientId: 'stable-draft', values: { stock: 2 } }];
    await expect(saveCatalogVariations('product-1', rows)).rejects.toThrow('Response lost');
    await expect(saveCatalogVariations('product-1', rows)).resolves.toEqual(['stable-draft']);
    expect(stored.size).toBe(1);
    expect(mocks.update).toHaveBeenCalledWith('stable-draft', 'product-1', { stock: 2 });
  });
  it('stops on a zero-row update and does not save subsequent rows', async () => {
    mocks.update.mockResolvedValue({ data: null, error: null });
    await expect(saveCatalogVariations('product-1', [{ id: 'missing', clientId: 'missing', values: {} }, { clientId: 'new', values: {} }])).rejects.toThrow('could not be confirmed');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('does not retry a permission rejection', async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { code: '42501', message: 'Permission denied' } });
    await expect(saveCatalogVariations('other-shop-product', [{ clientId: 'draft', values: {} }])).rejects.toEqual(expect.objectContaining({ code: '42501' }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
