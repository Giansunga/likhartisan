import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../HomePage';

const mocks = vi.hoisted(() => ({
  shops: { data: [] as any[], error: null as null | { message: string } },
  reviews: { data: [] as any[], error: null },
  user: null as null | { id: string },
  from: vi.fn(),
  shopSelect: vi.fn(),
  shopOrder: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock('../../components/freeform/FreeformScrollSection', () => ({ default: () => <div data-testid="freeform-scroller" /> }));
vi.mock('../../components/home/HomeShopRail', () => ({ default: ({ shops, loading, error }: any) => <div data-testid="shop-rail">{loading ? 'Loading shops' : error ? 'Shop error' : shops.map((shop: any) => <a key={shop.id} href={`/shop/${shop.id}`}>{shop.name}</a>)}</div> }));
vi.mock('../../components/home/HomeReviewRail', () => ({ default: ({ reviews }: any) => <div data-testid="review-rail">{reviews.map((review: any) => review.userName).join(', ')}</div> }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mocks.from(...args) } }));

function configureQueries() {
  mocks.from.mockImplementation((table: string) => {
    const response = table === 'shops' ? mocks.shops : mocks.reviews;
    const query: any = {
      select: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(() => query), in: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject),
    };
    if (table === 'shops') { query.select = mocks.shopSelect.mockImplementation(() => query); query.order = mocks.shopOrder.mockImplementation(() => query); }
    return query;
  });
}

function renderHome() { return render(<MemoryRouter><HomePage /></MemoryRouter>); }

describe('HomePage editorial landing page', () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.shops = { data: [{ id: 'shop-1', name: 'Clay Corner', description: '', banner: '', image: '', location: '' }], error: null };
    mocks.reviews = { data: [], error: null };
    mocks.from.mockReset(); mocks.shopSelect.mockReset(); mocks.shopOrder.mockReset(); configureQueries();
  });

  it('keeps the hero first and renders the connected editorial path in order', async () => {
    renderHome();
    const hero = screen.getByRole('heading', { name: /Explore the Local Pottery/i });
    const editorial = screen.getByRole('heading', { name: /Where earth becomes inheritance/i });
    const chapters = screen.getByRole('heading', { name: /Continue reading in About/i });
    const collections = screen.getByRole('heading', { name: /Pottery for everyday rituals/i });
    const shops = screen.getByTestId('shop-rail');
    const freeform = screen.getByTestId('freeform-scroller');
    const reviews = screen.getByTestId('review-rail');
    const closing = screen.getByRole('heading', { name: /Bring home a piece/i });
    [editorial, chapters, collections, shops, freeform, reviews, closing].reduce((previous, current) => {
      expect(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      return current;
    }, hero);
    expect(screen.getByAltText('Rows of finished clay pots in a Santo Tomas workshop')).toHaveAttribute('src', '/images/hero_1.jpg');
    expect(screen.getAllByRole('link', { name: /Read the full story/i })[0]).toHaveAttribute('href', '/about#origin');
    expect(screen.queryByText('LOCAL ARTISANS')).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Clay Corner' })).toHaveAttribute('href', '/shop/shop-1');
  });

  it('links its magazine contents to stable About chapters', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /Why LikhArtisan exists/i })).toHaveAttribute('href', '/about#origin');
    expect(screen.getByRole('link', { name: /A working local tradition/i })).toHaveAttribute('href', '/about#heritage');
    expect(screen.getByRole('link', { name: /From discovery to a maker/i })).toHaveAttribute('href', '/about#platform');
  });

  it('uses real category routes, alphabetized shop fields, and the review fallback', async () => {
    renderHome();
    expect(screen.getAllByRole('link').find(link => link.getAttribute('href') === '/gallery?category=Vases')).toBeDefined();
    expect(screen.getAllByRole('link').find(link => link.getAttribute('href') === '/gallery?category=Tea%20Light%20Vases')).toBeDefined();
    await waitFor(() => expect(mocks.shopSelect).toHaveBeenCalledWith('id, name, description, banner, image, location'));
    expect(mocks.shopOrder).toHaveBeenCalledWith('name');
    expect(screen.getByTestId('review-rail')).toHaveTextContent('Maria Santos');
  });

  it('keeps the account call to action for signed-out visitors only', async () => {
    const openAuth = vi.fn(); window.addEventListener('open-auth', openAuth);
    renderHome();
    const accountButton = await screen.findByRole('button', { name: /Create a free account/i });
    accountButton.click();
    expect(openAuth).toHaveBeenCalledTimes(1);
    window.removeEventListener('open-auth', openAuth);
  });
});
