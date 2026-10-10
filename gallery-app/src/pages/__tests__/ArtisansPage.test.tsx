import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ArtisansPage from '../ArtisansPage';

vi.mock('../../lib/supabase', () => ({ supabase: { from: (table: string) => {
  const response = table === 'artisans' ? { data: [
    { id: 'assigned', name: 'Assigned maker', shop_id: 'shop' },
    { id: 'unassigned', name: 'Independent maker', shop_id: null },
    { id: 'missing', name: 'Missing shop maker', shop_id: 'missing' },
  ] } : table === 'shops' ? { data: [{ id: 'shop', name: 'Clay House' }] } : { data: null, count: 0 };
  const query = { select: () => query, order: () => query, in: () => query, eq: () => query, then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve) };
  return query;
} } }));
describe('artisan assigned shops', () => {
  it('links the assigned shop and provides distinct unavailable and unassigned labels', async () => {
    render(<MemoryRouter><ArtisansPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Clay House' })).toHaveAttribute('href', '/shop/shop');
    expect(screen.getByText('No shop assigned')).toBeInTheDocument();
    expect(screen.getByText('Shop unavailable')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assigned maker' }).nextElementSibling).toHaveTextContent('Clay House');
  });
});
