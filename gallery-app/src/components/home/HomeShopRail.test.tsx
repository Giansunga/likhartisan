import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomeShopRail, { type HomeShop } from './HomeShopRail';

const shop: HomeShop = {
  id: 'shop-1',
  name: 'Clay Corner',
  description: 'A description that should no longer be displayed.',
  banner: '',
  image: '',
  location: 'Santo Tomas, Pampanga',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomeShopRail', () => {
  it('keeps shop identity and actions while omitting card descriptions', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });

    render(<MemoryRouter><HomeShopRail shops={[shop]} loading={false} error={false} /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Clay Corner' })).toBeInTheDocument();
    expect(screen.getByText('Santo Tomas, Pampanga')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visit shop/i })).toHaveAttribute('href', '/shop/shop-1');
    expect(screen.queryByText(shop.description)).not.toBeInTheDocument();
    expect(screen.queryByText('Discover handmade pottery and locally made pieces from this participating shop.')).not.toBeInTheDocument();
  });
});
