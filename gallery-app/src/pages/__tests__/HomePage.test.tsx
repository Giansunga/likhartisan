import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../HomePage';
import { HOME_SECTIONS } from '../../lib/homeSections';

const mocks = vi.hoisted(() => ({
  shops: { data: [] as Array<{ id: string; name: string; description: string; banner: string; image: string; location: string }>, error: null as null | { message: string } },
  reviews: { data: [] as Array<{ id: string; user_name: string | null; rating: number; body: string | null; created_at: string; product_id: string }>, error: null },
  user: null as null | { id: string },
  from: vi.fn(),
  shopSelect: vi.fn(),
  shopOrder: vi.fn(),
}));

vi.mock('../../hooks/useLandingCounts', () => ({ useLandingCounts: () => ({ artisanCount: 19, potteryCount: 104 }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock('../../components/freeform/FreeformScrollSection', () => ({ default: () => <div id="home-design-studio" data-home-section data-testid="freeform-scroller" /> }));
vi.mock('../../components/home/HomeShopRail', () => ({ default: ({ shops, loading, error }: { shops: Array<{ id: string; name: string }>; loading: boolean; error: boolean }) => <div id="home-shops" data-home-section data-testid="shop-rail">{loading ? 'Loading shops' : error ? 'Shop error' : shops.map(shop => <a key={shop.id} href={`/shop/${shop.id}`}>{shop.name}</a>)}</div> }));
vi.mock('../../components/home/HomeReviewRail', () => ({ default: ({ reviews }: { reviews: Array<{ userName: string }> }) => <div id="home-reviews" data-home-section data-testid="review-rail">{reviews.map(review => review.userName).join(', ')}</div> }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mocks.from(...args) } }));

function configureQueries() {
  mocks.from.mockImplementation((table: string) => {
    const response = table === 'shops' ? mocks.shops : mocks.reviews;
    const query = {
      select: vi.fn(), order: vi.fn(), limit: vi.fn(), in: vi.fn(),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject),
    };
    query.select.mockImplementation(() => query);
    query.order.mockImplementation(() => query);
    query.limit.mockImplementation(() => query);
    query.in.mockImplementation(() => query);
    if (table === 'shops') { query.select = mocks.shopSelect.mockImplementation(() => query); query.order = mocks.shopOrder.mockImplementation(() => query); }
    return query;
  });
}

function renderHome() { return render(<MemoryRouter><HomePage /></MemoryRouter>); }

describe('HomePage editorial landing page', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    mocks.user = null;
    mocks.shops = { data: [{ id: 'shop-1', name: 'Clay Corner', description: '', banner: '', image: '', location: '' }], error: null };
    mocks.reviews = { data: [], error: null };
    mocks.from.mockReset(); mocks.shopSelect.mockReset(); mocks.shopOrder.mockReset(); configureQueries();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the hero first and renders the connected editorial path in order', async () => {
    renderHome();
    const hero = screen.getByRole('heading', { name: /Explore the Local Pottery/i });
    const editorial = screen.getByRole('heading', { name: /Where earth becomes inheritance/i });
    const chapters = screen.getByRole('heading', { name: /Continue reading in About/i });
    const collections = screen.getByRole('heading', { name: /Pottery for everyday rituals/i });
    const shops = screen.getByTestId('shop-rail');
    const freeform = screen.getByTestId('freeform-scroller');
    const shopTour = screen.getByRole('heading', { name: 'A Tour of Santo Tomas: Inside the Shops' }).closest('section');
    const reviews = screen.getByTestId('review-rail');
    [editorial, collections, shops, freeform, reviews, chapters].reduce((previous, current) => {
      expect(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      return current;
    }, hero);
    expect(shopTour).not.toBeNull();
    expect(shopTour?.nextElementSibling).toBe(reviews);
    expect(screen.getByTitle('A Tour of Santo Tomas: Inside the Shops').querySelector('source')).toHaveAttribute('src', '/media/r2/Landing%20Page%20Video/LikhArtisan%203min.mp4');
    expect(screen.getByTitle('A Tour of Santo Tomas: Inside the Shops')).toHaveAttribute('preload', 'metadata');
    expect(screen.getByTitle('A Tour of Santo Tomas: Inside the Shops')).toHaveAttribute('controls');
    expect(screen.getByTitle('A Tour of Santo Tomas: Inside the Shops')).toHaveAttribute('playsinline');
    expect(screen.getByTitle('A Tour of Santo Tomas: Inside the Shops')).not.toHaveAttribute('autoplay');
    expect(screen.queryByText('From sculptural vessels to small moments of light, find a piece that feels at home with you.')).not.toBeInTheDocument();
    expect(screen.queryByText('Watch the craft unfold', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByAltText('Rows of finished clay pots in a Santo Tomas workshop')).toHaveAttribute('src', '/images/hero_1.jpg');
    expect(screen.getByAltText('A potter shaping a large clay vessel')).toHaveAttribute('src', '/images/history_bottom_right.jpg');
    expect(screen.getByAltText('Two pottery workers shaping a large clay vessel in a Santo Tomas workshop')).toHaveAttribute('src', '/images/artisan_1.jpg');
    expect(screen.getAllByRole('link', { name: /Read the full story/i })[0]).toHaveAttribute('href', '/about#origin');
    const impact = screen.getByLabelText('LikhArtisan community impact');
    expect(impact).toHaveTextContent("More than just pottery, it's a destination of culture, creativity, and community.");
    expect(impact).toHaveTextContent('Local Artisans');
    expect(impact).toHaveTextContent('Years of Tradition');
    expect(impact).toHaveTextContent('Pottery Creations');
    expect(impact.compareDocumentPosition(collections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getAllByRole('link').find(link => link.getAttribute('href') === '/gallery?category=Others')).toBeDefined();
    await waitFor(() => expect(mocks.shopSelect).toHaveBeenCalledWith('id, name, description, banner, image, location'));
    expect(mocks.shopOrder).toHaveBeenCalledWith('name');
    expect(screen.getByTestId('review-rail')).toHaveTextContent('Maria Santos');
  });

  it('keeps every section destination mounted while shop data loads', async () => {
    renderHome();
    expect(screen.getByTestId('shop-rail')).toHaveTextContent('Loading shops');
    HOME_SECTIONS.forEach(section => expect(document.getElementById(section.id)).toHaveAttribute('data-home-section'));
    await screen.findByRole('link', { name: 'Clay Corner' });
  });

  it.each(['empty', 'error'])('keeps navigation destinations with %s shop data', async state => {
    mocks.shops = { data: [], error: state === 'error' ? { message: 'Unavailable' } : null };
    renderHome();
    await waitFor(() => expect(screen.getByTestId('shop-rail')).not.toHaveTextContent('Loading shops'));
    HOME_SECTIONS.forEach(section => expect(document.getElementById(section.id)).toHaveAttribute('data-home-section'));
    expect(screen.getByTestId('review-rail')).toHaveTextContent('Maria Santos');
  });

});
