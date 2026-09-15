import { describe, it, expect } from 'vitest';
import { fmt, formatVariation, displayVariation, fmtRating, mapSupabaseProduct } from '../utils';

describe('fmt', () => {
  it('formats zero', () => {
    expect(fmt(0)).toBe('₱0.00');
  });

  it('formats whole numbers', () => {
    expect(fmt(1000)).toBe('₱1,000.00');
  });

  it('formats decimals', () => {
    expect(fmt(1234.5)).toBe('₱1,234.50');
  });

  it('formats large numbers', () => {
    expect(fmt(123456)).toBe('₱123,456.00');
  });
});

describe('formatVariation', () => {
  it('returns empty string for null', () => {
    expect(formatVariation(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatVariation(undefined)).toBe('');
  });

  it('returns dimensions if present', () => {
    expect(formatVariation({ dimensions: '10 x 5 in' })).toBe('10 x 5 in');
  });

  it('ignores N/A dimensions', () => {
    expect(formatVariation({ dimensions: 'N/A', height: '20cm' })).toBe('20cm');
  });

  it('joins height and opening with bullet', () => {
    expect(formatVariation({ height: '20cm', openingDiameter: '10cm' })).toBe('20cm \u2022 10cm');
  });
});

describe('displayVariation', () => {
  it('returns empty string for empty input', () => {
    expect(displayVariation('')).toBe('');
  });

  it('returns first part before bullet', () => {
    expect(displayVariation('10 x 5 in \u2022 20cm')).toBe('10 x 5 in');
  });

  it('returns raw string if no bullet', () => {
    expect(displayVariation('10 x 5 in')).toBe('10 x 5 in');
  });
});

describe('fmtRating', () => {
  it('formats to 1 decimal', () => {
    expect(fmtRating(4.5)).toBe('4.5');
  });

  it('rounds to 1 decimal', () => {
    expect(fmtRating(4.56)).toBe('4.6');
  });

  it('handles zero', () => {
    expect(fmtRating(0)).toBe('0.0');
  });
});

describe('mapSupabaseProduct', () => {
  it('maps a full row', () => {
    const row = {
      id: '1', name: 'Vase', description: 'A vase', category: 'Vases',
      price: 500, stock: 10, image: 'img.jpg', model3d: 'model.glb',
      materials: 'Clay', dimensions: '10x5', height: '20cm',
      opening_diameter: '10cm', technique: 'Hand-thrown',
      shop_id: 's1', shop_name: 'Shop', status: 'active',
      views: 100, rating_avg: 4.5, rating_count: 5,
      created_at: '2026-01-01', updated_at: '2026-01-02',
    };
    const result = mapSupabaseProduct(row);
    expect(result.id).toBe('1');
    expect(result.name).toBe('Vase');
    expect(result.openingDiameter).toBe('10cm');
    expect(result.shopId).toBe('s1');
  });

  it('handles missing fields', () => {
    const result = mapSupabaseProduct({ id: '2', name: 'Pot' });
    expect(result.description).toBe('');
    expect(result.price).toBe(0);
    expect(result.status).toBe('active');
  });
});
