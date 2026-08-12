import type { PurchaseStatus } from '../types/purchases';

const STATUS_VALUES = new Set<PurchaseStatus>(['all', 'to-pay', 'to-ship', 'to-receive', 'completed', 'return-refund', 'cancelled']);

export function parsePurchaseFilters(params: URLSearchParams) {
  const rawStatus = params.get('status') as PurchaseStatus | null;
  return {
    status: rawStatus && STATUS_VALUES.has(rawStatus) ? rawStatus : 'all' as PurchaseStatus,
    page: Math.max(1, Math.floor(Number(params.get('page')) || 1)),
    sort: params.get('sort') === 'oldest' ? 'oldest' as const : 'newest' as const,
    query: params.get('q')?.trim() || '',
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
    orderId: params.get('order') || '',
  };
}
