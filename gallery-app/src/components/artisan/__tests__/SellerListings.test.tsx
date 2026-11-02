import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SellerListings from '../SellerListings';
import SellerDesignVault from '../SellerDesignVault';
import { ArtisanContext, type ArtisanContextValue } from '../artisanContextValue';
import type { ArtisanProduct } from '../../../types/artisan';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../lib/supabase', () => ({ supabase: {
  from: () => ({ update: (payload: { status: string }) => ({ eq: () => ({ select: () => ({ single: () => mocks.request(payload) }) }) }) }),
} }));

const product: ArtisanProduct = {
  id: 'vase', name: 'Clay Vase', description: '', category: 'Vases', price: 500, stock: 8, image: '',
  materials: 'Clay', dimensions: '', shop_id: 'shop', shop_name: 'Studio', status: 'active', views: 0, created_at: '2026-08-01',
};
function Portal({ initialProducts = [], vault = false }: { initialProducts?: ArtisanProduct[]; vault?: boolean }) {
  const [products, setProducts] = useState(initialProducts);
  const context: ArtisanContextValue = {
    shop: { id: 'shop', name: 'Studio' }, products, setProducts, productPrices: {}, loadingProducts: false,
    loadingOrders: false, loadingMessages: false, buyerActiveMap: {}, userId: 'seller',
    setShop: vi.fn(), setLoadingOrders: vi.fn(), setLoadingMessages: vi.fn(), refreshProducts: vi.fn(),
  };
  return <MemoryRouter><ArtisanContext.Provider value={context}>{vault ? <SellerDesignVault /> : <SellerListings />}</ArtisanContext.Provider></MemoryRouter>;
}

beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (payload: { status: string }) => ({ data: { ...product, ...payload }, error: null }));
});

describe('artisan Add Product entry', () => {
  it('opens the selection popup from the listings toolbar and empty state', () => {
    render(<Portal />);
    const entries = screen.getAllByRole('button', { name: 'Add Product' }); expect(entries).toHaveLength(2);
    fireEvent.click(entries[0]); expect(screen.getByRole('dialog', { name: 'Add New Product' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close popup' }));
    fireEvent.click(entries[1]); expect(screen.getByRole('radio', { name: /Create 3D Model/ })).toBeChecked();
  });
});

describe('seller listing status', () => {
  it('pauses and reactivates a listing, keeping counts and filters consistent', async () => {
    render(<Portal initialProducts={[product]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await screen.findByText('Clay Vase is now inactive.');
    expect(mocks.request).toHaveBeenLastCalledWith({ status: 'inactive' });
    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();
    expect(within(screen.getByText('Inactive', { selector: 'span' })).getByText('1')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Listing status' }), { target: { value: 'active' } });
    expect(screen.queryByText('Clay Vase', { selector: 'strong' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Listing status' }), { target: { value: 'inactive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await screen.findByText('Clay Vase is now active.');
    expect(mocks.request).toHaveBeenLastCalledWith({ status: 'active' });
    expect(screen.queryByText('Clay Vase', { selector: 'strong' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Listing status' }), { target: { value: 'all' } });
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeEnabled();
  });

  it('loads an already inactive listing after a fresh mount', () => {
    render(<Portal initialProducts={[{ ...product, status: 'inactive' }]} />);
    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();
    expect(within(screen.getByText('Inactive', { selector: 'span' })).getByText('1')).toBeInTheDocument();
  });

  it('blocks conflicting actions and duplicate clicks until the database responds', async () => {
    let complete!: (result: unknown) => void;
    mocks.request.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    render(<Portal initialProducts={[product]} />);
    const deactivate = screen.getByRole('button', { name: 'Deactivate' });
    fireEvent.click(deactivate);
    fireEvent.click(deactivate);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
    expect(within(screen.getByText('Active', { selector: 'span' })).getByText('1')).toBeInTheDocument();
    await act(async () => complete({ data: { ...product, status: 'inactive' }, error: null }));
    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();
  });

  it.each(['database', 'network', 'missing-row'])('preserves the listing and allows retry after a %s failure', async (failure) => {
    if (failure === 'network') mocks.request.mockRejectedValueOnce(new Error('Connection failed'));
    else mocks.request.mockResolvedValueOnce({ data: null, error: failure === 'database' ? { message: 'Update rejected' } : null });
    render(<Portal initialProducts={[product]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Clay Vase is now inactive.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeEnabled();
    expect(within(screen.getByText('Active', { selector: 'span' })).getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await screen.findByText('Clay Vase is now inactive.');
  });

  it('archives an inactive listing through the existing confirmation', async () => {
    render(<Portal initialProducts={[{ ...product, status: 'inactive' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive listing' }));
    await screen.findByText('Clay Vase moved to Design Vault.');
    expect(mocks.request).toHaveBeenCalledWith({ status: 'archived' });
    expect(screen.queryByText('Clay Vase', { selector: 'strong' })).not.toBeInTheDocument();
  });

  it('restores an archived listing to active from Design Vault', async () => {
    render(<Portal initialProducts={[{ ...product, status: 'archived' }]} vault />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore listing' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith({ status: 'active' }));
    await screen.findByText('Clay Vase is active and visible in My Listings.');
  });
});
