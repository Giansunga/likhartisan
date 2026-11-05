import { describe, expect, it } from 'vitest';
import type { PublicShop } from '../../contexts/ShopDirectoryContext';
import { searchShops } from '../shopSearch';

function shop(id: string, name: string): PublicShop {
  return { id, name, image: null, banner: null, description: null, location: null };
}

describe('shop name matching', () => {
  it('ranks exact names, prefixes, and remaining names with alphabetical ties', () => {
    const shops = [shop('3', 'The Clay House'), shop('4', 'Clay Studio'), shop('2', 'Clay House'), shop('1', 'Clay')];
    expect(searchShops(shops, 'clay').map(item => item.id)).toEqual(['1', '2', '4', '3']);
  });

  it('normalizes case, accents, spacing, and punctuation and requires all query words', () => {
    const shops = [shop('1', 'José’s Clay-House'), shop('2', 'José Studio')];
    expect(searchShops(shops, '  HOUSE   JOSE  ').map(item => item.id)).toEqual(['1']);
    expect(searchShops(shops, 'JOSE S CLAY').map(item => item.id)).toEqual(['1']);
    expect(searchShops(shops, 'Jose pottery')).toEqual([]);
  });

  it('handles empty or punctuation-only queries without changing the source list', () => {
    const shops = [shop('2', 'Zulu'), shop('1', 'Alpha')];
    expect(searchShops(shops, '').map(item => item.id)).toEqual(['1', '2']);
    expect(searchShops(shops, '?!')).toHaveLength(2);
    expect(searchShops(shops, 'missing')).toEqual([]);
    expect(shops[0].id).toBe('2');
  });

  it('matches the end of a long shop name', () => {
    const name = `${'Long pottery shop '.repeat(10)}Mercado`;
    expect(searchShops([shop('1', name)], 'mercado')).toHaveLength(1);
  });
});
