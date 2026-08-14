import type {
  DesignRequest,
  DesignRequestOrderSummary,
  DesignRequestQueueItem,
  DesignRequestStage,
} from '../../types/designRequest';

export const DESIGN_REQUEST_STAGE_LABELS: Record<DesignRequestStage, string> = {
  needs_response: 'Needs response',
  awaiting_buyer: 'Awaiting buyer',
  revision_requested: 'Revision requested',
  declined: 'Declined',
  payment_pending: 'Payment pending',
  ready_for_production: 'Ready for production',
  in_production: 'In production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function deriveDesignRequestStage(
  request: Pick<DesignRequest, 'status'>,
  order: DesignRequestOrderSummary | null,
): DesignRequestStage {
  if (request.status === 'pending') return 'needs_response';
  if (request.status === 'changes_requested') return 'revision_requested';
  if (request.status === 'quoted') return 'awaiting_buyer';
  if (request.status === 'declined') return 'declined';
  if (!order) return 'payment_pending';
  if (order.status === 'cancelled' || order.status === 'refunded') return 'cancelled';
  if (order.delivery_status === 'completed' || order.status === 'completed') return 'completed';
  if (order.delivery_status === 'delivered') return 'delivered';
  if (order.delivery_status === 'shipped') return 'shipped';
  if (order.delivery_status === 'preparing') return 'in_production';
  return order.payment_status === 'paid' ? 'ready_for_production' : 'payment_pending';
}

export function normalizeRequestOrder(value: unknown): DesignRequestOrderSummary | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') return null;
  const order = candidate as Record<string, unknown>;
  if (typeof order.id !== 'string') return null;
  return {
    id: order.id,
    status: String(order.status || 'pending'),
    payment_status: String(order.payment_status || 'pending'),
    delivery_status: String(order.delivery_status || 'pending'),
    total: Number(order.total) || 0,
    checkout_session_id: typeof order.checkout_session_id === 'string' ? order.checkout_session_id : null,
    order_type: String(order.order_type || 'customized'),
  };
}

export function requestNextAction(item: DesignRequestQueueItem) {
  const labels: Record<DesignRequestStage, string> = {
    needs_response: 'Review request', awaiting_buyer: 'Wait for approval',
    revision_requested: 'Wait for revision', declined: 'View decision',
    payment_pending: 'Wait for payment', ready_for_production: 'Start production',
    in_production: 'Mark shipped', shipped: 'Mark delivered', delivered: 'Complete order',
    completed: 'View completed order', cancelled: 'View cancelled order',
  };
  return labels[item.stage];
}

export function requestMatches(item: DesignRequestQueueItem, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const snapshot = item.design_snapshot;
  return [item.id, item.buyer_name, snapshot.model.name, snapshot.model.category, item.order?.id]
    .filter(Boolean).some(value => String(value).toLowerCase().includes(needle));
}
