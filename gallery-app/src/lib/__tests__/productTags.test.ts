import { describe, expect, it } from 'vitest';
import { normalizeProductTags, resolveProductTags } from '../productTags';
import { mapSupabaseProduct } from '../utils';

describe('product tags data', () => {
  it('normalizes whitespace, case, duplicates and empty values', () => {
    expect(normalizeProductTags([' Floral ', 'floral', 'hand\t made', '', ', Rustic,', null])).toEqual(['floral', 'hand made', 'rustic']);
  });
  it('maps legacy missing tags to empty arrays and loads saved tags', () => {
    expect(mapSupabaseProduct({ id: 'old' }).tags).toEqual([]);
    expect(mapSupabaseProduct({ id: 'saved', tags: ['Clay', ' clay '] }).tags).toEqual(['clay']);
  });
  it('validates pending text together with the saved chips', () => {
    expect(resolveProductTags({ tags: ['clay'], input: ' FLORAL ' })).toEqual({ tags: ['clay', 'floral'], error: '' });
    expect(resolveProductTags({ tags: [], input: 'a'.repeat(40) }).error).toBe('');
    expect(resolveProductTags({ tags: [], input: 'a'.repeat(41) }).error).toContain('40');
  });
});
