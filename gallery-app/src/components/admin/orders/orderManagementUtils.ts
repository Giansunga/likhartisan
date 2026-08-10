import type { Order } from '../../../types';
import type { QueueKey } from './OrderManagementUI';

export function matchesQueue(order: Order, queue: QueueKey) {
  if (queue === 'all') return true;
  if (queue === 'cancelled') return order.status === 'cancelled';
  if (queue === 'completed') return order.status === 'completed' || order.delivery_status === 'completed';
  if (queue === 'pending') return order.delivery_status === 'pending' && !['cancelled', 'completed', 'refunded'].includes(order.status);
  return order.delivery_status === queue && order.status !== 'cancelled';
}

export function formatCurrency(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPlacedDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatPlacedTime(value: string) {
  return new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
