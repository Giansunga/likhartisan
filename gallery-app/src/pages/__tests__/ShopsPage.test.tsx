import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import ShopsPage from '../ShopsPage';
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ order: async () => ({ data: [{ id: 'clay', name: 'Clay House', banner: '/cover.jpg', image: '' }] }) }) }) } }));
it('shows a compact listing heading while preserving shop covers and the lower promotion', async () => {
  const { container } = render(<MemoryRouter><ShopsPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1, name: 'Shops' })).toBeInTheDocument();
  expect(container.querySelector('.gallery-header-banner')).toBeNull();
  expect(await screen.findByAltText('Clay House')).toHaveAttribute('src', '/cover.jpg');
  expect(screen.getByRole('link', { name: 'View Shop' })).toHaveAttribute('href', '/shop/clay');
  expect(screen.getByAltText(/Request a custom pottery piece/)).toBeInTheDocument();
});
