import { Bell, CheckCircle2, CircleAlert, CreditCard, MessageCircle, PackageCheck, Truck, XCircle } from 'lucide-react';
import { notificationCategory } from '../../lib/notifications';
import type { NotificationRecord } from '../../types/notifications';

export default function NotificationIcon({ notification }: { notification: NotificationRecord }) {
  if (notification.type === 'shipped') return <Truck aria-hidden="true" />;
  if (notification.type === 'completed' || notification.type === 'delivered') return <CheckCircle2 aria-hidden="true" />;
  if (notification.type === 'cancelled') return <XCircle aria-hidden="true" />;
  if (notification.type === 'payment') return <CreditCard aria-hidden="true" />;
  const category = notificationCategory(notification);
  if (category === 'orders') return <PackageCheck aria-hidden="true" />;
  if (category === 'messages') return <MessageCircle aria-hidden="true" />;
  if (notification.type === 'system') return <CircleAlert aria-hidden="true" />;
  return <Bell aria-hidden="true" />;
}
