export type SellerSection =
  | 'overview'
  | 'orders'
  | 'messages'
  | 'listings'
  | 'requests'
  | 'profile'
  | 'design-vault'
  | 'notifications';

export interface ArtisanShop {
  id: string;
  name: string;
  email?: string;
  owner_id?: string;
  image?: string;
  banner?: string;
  description?: string;
  about?: string;
  location?: string;
  last_seen_at?: string;
  created_at?: string;
}

export interface ArtisanProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  model3d?: string;
  materials: string;
  dimensions: string;
  technique?: string;
  shop_id: string;
  shop_name: string;
  status: string;
  views: number;
  created_at: string;
  updated_at?: string;
}

export interface ArtisanProductVariation {
  id?: string;
  product_id?: string;
  dimensions: string;
  height: string;
  opening_diameter?: string;
  price: number;
  stock: number;
  sort_order?: number;
}

export interface ArtisanOrderItem {
  product_id?: string;
  product_name?: string;
  productName?: string;
  shop_id?: string;
  shop_name?: string;
  image?: string;
  price?: number;
  qty?: number;
  quantity?: number;
  variation?: string;
}

export interface ArtisanOrder {
  id: string;
  user_id?: string;
  user_name?: string;
  user_phone?: string;
  user_address?: string;
  created_at: string;
  status?: string;
  payment_status?: string;
  delivery_status?: string;
  delivery_option?: string;
  subtotal?: number;
  total?: number;
  shipping_fee?: number;
  items: ArtisanOrderItem[];
}

export interface ArtisanConversationSummary {
  id: string;
  shop_id: string;
  buyer_id?: string;
  buyer_name?: string;
  buyer_avatar?: string;
  last_message?: string;
  last_message_at?: string;
  artisan_unread?: number;
  buyer_unread?: number;
  created_at?: string;
}

export interface ArtisanMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  image_url?: string;
  created_at: string;
}

export type ArtisanNotification = NotificationRecord;

export interface SellerDateRange {
  start: Date;
  end: Date;
  label: string;
}

export interface OrderStatusDatum {
  name: string;
  value: number;
  color: string;
}

export interface SellerDashboardMetrics {
  revenue: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  activeListings: number;
  revenueTrend: number;
  ordersTrend: number;
}
import type { NotificationRecord } from './notifications';
