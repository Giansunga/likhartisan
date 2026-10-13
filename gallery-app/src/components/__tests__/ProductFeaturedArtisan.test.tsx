import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductFeaturedArtisan from '../ProductFeaturedArtisan';
const mocks = vi.hoisted(() => ({ query: vi.fn(), filter: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: (key: string, value: string) => {
  mocks.filter(key, value); return { eq: (key: string, value: string) => { mocks.filter(key, value); return { single: mocks.query }; } };
} }) }) } }));
const artisan = { id: 'juan', shop_id: 'shop', name: 'Juan Dela Cruz', specialty: 'Master Potter' };
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({ data: artisan, error: null }); });
describe('featured artisan public row', () => {
  it('displays the current profile name and specialty and filters by the product shop', async () => {
    render(<ProductFeaturedArtisan artisanId="juan" shopId="shop" />);
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByText('Master Potter')).toBeInTheDocument();
    expect(mocks.filter).toHaveBeenCalledWith('shop_id', 'shop');
  });
  it('omits an empty specialty', async () => {
    mocks.query.mockResolvedValue({ data: { ...artisan, specialty: '' }, error: null });
    const { container } = render(<ProductFeaturedArtisan artisanId="juan" shopId="shop" />);
    await screen.findByText('Juan Dela Cruz');
    expect(container.querySelector('em')).toBeNull();
  });
  it.each(['deleted', 'mismatch', 'failure'])('hides the row for %s profiles', async state => {
    mocks.query.mockResolvedValue({ data: state === 'mismatch' ? { ...artisan, shop_id: 'other' } : null, error: state === 'failure' ? new Error('Unavailable') : null });
    const { container } = render(<ProductFeaturedArtisan artisanId="juan" shopId="shop" />);
    await waitFor(() => expect(mocks.query).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
  it('does not fetch legacy unassigned products', () => {
    const { container } = render(<ProductFeaturedArtisan shopId="shop" />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('clears the previous product artisan immediately', async () => {
    const { rerender, container } = render(<ProductFeaturedArtisan artisanId="juan" shopId="shop" />);
    await screen.findByText('Juan Dela Cruz');
    rerender(<ProductFeaturedArtisan shopId="shop" />);
    expect(container).toBeEmptyDOMElement();
  });
});
