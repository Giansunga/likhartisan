import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CartPage from '../CartPage';
import type { CartItem } from '../../types';
import { readCartCheckoutDraft } from '../../lib/cartCheckout';

const mocks = vi.hoisted(() => ({ user: null as { id: string; user_metadata: { name?: string; phone?: string; address?: string; address_lat?: number | null; address_lng?: number | null } } | null }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

vi.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({ isLoaded: true }),
}));

vi.mock('../../lib/geocoder', () => ({
  geocodeAddress: vi.fn(async () => ({ lat: 14.1, lng: 121.1 })),
}));

const products = [
  { id: 'p1', name: 'Moon Vase', price: 900, image: '/moon.jpg', shop_id: 's1', shop_name: 'Clay House', stock: 4, status: 'active', dimensions: '20 x 20 cm', height: '30 cm' },
  { id: 'p2', name: 'Sun Jar', price: 700, image: '/sun.jpg', shop_id: 's2', shop_name: 'Earth Studio', stock: 3, status: 'active', dimensions: '18 x 18 cm', height: '22 cm' },
];

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        in: vi.fn(async () => {
          if (table === 'products') return { data: products, error: null };
          if (table === 'shops') return { data: [{ id: 's1', location: 'Santo Tomas' }, { id: 's2', location: 'San Fernando' }], error: null };
          return { data: [], error: null };
        }),
      })),
    })),
  },
}));

const cart: CartItem[] = [
  { productId: 'p1', productName: 'Moon Vase', image: '/moon.jpg', price: 900, qty: 1, shopId: 's1', shopName: 'Clay House' },
  { productId: 'p2', productName: 'Sun Jar', image: '/sun.jpg', price: 700, qty: 1, shopId: 's2', shopName: 'Earth Studio' },
];

function ProfileStub() {
  const location = useLocation(); const navigate = useNavigate();
  const resume = location.state.profileReturn;
  return <button onClick={() => { mocks.user!.user_metadata = { ...mocks.user!.user_metadata, address: 'Updated profile address', address_lat: 16, address_lng: 121 }; navigate(resume.pathname, { state: resume.state }); }}>Return from Profile</button>;
}

describe('CartPage guest shop flow', () => {
  beforeEach(() => {
    mocks.user = null;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('lk_cart', JSON.stringify(cart));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      quotationId: 'quote-1',
      priceBreakdown: { total: '150' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  });

  it('switches selection exclusively between artisan shops', async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Moon Vase')).toBeInTheDocument());

    const first = screen.getByLabelText('Select Moon Vase') as HTMLInputElement;
    const second = screen.getByLabelText('Select Sun Jar') as HTMLInputElement;
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);

    fireEvent.click(second);
    expect(first.checked).toBe(false);
    expect(second.checked).toBe(true);
  });

  it('creates a selected-line draft and requests sign-in only at checkout', async () => {
    const authListener = vi.fn();
    window.addEventListener('open-auth', authListener);
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Checkout 1 item' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Checkout 1 item' }));

    expect(authListener).toHaveBeenCalledOnce();
    expect(readCartCheckoutDraft()?.lineKeys).toHaveLength(1);
    window.removeEventListener('open-auth', authListener);
  });

  it('invalidates a courier estimate after quantity changes', async () => {
    mocks.user = { id: 'buyer', user_metadata: { name: 'Buyer', phone: '09123456789', address: 'San Pablo City', address_lat: 14.1, address_lng: 121.1 } } as typeof mocks.user;
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Moon Vase')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Courier.*Get estimate/ }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('San Pablo City')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Estimate delivery' }));

    await waitFor(() => expect(screen.getByText(/Estimated Motorcycle delivery/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Increase quantity of Moon Vase'));

    expect(screen.getByText('At checkout')).toBeInTheDocument();
    expect(screen.queryByText(/Estimated Motorcycle delivery/)).not.toBeInTheDocument();
  });

  it('restores the selected shop, variation, quantity and courier choice after Profile', async () => {
    mocks.user = { id: 'buyer', user_metadata: { address: 'Old profile address', address_lat: 15, address_lng: 120 } };
    localStorage.setItem('lk_cart', JSON.stringify([cart[0], { ...cart[1], qty: 2 }]));
    render(<MemoryRouter initialEntries={['/cart']}><Routes><Route path="/cart" element={<CartPage />} /><Route path="/dashboard" element={<ProfileStub />} /></Routes></MemoryRouter>);
    await screen.findByText('Sun Jar');
    fireEvent.click(screen.getByLabelText('Select Sun Jar'));
    fireEvent.click(screen.getByRole('button', { name: /Courier.*Get estimate/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit in Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return from Profile' }));
    await screen.findByText('Updated profile address');
    expect(screen.getByLabelText('Select Sun Jar')).toBeChecked();
    expect(screen.getByLabelText('Select Moon Vase')).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Courier.*Get estimate/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Checkout 2 items' })).toBeEnabled();
    await screen.findByText(/Estimated Motorcycle delivery/);
    const request = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body));
    expect(request).toMatchObject({ dropoffAddress: 'Updated profile address', dropoffCoords: { lat: 16, lng: 121 }, items: [{ productId: 'p2', variationId: null, quantity: 2 }] });
  });

  it('does not request a courier estimate without a saved delivery pin', async () => {
    mocks.user = { id: 'buyer', user_metadata: { address: 'Saved address without pin' } };
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await screen.findByText('Moon Vase');
    fireEvent.click(screen.getByRole('button', { name: /Courier.*Get estimate/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Estimate delivery' }));
    expect(screen.getByText(/Save a complete delivery address and valid pin in Profile first/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the selected cart lines to the authoritative quotation endpoint', async () => {
    mocks.user = { id: 'buyer', user_metadata: { name: 'Buyer', phone: '09123456789', address: 'San Pablo City', address_lat: 14.1, address_lng: 121.1 } } as typeof mocks.user;
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Moon Vase')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Courier.*Get estimate/ }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('San Pablo City')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Estimate delivery' }));
    await waitFor(() => expect(screen.getByText(/Estimated Motorcycle delivery/)).toBeInTheDocument());

    const request = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body));
    expect(request).toMatchObject({
      pickupAddress: 'Santo Tomas',
      dropoffAddress: 'San Pablo City',
      pickupCoords: { lat: 14.1, lng: 121.1 },
      dropoffCoords: { lat: 14.1, lng: 121.1 },
      items: [{ productId: 'p1', variationId: null, quantity: 1 }],
    });
    expect(request.serviceType).toBeUndefined();
  });
});
