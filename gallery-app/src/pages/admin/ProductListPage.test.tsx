import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductListPage from './ProductListPage';

const mocks = vi.hoisted(() => ({
  updateResult: { data: null as { id: string } | null, error: null as { message: string } | null },
  variationInsertResult: { data: { id: 'variation-1' }, error: null as { code: string; message: string } | null },
  insertVariation: vi.fn(),
  saveError: vi.fn(),
  recomputeProductStock: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'products') return {
        select: () => ({ order: async () => ({ data: [{ id: 'product-1', name: 'Pet Bowl', category: 'Others', stock: 2, status: 'active', shop_id: 'shop-1', shop_name: 'Clay Studio' }], error: null }) }),
        update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => mocks.updateResult }) }) }),
      };
      return {
        select: () => ({ in: async () => ({ data: [], error: null }) }),
        insert: (row: unknown) => {
          mocks.insertVariation(row);
          return { select: () => ({ single: async () => mocks.variationInsertResult }) };
        },
        delete: () => ({ eq: () => ({ not: async () => ({ error: null }) }) }),
      };
    },
  },
}));
vi.mock('../../lib/stockSync', () => ({ recomputeProductStock: mocks.recomputeProductStock }));
vi.mock('../../realtime/usePortalRealtimeRefresh', () => ({ usePortalRealtimeRefresh: () => undefined }));
vi.mock('../../components/admin/ProductTable', () => ({
  default: ({ products, onEdit }: { products: Array<{ id: string }>; onEdit: (product: { id: string }) => void }) =>
    <button onClick={() => onEdit(products[0])}>Edit first product</button>,
}));
vi.mock('../../components/admin/ProductEditorDialog', () => ({
  default: ({ product, onSave }: { product: { id: string } | null; onSave: (product: { id: string }, data: unknown) => Promise<void> }) =>
    product && <button onClick={() => void onSave(product, {
      name: 'Pet Bowl', category: 'Others', materials: 'Clay', technique: 'Handmade', imageFile: null, modelFile: null,
      variations: [{ dimensions: '4 in', height: '2 in', openingDiameter: '3 in', weightKg: '0.4', packagingWeightKg: '', shippingLengthIn: '', shippingWidthIn: '', shippingHeightIn: '', price: '400', stock: '2' }],
    }).catch((error: Error) => mocks.saveError(error.message))}>Save changes</button>,
}));

describe('admin product editor save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateResult = { data: null, error: null };
    mocks.variationInsertResult = { data: { id: 'variation-1' }, error: null };
  });

  async function save() {
    render(<MemoryRouter><ProductListPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit first product' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.saveError).toHaveBeenCalledOnce());
  }

  it('stops before inserting a variation when the product update matched no row', async () => {
    await save();
    expect(mocks.saveError).toHaveBeenCalledWith('This product is no longer available. Refresh the product list and try again.');
    expect(mocks.insertVariation).not.toHaveBeenCalled();
  });

  it('explains a concurrent product deletion instead of exposing a foreign key error', async () => {
    mocks.updateResult = { data: { id: 'product-1' }, error: null };
    mocks.variationInsertResult = { data: { id: 'variation-1' }, error: { code: '23503', message: 'insert or update on table "product_variations" violates foreign key constraint "product_variations_product_id_fkey"' } };
    await save();
    expect(mocks.insertVariation).toHaveBeenCalledWith(expect.objectContaining({ product_id: 'product-1' }));
    expect(mocks.saveError).toHaveBeenCalledWith('This product is no longer available. Refresh the product list and try again.');
  });

  it('still saves a new variation when the product update returns its row', async () => {
    mocks.updateResult = { data: { id: 'product-1' }, error: null };
    mocks.recomputeProductStock.mockResolvedValue(2);
    render(<MemoryRouter><ProductListPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit first product' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.recomputeProductStock).toHaveBeenCalledWith('product-1'));
    expect(mocks.insertVariation).toHaveBeenCalledWith(expect.objectContaining({ product_id: 'product-1' }));
    expect(mocks.saveError).not.toHaveBeenCalled();
  });
});
