import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PurchaseDetail } from '../../types/purchases';
import OrderStatusTracker from './OrderStatusTracker';

const completedDetail: PurchaseDetail = {
  id: 'order-1', shortId: 'ORDER1', items: [], shops: [], subtotal: 0, shippingFee: 0, total: 0,
  status: 'completed', paymentStatus: 'paid', deliveryStatus: 'completed', deliveryOption: 'courier',
  deliveryProvider: '', trackingNumber: '', estimatedDelivery: '', checkoutSessionId: '', createdAt: '2026-08-01T00:00:00Z',
  activeReturn: null, returnRequest: null, returnEligibility: { eligible: false, reason: '', deadline: null },
  activity: [
    { id: 'placed', actionType: 'order_placed', label: 'Order placed', createdAt: '2026-08-01T08:00:00Z' },
    { id: 'paid', actionType: 'payment_verified', label: 'Payment verified', createdAt: '2026-08-01T09:00:00Z' },
    { id: 'done', actionType: 'delivery_completed', label: 'Order completed', createdAt: '2026-08-04T12:00:00Z' },
  ],
};

describe('OrderStatusTracker', () => {
  it('renders one accessible horizontal milestone list with the current step', () => {
    render(<OrderStatusTracker detail={completedDetail} />);
    expect(screen.getByRole('heading', { name: 'Order progress' })).toBeInTheDocument();
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(5);
    expect(steps[4]).toHaveAttribute('aria-current', 'step');
    expect(steps[4]).toHaveAccessibleName('Completed: Current status');
    expect(screen.queryByText('Authentic history')).not.toBeInTheDocument();
  });

  it('exposes the scroll region to keyboard users', () => {
    render(<OrderStatusTracker detail={completedDetail} />);
    expect(screen.getByLabelText('Scrollable order progress')).toHaveAttribute('tabindex', '0');
  });

  it.each([
    ['pending payment', { status: 'to-pay', paymentStatus: 'pending', deliveryStatus: 'pending' }, 'Order placed: Current status'],
    ['paid', { status: 'to-ship', paymentStatus: 'paid', deliveryStatus: 'pending' }, 'Payment verified: Current status'],
    ['preparing', { status: 'to-ship', paymentStatus: 'paid', deliveryStatus: 'preparing' }, 'Preparing: Current status'],
    ['shipped', { status: 'to-ship', paymentStatus: 'paid', deliveryStatus: 'shipped' }, 'Shipped: Current status'],
    ['delivered', { status: 'to-receive', paymentStatus: 'paid', deliveryStatus: 'delivered' }, 'Delivered: Current status'],
    ['completed', { status: 'completed', paymentStatus: 'paid', deliveryStatus: 'completed' }, 'Completed: Current status'],
    ['cancelled', { status: 'cancelled', paymentStatus: 'pending', deliveryStatus: 'pending' }, 'Cancelled: Order cancelled'],
  ] as const)('marks the %s tracker state accessibly', (_name, state, accessibleName) => {
    render(<OrderStatusTracker detail={{ ...completedDetail, ...state, activity: [] }} />);
    expect(screen.getByRole('listitem', { name: accessibleName })).toHaveAttribute('aria-current', 'step');
  });
});
