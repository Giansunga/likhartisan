export type AnalyticsGranularity = 'day' | 'week' | 'month';

export interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  shopId?: string;
  orderType?: string;
  granularity: AnalyticsGranularity;
}

export interface AnalyticsSummary {
  grossRevenue: number; refunds: number; netRevenue: number; paidOrders: number;
  averageOrderValue: number; purchasingCustomers: number; repeatCustomers: number;
  repeatCustomerRate: number; cancellationRate: number; problematicOrders: number;
}
export interface AnalyticsComparisonSummary {
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  paidOrders: number;
  averageOrderValue: number;
  purchasingCustomers: number;
}
export interface AnalyticsShopOption { id: string; name: string; }
export interface AnalyticsSeriesPoint { period: string; grossRevenue: number; refunds: number; netRevenue: number; orders: number; }
export interface RankedMetric { name: string; revenue?: number; units_sold?: number; unitsSold?: number; orders?: number; views?: number; shop_name?: string; shopName?: string; }
export interface AnalyticsPayload {
  summary: AnalyticsSummary;
  comparisonSummary: AnalyticsComparisonSummary | null;
  series: AnalyticsSeriesPoint[];
  paymentStatuses: { name: string; value: number }[];
  deliveryStatuses: { name: string; value: number }[];
  products: RankedMetric[]; shops: RankedMetric[]; categories: RankedMetric[];
}
