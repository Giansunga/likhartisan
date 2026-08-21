import { supabase } from './supabase';
import type { AnalyticsFilters, AnalyticsPayload, AnalyticsShopOption } from '../types/adminAnalytics';

export const MANILA_TIME_ZONE = 'Asia/Manila';

export function filtersFromSearch(search: URLSearchParams): AnalyticsFilters {
  const granularity = search.get('granularity');
  return {
    startDate: search.get('start') || undefined, endDate: search.get('end') || undefined,
    shopId: search.get('shop') || undefined, orderType: search.get('type') || undefined,
    granularity: granularity === 'day' || granularity === 'week' ? granularity : 'month',
  };
}

export function filtersToSearch(filters: AnalyticsFilters) {
  const search = new URLSearchParams();
  if (filters.startDate) search.set('start', filters.startDate);
  if (filters.endDate) search.set('end', filters.endDate);
  if (filters.shopId) search.set('shop', filters.shopId);
  if (filters.orderType) search.set('type', filters.orderType);
  search.set('granularity', filters.granularity);
  return search;
}

export function mergeAnalyticsFilters(search: URLSearchParams, filters: AnalyticsFilters) {
  const next = new URLSearchParams(search);
  ['start', 'end', 'shop', 'type', 'granularity'].forEach(key => next.delete(key));
  filtersToSearch(filters).forEach((value, key) => next.set(key, value));
  return next;
}

export async function fetchAnalytics(filters: AnalyticsFilters): Promise<AnalyticsPayload> {
  const { data, error } = await supabase.rpc('admin_commerce_analytics', {
    p_start_date: filters.startDate || null, p_end_date: filters.endDate || null,
    p_granularity: filters.granularity, p_shop_id: filters.shopId || null, p_order_type: filters.orderType || null,
  });
  if (error) throw error;
  return data as AnalyticsPayload;
}

export async function fetchAnalyticsShops(): Promise<AnalyticsShopOption[]> {
  const { data, error } = await supabase.from('shops').select('id, name').order('name');
  if (error) throw error;
  return (data || []).map(shop => ({ id: String(shop.id), name: String(shop.name) }));
}

export function peso(value: unknown) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(Number(value) || 0);
}
