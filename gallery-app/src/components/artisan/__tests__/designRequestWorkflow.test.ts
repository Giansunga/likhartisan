import { describe, expect, it } from 'vitest';
import { deriveDesignRequestStage, requestMatches } from '../designRequestWorkflow';
import type { DesignRequestQueueItem } from '../../../types/designRequest';

const order = { id: 'order-1', status: 'pending', payment_status: 'pending', delivery_status: 'pending', total: 1200, checkout_session_id: null, order_type: 'customized' };

describe('design request workflow', () => {
  it.each([
    ['pending', null, 'needs_response'], ['changes_requested', null, 'revision_requested'],
    ['quoted', null, 'awaiting_buyer'], ['declined', null, 'declined'],
    ['approved', order, 'payment_pending'],
    ['approved', { ...order, payment_status: 'paid' }, 'ready_for_production'],
    ['approved', { ...order, payment_status: 'paid', delivery_status: 'preparing' }, 'in_production'],
    ['approved', { ...order, payment_status: 'paid', delivery_status: 'completed', status: 'completed' }, 'completed'],
  ])('derives %s as %s', (status, linkedOrder, expected) => {
    expect(deriveDesignRequestStage({ status: status as never }, linkedOrder)).toBe(expected);
  });

  it('searches buyer, model, and linked order identifiers', () => {
    const item = { id: 'request-1', buyer_name: 'Maria Santos', design_snapshot: { model: { name: 'Moon Vase', category: 'Vase' } }, order } as DesignRequestQueueItem;
    expect(requestMatches(item, 'maria')).toBe(true);
    expect(requestMatches(item, 'moon')).toBe(true);
    expect(requestMatches(item, 'order-1')).toBe(true);
    expect(requestMatches(item, 'plate')).toBe(false);
  });
});
