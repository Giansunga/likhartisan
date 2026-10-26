import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CartItem } from '../../types';
import CheckoutPage from '../CheckoutPage';
import { getCartLineKey } from '../../lib/cartCheckout';

const authUser = vi.hoisted(() => ({
  id: 'buyer-1', email: 'buyer@example.com',
  user_metadata: {
    name: 'Buyer Name', phone: '09123456789', address: 'San Fernando, Pampanga',
    address_lat: 15.1, address_lng: 120.1,
  },
}));

vi.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({ isLoaded: true }),
  GoogleMap: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({
      data: { location: 'Santo Tomas, Pampanga', latitude: 15, longitude: 120 }, error: null,
    }) }) }) }),
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }), updateUser: vi.fn() },
  },
}));
vi.mock('../../lib/geocoder', () => ({
  geocodeAddress: async () => ({ lat: 15.1, lng: 120.1 }),
  reverseGeocodeCoords: async () => 'San Fernando, Pampanga',
}));
vi.mock('../../lib/api', () => ({ API_BASE: '' }));
vi.mock('../../lib/popups', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/popups')>()), toast: { error: vi.fn(), success: vi.fn() } }));

const item: CartItem = {
  productId: 'p1', productName: 'Vase', image: '/vase.jpg', price: 400,
  qty: 1, shopId: 'shop1', shopName: 'Pottery Shop',
};

function quote(total: string) {
  return {
    quotationId: `quote-${total}`, expiresAt: new Date(Date.now() + 300_000).toISOString(),
    priceBreakdown: { total }, shipment: {
      fingerprint: 'shipment-1', totalWeightKg: 3.1,
      recommendedVehicle: { serviceType: 'MOTORCYCLE', label: 'Motorcycle' },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

function ProfileStub() {
  const resume = useLocation().state.profileReturn; const navigate = useNavigate();
  return <button onClick={() => navigate(resume.pathname, { state: resume.state })}>Return to checkout</button>;
}

describe('product checkout', () => {
  it('refreshes a changed courier fee and requires a second payment click', async () => {
    let quoteCalls = 0;
    const checkoutBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/lalamove/quote')) {
        quoteCalls += 1;
        return { ok: true, json: async () => quote(quoteCalls === 1 ? '85.00' : '95.00') };
      }
      if (url.endsWith('/api/create-checkout')) {
        checkoutBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return { ok: false, status: 409, json: async () => ({ code: checkoutBodies.length === 1 ? 'ERR_COURIER_FEE_CHANGED' : 'ERR_STALE_SHIPMENT' }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryRouter initialEntries={[{ pathname: '/checkout', state: { buyNowItem: item, deliveryOption: 'courier' } }]}>
      <Routes><Route path="/checkout" element={<CheckoutPage />} /></Routes>
    </MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Courier fee confirmed for this checkout:')).toBeInTheDocument());
    expect(screen.getAllByText('₱485.00').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to secure payment' }));
    await waitFor(() => expect(quoteCalls).toBe(2));
    await waitFor(() => expect(screen.getAllByText('₱495.00').length).toBeGreaterThan(0));
    expect(screen.getByText(/The courier fee changed\. Review the updated delivery fee and total/)).toBeInTheDocument();
    expect(checkoutBodies).toHaveLength(1);
    expect(checkoutBodies[0].quotedShippingFeeCentavos).toBe(8500);

    fireEvent.click(screen.getByRole('button', { name: 'Continue to secure payment' }));
    await waitFor(() => expect(checkoutBodies).toHaveLength(2));
    expect(checkoutBodies[1].quotedShippingFeeCentavos).toBe(9500);
    await waitFor(() => expect(quoteCalls).toBe(3));
    expect(screen.getByText(/Your order or delivery route changed\. We are refreshing/)).toBeInTheDocument();
  });

  it('ignores stale cart destination overrides and only quotes saved profile coordinates', async () => {
    localStorage.setItem('lk_cart', JSON.stringify([item]));
    const fetchMock = vi.fn(async (...args: [string, RequestInit]) => { void args; return { ok: true, json: async () => quote('85.00') }; });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter initialEntries={[{ pathname: '/checkout', state: { checkoutDraft: { version: 1, source: 'cart', shopId: item.shopId, lineKeys: [getCartLineKey(item)], deliveryOption: 'courier', destination: { address: 'Stale cart address', coordinates: { lat: 1, lng: 2 } } } } }]}><Routes><Route path="/checkout" element={<CheckoutPage />} /></Routes></MemoryRouter>);
    await screen.findByText('Courier fee confirmed for this checkout:');
    expect(screen.getByText('San Fernando, Pampanga')).toBeInTheDocument();
    expect(screen.queryByText('Stale cart address')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ dropoffAddress: 'San Fernando, Pampanga', dropoffCoords: { lat: 15.1, lng: 120.1 } });
  });

  it('preserves Buy Now quantity and delivery method through Profile and requests a fresh quote', async () => {
    const fetchMock = vi.fn(async (...args: [string, RequestInit]) => { void args; return { ok: true, json: async () => quote('85.00') }; });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter initialEntries={[{ pathname: '/checkout', state: { buyNowItem: { ...item, qty: 3, variationId: 'v1', variation: 'Large' }, deliveryOption: 'courier' } }]}><Routes><Route path="/checkout" element={<CheckoutPage />} /><Route path="/dashboard" element={<ProfileStub />} /></Routes></MemoryRouter>);
    await screen.findByText('Courier fee confirmed for this checkout:');
    fireEvent.click(screen.getByRole('button', { name: 'Edit in Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to checkout' }));
    await screen.findByText('Courier fee confirmed for this checkout:');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ items: [{ productId: 'p1', variationId: 'v1', quantity: 3 }] });
    expect(screen.getByText('Large')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity 3')).toBeInTheDocument();
  });

  it('keeps pickup checkout available without requesting a courier quote', async () => {
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/lalamove/quote')) throw new Error('Pickup must not request a courier quote');
      if (url.endsWith('/api/create-checkout')) {
        requests.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return { ok: false, status: 400, json: async () => ({ error: 'Test stopped before payment' }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<MemoryRouter initialEntries={[{ pathname: '/checkout', state: { buyNowItem: item, deliveryOption: 'pickup' } }]}>
      <Routes><Route path="/checkout" element={<CheckoutPage />} /></Routes>
    </MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to secure payment' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Continue to secure payment' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].deliveryOption).toBe('pickup');
    expect(requests[0].quotedShippingFeeCentavos).toBeNull();
  });
});
