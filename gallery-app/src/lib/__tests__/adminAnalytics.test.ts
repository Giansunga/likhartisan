import { describe, expect, it } from 'vitest';
import { filtersFromSearch, filtersToSearch, peso } from '../adminAnalytics';

describe('admin analytics filters', () => {
  it('round-trips shareable filters', () => {
    const filters = { startDate: '2026-08-01', endDate: '2026-08-21', shopId: 'shop-1', orderType: 'customized', granularity: 'week' as const };
    expect(filtersFromSearch(filtersToSearch(filters))).toEqual(filters);
  });

  it('uses monthly granularity when a URL value is invalid', () => {
    expect(filtersFromSearch(new URLSearchParams('granularity=year')).granularity).toBe('month');
  });

  it('formats PHP consistently', () => {
    expect(peso(1234.5)).toContain('1,234.50');
  });
});
