export type NotificationContext = 'buyer' | 'artisan';
export type NotificationCategory = 'orders' | 'messages' | 'system';
export type NotificationFilter = 'all' | 'unread' | NotificationCategory;

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  product_image?: string | null;
  order_id?: string | null;
  conversation_id?: string | null;
  recipient_context: NotificationContext;
  read: boolean;
  created_at: string;
}
