import { describe, expect, it } from 'vitest';
import type { OrderActivity, PurchaseDetail } from '../../types/purchases';
import { deriveOrderMilestones } from './orderMilestones';

const activity = (id: string, actionType: string, label: string, createdAt: string): OrderActivity => ({ id, actionType, label, createdAt });
const detail = (overrides: Partial<PurchaseDetail> = {}): PurchaseDetail => ({
  id: 'order-1', shortId: 'ORDER1', items: [], shops: [], subtotal: 0, shippingFee: 0, total: 0,
  status: 'to-pay', paymentStatus: 'pending', deliveryStatus: 'pending', deliveryOption: 'courier',
  deliveryProvider: '', trackingNumber: '', estimatedDelivery: '', checkoutSessionId: '', createdAt: '2026-08-01T00:00:00Z',
  activeReturn: null, returnRequest: null, returnEligibility: { eligible: false, reason: '', deadline: null }, activity: [],
  ...overrides,
});

describe('order milestones', () => {
  it('derives each fulfillment state from the recorded order status', () => {
    expect(deriveOrderMilestones(detail())[0].state).toBe('current');
    expect(deriveOrderMilestones(detail({ paymentStatus: 'paid', status: 'to-ship' }))[1].state).toBe('current');
    expect(deriveOrderMilestones(detail({ paymentStatus: 'paid', status: 'to-ship', deliveryStatus: 'preparing' }))[2].state).toBe('current');
    expect(deriveOrderMilestones(detail({ paymentStatus: 'paid', status: 'to-ship', deliveryStatus: 'shipped' }))[3].state).toBe('current');
    expect(deriveOrderMilestones(detail({ paymentStatus: 'paid', status: 'to-receive', deliveryStatus: 'delivered' }))[4].state).toBe('current');
    expect(deriveOrderMilestones(detail({ paymentStatus: 'paid', status: 'completed', deliveryStatus: 'completed' }))[4]).toMatchObject({ state: 'current', label: 'Completed' });
  });

  it('deduplicates repeated events and keeps the earliest valid timestamp', () => {
    const milestones = deriveOrderMilestones(detail({ activity: [
      activity('2', 'payment_verified', 'Payment verified', '2026-08-01T10:05:00Z'),
      activity('1', 'payment_verified', 'Payment verified', '2026-08-01T10:01:00Z'),
      activity('bad', 'payment_verified', 'Payment verified', 'not-a-date'),
    ] }));
    expect(milestones.filter(step => step.key === 'payment')).toHaveLength(1);
    expect(milestones[1].timestamp).toBe('2026-08-01T10:01:00Z');
  });

  it('uses recorded milestones without inventing missing timestamps', () => {
    const milestones = deriveOrderMilestones(detail({ paymentStatus: 'paid', status: 'to-ship' }));
    expect(milestones[0].timestamp).toBeUndefined();
    expect(milestones[1].state).toBe('current');
    expect(milestones[1].timestamp).toBeUndefined();
  });

  it('shows cancellation as a red terminal state with its authentic timestamp', () => {
    const milestones = deriveOrderMilestones(detail({ status: 'cancelled', activity: [activity('1', 'order_cancelled', 'Order cancelled', '2026-08-02T08:00:00Z')] }));
    expect(milestones[4]).toMatchObject({ label: 'Cancelled', state: 'cancelled', timestamp: '2026-08-02T08:00:00Z' });
    expect(milestones.map(step => step.state)).toEqual(['complete', 'upcoming', 'upcoming', 'upcoming', 'cancelled']);
  });
});
