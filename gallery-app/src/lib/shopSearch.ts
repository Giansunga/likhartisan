import type { PublicShop } from '../contexts/ShopDirectoryContext';
import { normalizeSearchQuery } from './recommendations';

export function searchShops(shops: PublicShop[], query: string): PublicShop[] {
  const normalizedQuery = normalizeSearchQuery(query);
  const words = normalizedQuery.split(' ').filter(Boolean);
  const ranked = shops.map(shop => {
    const name = normalizeSearchQuery(shop.name, Number.POSITIVE_INFINITY);
    const rank = name === normalizedQuery ? 0 : name.startsWith(normalizedQuery) ? 1 : 2;
    return { shop, name, rank };
  }).filter(({ name }) => words.every(word => name.includes(word)));
  ranked.sort((a, b) => a.rank - b.rank || a.shop.name.localeCompare(b.shop.name, 'en-PH') || a.shop.id.localeCompare(b.shop.id));
  return ranked.map(({ shop }) => shop);
}
