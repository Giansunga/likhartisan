import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { getCart, setCart } from '../../data/store';
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
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import PurchasePanel from './PurchasePanel';

const target: PurchaseDetail = {
  id: 'target-order', shortId: 'targetor', items: [{ index: 0, productId: 'pot-1', variationId: '', productName: 'Target vase', image: '/pottery.png', quantity: 1, price: 300, shopId: 'shop-1', shopName: 'Target Pottery' }],
  shops: [{ id: 'shop-1', name: 'Target Pottery' }], subtotal: 300, shippingFee: 0, total: 300,
  status: 'to-ship', paymentStatus: 'paid', deliveryStatus: 'pending', deliveryOption: 'delivery', deliveryProvider: 'LBC', trackingNumber: 'TRACK-123', estimatedDelivery: '', checkoutSessionId: '', createdAt: '2026-08-20T00:00:00Z', activeReturn: null,
  activity: [], returnRequest: null, returnEligibility: { eligible: false, reason: 'Not eligible yet', deadline: null },
};
const other: PurchaseSummary = { ...target, id: 'other-order', shortId: 'otherord', items: [{ ...target.items[0], productName: 'Other bowl' }] };

function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function Path() { return <output data-testid="path">{useLocation().pathname}</output>; }
function SwitchOrder() {
  const [, setParams] = useSearchParams();
  return <button onClick={() => setParams({ tab: 'purchases', order: 'other-order' })}>Open other order</button>;
}
function renderPanel(entry: string, controls = false) {
  return render(<MemoryRouter initialEntries={[entry]}><PurchasePanel />{controls && <SwitchOrder />}<Location /><Path /></MemoryRouter>);
}

describe('PurchasePanel LIKHAI deep links', () => {
  beforeEach(() => {
    fixtures.purchaseApi.mockReset();
    localStorage.clear();
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

describe('PurchasePanel Buy again', () => {
  const order: PurchaseSummary = { ...target, status: 'completed', deliveryStatus: 'completed' };
  const vase = { productId: 'pot-1', productName: 'Target vase', image: '/pottery.png', price: 320, qty: 1, shopId: 'shop-1', shopName: 'Target Pottery' };
  const bowl = { productId: 'pot-2', productName: 'Clay bowl', image: '/bowl.png', price: 180, qty: 2, shopId: 'shop-1', shopName: 'Target Pottery' };

  beforeEach(() => {
    fixtures.orders = [order];
    fixtures.purchaseApi.mockReset();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('adds the first available item and opens the populated cart', async () => {
    fixtures.purchaseApi.mockResolvedValue({ available: [vase], unavailable: [] });
    renderPanel('/dashboard?tab=purchases');

    fireEvent.click(screen.getByRole('button', { name: 'Buy again' }));
    expect(await screen.findByRole('dialog', { name: 'Buy again' })).toBeInTheDocument();
    expect(screen.getByText('₱320.00 each')).toBeInTheDocument();
    expect(getCart()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(getCart()).toEqual([vase]);
    expect(screen.getByTestId('path')).toHaveTextContent('/cart');
    expect(toast.success).toHaveBeenCalledWith('1 item added to your cart.');
  });

  it('adds multiple items and increases an existing cart line', async () => {
    setCart([{ ...vase, qty: 2 }]);
    fixtures.purchaseApi.mockResolvedValue({ available: [vase, bowl], unavailable: [] });
    renderPanel('/dashboard?tab=purchases');

    fireEvent.click(screen.getByRole('button', { name: 'Buy again' }));
    await screen.findByRole('dialog', { name: 'Buy again' });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(getCart()).toEqual([{ ...vase, qty: 3 }, bowl]);
    expect(toast.success).toHaveBeenCalledWith('3 items added to your cart.');
  });

  it('shows unavailable reasons and leaves the cart unchanged when cancelled', async () => {
    fixtures.purchaseApi.mockResolvedValue({ available: [vase], unavailable: [{ productName: 'Clay bowl', reason: 'Out of stock' }] });
    renderPanel('/dashboard?tab=purchases');

    fireEvent.click(screen.getByRole('button', { name: 'Buy again' }));
    expect(await screen.findByText('Out of stock')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getCart()).toEqual([]);
  });

  it('shows a close-only modal when no items are available', async () => {
    fixtures.purchaseApi.mockResolvedValue({ available: [], unavailable: [{ productName: 'Target vase', reason: 'Out of stock' }] });
    renderPanel('/dashboard?tab=purchases');

    fireEvent.click(screen.getByRole('button', { name: 'Buy again' }));
    expect(await screen.findByText('None of these items are currently available.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Close', { selector: 'button' }));
    expect(getCart()).toEqual([]);
  });

  it('reports a reorder-plan failure without opening the modal', async () => {
    fixtures.purchaseApi.mockRejectedValue(new Error('Purchase service is temporarily unavailable'));
    renderPanel('/dashboard?tab=purchases');

    fireEvent.click(screen.getByRole('button', { name: 'Buy again' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Purchase service is temporarily unavailable'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getCart()).toEqual([]);
  });

  it('keeps the modal open when no cart quantity was added', async () => {
    fixtures.purchaseApi.mockResolvedValue({ available: [{ ...vase, qty: 0 }], unavailable: [] });
    renderPanel('/dashboard?tab=purchases');

    fireEvent.click(screen.getByRole('button', { name: 'Buy again' }));
    await screen.findByRole('dialog', { name: 'Buy again' });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t add these items to your cart. Please try again.');
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard');
    expect(getCart()).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
