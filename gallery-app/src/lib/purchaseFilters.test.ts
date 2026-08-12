import { describe, expect, it } from 'vitest';
import { parsePurchaseFilters } from './purchaseFilters';

describe('purchase URL filters', () => {
  it('restores supported filters and deep links', () => {
    expect(parsePurchaseFilters(new URLSearchParams('status=to-receive&page=3&sort=oldest&q=vase&order=abc'))).toMatchObject({ status: 'to-receive', page: 3, sort: 'oldest', query: 'vase', orderId: 'abc' });
  });
  it('normalizes invalid status, page, and sort values', () => {
    expect(parsePurchaseFilters(new URLSearchParams('status=unknown&page=-2&sort=random'))).toMatchObject({ status: 'all', page: 1, sort: 'newest' });
  });
});
