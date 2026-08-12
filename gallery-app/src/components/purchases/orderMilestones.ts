import type { OrderActivity, PurchaseDetail } from '../../types/purchases';

export type OrderMilestoneKey = 'placed' | 'payment' | 'preparing' | 'shipped' | 'final';
export type OrderMilestoneState = 'complete' | 'current' | 'upcoming' | 'cancelled';

export interface OrderMilestone {
  key: OrderMilestoneKey;
  label: string;
  state: OrderMilestoneState;
  timestamp?: string;
}

const KEYS: OrderMilestoneKey[] = ['placed', 'payment', 'preparing', 'shipped', 'final'];

function activityText(activity: OrderActivity) {
  return `${activity.actionType} ${activity.label}`.toLowerCase().replaceAll('_', ' ');
}

function activityKey(activity: OrderActivity): OrderMilestoneKey | 'cancelled' | null {
  const text = activityText(activity);
  if (text.includes('cancel')) return 'cancelled';
  if (text.includes('order placed')) return 'placed';
  if (text.includes('payment verified') || text.includes('payment paid')) return 'payment';
  if (text.includes('preparing')) return 'preparing';
  if (text.includes('shipped') || text.includes('handed to courier')) return 'shipped';
  if (text.includes('delivered') || text.includes('completed') || text.includes('legacy completion')) return 'final';
  return null;
}

function earliestTimestamp(activities: OrderActivity[], predicate: (activity: OrderActivity) => boolean) {
  let earliest: { iso: string; value: number } | undefined;
  for (const activity of activities) {
    if (!predicate(activity)) continue;
    const value = Date.parse(activity.createdAt);
    if (Number.isNaN(value) || earliest && earliest.value <= value) continue;
    earliest = { iso: activity.createdAt, value };
  }
  return earliest?.iso;
}

function statusIndex(detail: PurchaseDetail) {
  if (detail.deliveryStatus === 'completed' || detail.deliveryStatus === 'delivered' || detail.status === 'completed') return 4;
  if (detail.deliveryStatus === 'shipped') return 3;
  if (detail.deliveryStatus === 'preparing') return 2;
  if (detail.paymentStatus === 'paid' || detail.status === 'to-ship' || detail.status === 'to-receive') return 1;
  return 0;
}

export function deriveOrderMilestones(detail: PurchaseDetail): OrderMilestone[] {
  const cancelled = detail.status === 'cancelled';
  const completed = detail.status === 'completed' || detail.deliveryStatus === 'completed';
  const activityHighest = detail.activity.reduce((highest, activity) => {
    const key = activityKey(activity);
    const index = key && key !== 'cancelled' ? KEYS.indexOf(key) : -1;
    return Math.max(highest, index);
  }, 0);
  const progressIndex = Math.max(statusIndex(detail), activityHighest);
  const currentIndex = cancelled ? 4 : progressIndex;

  return KEYS.map((key, index) => {
    let label = key === 'placed' ? 'Order placed'
      : key === 'payment' ? 'Payment verified'
      : key === 'preparing' ? 'Preparing'
      : key === 'shipped' ? 'Shipped'
      : completed ? 'Completed' : 'Delivered';
    let timestamp = earliestTimestamp(detail.activity, activity => activityKey(activity) === key);
    let state: OrderMilestoneState = cancelled && key !== 'final'
      ? index <= progressIndex ? 'complete' : 'upcoming'
      : index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming';

    if (cancelled && key === 'final') {
      label = 'Cancelled';
      state = 'cancelled';
      timestamp = earliestTimestamp(detail.activity, activity => activityKey(activity) === 'cancelled');
    } else if (key === 'final' && completed) {
      const completedAt = earliestTimestamp(detail.activity, activity => {
        const text = activityText(activity);
        return text.includes('completed') || text.includes('legacy completion');
      });
      timestamp = completedAt ?? timestamp;
    }

    return { key, label, state, ...(timestamp ? { timestamp } : {}) };
  });
}
