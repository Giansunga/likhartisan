import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SellerListings from '../SellerListings';
vi.mock('../artisanContextValue', () => ({ useArtisanPortal: () => ({ products: [], productPrices: {}, loadingProducts: false, setProducts: vi.fn() }) }));
describe('artisan Add Product entry', () => {
  it('opens the selection popup from the listings toolbar and empty state', () => {
    render(<MemoryRouter><SellerListings /></MemoryRouter>);
    const entries = screen.getAllByRole('button', { name: 'Add Product' }); expect(entries).toHaveLength(2);
    fireEvent.click(entries[0]); expect(screen.getByRole('dialog', { name: 'Add New Product' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close popup' }));
    fireEvent.click(entries[1]); expect(screen.getByRole('radio', { name: /Create 3D Model/ })).toBeChecked();
  });
});
