import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CartPage from '../CartPage';
import type { CartItem } from '../../types';
import { readCartCheckoutDraft } from '../../lib/cartCheckout';

const mocks = vi.hoisted(() => ({ user: null as { user_metadata?: { address?: string } } | null }));

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
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Moon Vase')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Courier.*Get estimate/ }));
    fireEvent.change(screen.getByLabelText('Delivery address'), { target: { value: 'San Pablo City' } });
    fireEvent.click(screen.getByRole('button', { name: 'Estimate delivery' }));

    await waitFor(() => expect(screen.getByText(/Estimated Motorcycle delivery/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Increase quantity of Moon Vase'));

    expect(screen.getByText('At checkout')).toBeInTheDocument();
    expect(screen.queryByText(/Estimated Motorcycle delivery/)).not.toBeInTheDocument();
  });
});
