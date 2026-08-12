import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShopPage from '../ShopPage';

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  shop: {
    data: {
      id: 'shop-1',
      name: 'Clay House',
      owner_name: 'Mara',
      email: 'hello@clay.test',
      description: 'Small-batch pottery from Santo Tomas.',
      about: 'Our family shapes every piece together.',
      image: '',
      banner: '',
      location: 'Santo Tomas, Pampanga',
      created_at: '2022-04-20T00:00:00.000Z',
    },
    error: null,
  } as any,
  products: {
    data: [{
      id: 'product-1', name: 'Warm Clay Vase', description: '', category: 'Vases', price: 0, stock: 1,
      image: '', model3d: null, materials: 'Clay', dimensions: '', height: '', opening_diameter: '',
      technique: '', shop_id: 'shop-1', shop_name: 'Clay House', status: 'active', views: 0,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    }],
    count: 14,
    error: null,
  },
  followers: { data: null, count: 2, error: null },
  following: { data: null, error: null },
  artisans: { data: [], count: 0, error: null },
  variations: { data: [], error: null },
  reviews: { data: [], error: null },
  followAction: { data: null, error: null },
  conversation: { data: null, error: null },
  createdConversation: { data: { id: 'conversation-1' }, error: null },
  from: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: mocks.from.mockImplementation((table: string) => {
      let operation = 'select';
      let countQuery = false;
      const result = () => {
        if (table === 'products') return mocks.products;
        if (table === 'artisans') return mocks.artisans;
        if (table === 'product_variations') return mocks.variations;
        if (table === 'product_reviews') return mocks.reviews;
        if (table === 'shop_followers') return operation === 'insert' || operation === 'delete' ? mocks.followAction : mocks.followers;
        return { data: null, error: null };
      };
      const query: any = {
        select: vi.fn((_fields?: string, options?: { head?: boolean }) => { countQuery = Boolean(options?.head); operation = 'select'; return query; }),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        in: vi.fn(() => query),
        not: vi.fn(() => query),
        insert: vi.fn(() => { operation = 'insert'; return query; }),
        delete: vi.fn(() => { operation = 'delete'; return query; }),
        maybeSingle: vi.fn(() => {
          if (table === 'shops') return Promise.resolve(mocks.shop);
          if (table === 'shop_followers' && !countQuery) return Promise.resolve(mocks.following);
          if (table === 'conversations') return Promise.resolve(mocks.conversation);
          return Promise.resolve(result());
        }),
        single: vi.fn(() => Promise.resolve(table === 'conversations' ? mocks.createdConversation : result())),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    }),
  },
}));

function renderShop() {
  return render(
    <MemoryRouter initialEntries={['/shop/shop-1']}>
      <Routes><Route path="/shop/:id" element={<ShopPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('ShopPage', () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.shop.error = null;
    mocks.products.error = null;
    mocks.followAction.error = null;
    mocks.following.data = null;
    mocks.from.mockClear();
  });

  it('renders accurate shop facts and removes unsupported claims', async () => {
    renderShop();

    expect(await screen.findByRole('heading', { name: 'Clay House' })).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText('Price unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View all 14 pieces/i })).toHaveAttribute('href', '/gallery?shop=shop-1');
    expect(screen.queryByText('Verified Shop')).not.toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
  });

  it('opens authentication when a signed-out shopper follows the shop', async () => {
    const authHandler = vi.fn();
    window.addEventListener('open-auth', authHandler);
    renderShop();

    fireEvent.click(await screen.findByRole('button', { name: 'Follow' }));
    expect(authHandler).toHaveBeenCalledTimes(1);
    expect((authHandler.mock.calls[0][0] as CustomEvent).detail).toEqual({ view: 'signin' });
    window.removeEventListener('open-auth', authHandler);
  });

  it('optimistically follows a shop for a signed-in shopper', async () => {
    mocks.user = { id: 'user-1' };
    renderShop();

    fireEvent.click(await screen.findByRole('button', { name: 'Follow' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText('You are now following Clay House.')).toBeInTheDocument();
  });
});
