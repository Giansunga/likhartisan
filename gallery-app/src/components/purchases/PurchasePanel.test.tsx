import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseDetail, PurchaseSummary } from '../../types/purchases';

const fixtures = vi.hoisted(() => ({
  orders: [] as PurchaseSummary[],
  purchaseApi: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'buyer-1' }, loading: false }) }));
vi.mock('../../hooks/usePurchases', () => ({
  usePurchases: () => ({
    data: { orders: fixtures.orders, statusCounts: { all: fixtures.orders.length, 'to-pay': 0, 'to-ship': fixtures.orders.length, 'to-receive': 0, completed: 0, 'return-refund': 0, cancelled: 0 }, pagination: { page: 1, pageSize: 10, total: fixtures.orders.length, totalPages: 1 } },
    loading: false, refreshing: false, error: '', reload: vi.fn(),
  }),
}));
vi.mock('../../lib/purchaseApi', () => ({ purchaseApi: fixtures.purchaseApi }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }));

import PurchasePanel from './PurchasePanel';

const target: PurchaseDetail = {
  id: 'target-order', shortId: 'targetor', items: [{ index: 0, productId: 'pot-1', variationId: '', productName: 'Target vase', image: '/pottery.png', quantity: 1, price: 300, shopId: 'shop-1', shopName: 'Target Pottery' }],
  shops: [{ id: 'shop-1', name: 'Target Pottery' }], subtotal: 300, shippingFee: 0, total: 300,
  status: 'to-ship', paymentStatus: 'paid', deliveryStatus: 'pending', deliveryOption: 'delivery', deliveryProvider: 'LBC', trackingNumber: 'TRACK-123', estimatedDelivery: '', checkoutSessionId: '', createdAt: '2026-08-20T00:00:00Z', activeReturn: null,
  activity: [], returnRequest: null, returnEligibility: { eligible: false, reason: 'Not eligible yet', deadline: null },
};
const other: PurchaseSummary = { ...target, id: 'other-order', shortId: 'otherord', items: [{ ...target.items[0], productName: 'Other bowl' }] };

function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function SwitchOrder() {
  const [, setParams] = useSearchParams();
  return <button onClick={() => setParams({ tab: 'purchases', order: 'other-order' })}>Open other order</button>;
}
function renderPanel(entry: string, controls = false) {
  return render(<MemoryRouter initialEntries={[entry]}><PurchasePanel />{controls && <SwitchOrder />}<Location /></MemoryRouter>);
}

describe('PurchasePanel LIKHAI deep links', () => {
  beforeEach(() => {
    fixtures.orders = [other];
    fixtures.purchaseApi.mockImplementation((path: string) => Promise.resolve(path === '/target-order' ? target : other));
    Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { callback(0); return 1; } });
    Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  it('hydrates, expands, and scrolls to a linked order outside the active list', async () => {
    renderPanel('/dashboard?tab=purchases&status=completed&order=target-order');
    expect(await screen.findByText('Order progress')).toBeInTheDocument();
    expect(document.getElementById('order-target-order')).toBeInTheDocument();
    expect(fixtures.purchaseApi).toHaveBeenCalledWith('/target-order');
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it('updates the expanded card when the linked order changes and clears it when closed', async () => {
    fixtures.orders = [target, other];
    renderPanel('/dashboard?tab=purchases&order=target-order', true);
    expect(await screen.findByText('Order progress')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open other order' }));
    await waitFor(() => expect(fixtures.purchaseApi).toHaveBeenCalledWith('/other-order'));
    expect(screen.getAllByText('Order progress')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.getByTestId('location')).not.toHaveTextContent('order=');
  });
});
