import type { Product } from '../../types';
import { catalogDisplayPrice, validCatalogPrice } from '../../lib/catalogPresentation';

export interface ShopProfile {
  id: string;
  name: string;
  owner_name: string | null;
  email: string;
  description: string;
  about: string;
  image: string;
  banner: string;
  location: string;
  created_at: string;
}

export interface ShopArtisan {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  description: string;
  cover_image: string;
}

export interface RatingSummary {
  avg: number;
  count: number;
}

export interface ShopStorefrontData {
  products: Product[];
  productCount: number;
  followerCount: number;
  artisanCount: number;
  artisans: ShopArtisan[];
  productPrices: Record<string, number>;
  productAvailability: Record<string, boolean>;
  productRatings: Record<string, RatingSummary>;
}

export const EMPTY_STOREFRONT_DATA: ShopStorefrontData = {
  products: [],
  productCount: 0,
  followerCount: 0,
  artisanCount: 0,
  artisans: [],
  productPrices: {},
  productAvailability: {},
  productRatings: {},
};

export function getLowestProductPrices(rows: Array<{ product_id: string; price: number | string | null }>) {
  return rows.reduce<Record<string, number>>((prices, row) => {
    const price = validCatalogPrice(row.price);
    if (price !== null && (prices[row.product_id] === undefined || price < prices[row.product_id])) {
      prices[row.product_id] = price;
    }
    return prices;
  }, {});
}

export function getProductRatingSummaries(rows: Array<{ product_id: string; rating: number }>) {
  const totals = rows.reduce<Record<string, { total: number; count: number }>>((ratings, row) => {
    const current = ratings[row.product_id] ?? { total: 0, count: 0 };
    ratings[row.product_id] = { total: current.total + Number(row.rating || 0), count: current.count + 1 };
    return ratings;
  }, {});

  return Object.fromEntries(
    Object.entries(totals).map(([productId, rating]) => [
      productId,
      { avg: rating.total / rating.count, count: rating.count },
    ]),
  ) as Record<string, RatingSummary>;
}

export function getProductDisplayPrice(product: Product, variationPrice?: number) {
  return catalogDisplayPrice(product, variationPrice);
}

export function getMembershipYear(createdAt: string) {
  if (!createdAt) return null;
  const year = new Date(createdAt).getFullYear();
  return Number.isFinite(year) ? year : null;
}

export function getStoryParagraphs(shop: Pick<ShopProfile, 'about' | 'description'>) {
  const story = shop.about.trim() || shop.description.trim();
  if (!story) return [];
  return story.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean);
}
