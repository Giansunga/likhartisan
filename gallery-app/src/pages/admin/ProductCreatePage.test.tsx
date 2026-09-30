import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductCreatePage from './ProductCreatePage';

const mocks = vi.hoisted(() => ({
  insertProduct: vi.fn(),
  insertVariations: vi.fn(),
  uploadToR2: vi.fn(),
  recomputeProductStock: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => table === 'shops'
      ? { select: () => ({ order: async () => ({ data: [{ id: 'shop-1', name: 'Clay Studio', email: 'shop@example.com' }] }) }) }
      : table === 'products'
        ? { insert: (row: unknown) => { mocks.insertProduct(row); return { select: () => ({ single: async () => ({ data: { id: 'product-1' }, error: null }) }) }; } }
        : { insert: async (rows: unknown) => { mocks.insertVariations(rows); return { error: null }; } },
  },
}));
vi.mock('../../lib/r2', () => ({ uploadToR2: mocks.uploadToR2 }));
vi.mock('../../lib/stockSync', () => ({ recomputeProductStock: mocks.recomputeProductStock }));
vi.mock('../../realtime/usePortalRealtimeRefresh', () => ({ usePortalRealtimeRefresh: () => undefined }));

function renderPage() {
  return render(<MemoryRouter initialEntries={['/admin/products/create']}><Routes>
    <Route path="/admin/products/create" element={<ProductCreatePage />} />
    <Route path="/admin/products" element={<p>Product list</p>} />
  </Routes></MemoryRouter>);
}

function variationCard(number: number) {
  return screen.getByText(`Variation ${number}`).parentElement!.parentElement!;
}

describe('admin product upload form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadToR2.mockImplementation(async (_file: File, folder: string) => `https://files.example/${folder}/uploaded`);
    mocks.recomputeProductStock.mockResolvedValue(5);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
  });

  it('starts with one variation and expands incomplete shipping details', () => {
    renderPage();
    expect(screen.getAllByRole('option').slice(1, 6).map(option => option.textContent)).toEqual(['Vases', 'Planters', 'Jars', 'Decorative Pieces', 'Others']);
    expect(screen.queryByRole('option', { name: /Bowls|Teapots|Plates/ })).not.toBeInTheDocument();
    expect(screen.getByText('Variation 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Shipping details/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Upload Product' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add New Variation' }));
    expect(screen.getByText('Variation 2')).toBeInTheDocument();
    fireEvent.click(within(variationCard(2)).getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('Variation 2')).not.toBeInTheDocument();

    fireEvent.click(within(variationCard(1)).getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('No variations added yet. Add a variation below.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add New Variation' }));
    expect(screen.getByText('Variation 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Shipping details/ }));
    fireEvent.change(screen.getByPlaceholderText('Length'), { target: { value: '12' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter all three packed dimensions');
    expect(screen.getByRole('button', { name: /Shipping details/ })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Shipping details/ }));
    expect(screen.getByPlaceholderText('Length')).toBeInTheDocument();
  });

  it('saves image, model, catalog dimensions, stock, and optional packed data for two variations', async () => {
    const { container } = renderPage();
    await screen.findByRole('option', { name: 'Clay Studio' });
    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: 'Ancient Vase' } });
    fireEvent.change(container.querySelector('select[name="category"]')!, { target: { value: 'Vases' } });
    fireEvent.change(container.querySelector('select[name="shopId"]')!, { target: { value: 'shop-1' } });

    fireEvent.change(screen.getByPlaceholderText('e.g. 6 in × 4 in'), { target: { value: '6 in x 4 in' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 8 in'), { target: { value: '8 in' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1.5'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '350' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add New Variation' }));
    const second = within(variationCard(2));
    fireEvent.change(second.getByPlaceholderText('e.g. 6 in × 4 in'), { target: { value: '9 in x 7 in' } });
    fireEvent.change(second.getByPlaceholderText('e.g. 8 in'), { target: { value: '11 in' } });
    fireEvent.change(second.getByPlaceholderText('e.g. 1.5'), { target: { value: '2' } });
    fireEvent.change(second.getByPlaceholderText('0.00'), { target: { value: '500' } });
    fireEvent.change(second.getByPlaceholderText('0'), { target: { value: '3' } });
    fireEvent.click(second.getByRole('button', { name: /Shipping details/ }));
    fireEvent.change(second.getByPlaceholderText('Length'), { target: { value: '12' } });
    fireEvent.change(second.getByPlaceholderText('Width'), { target: { value: '10' } });
    fireEvent.change(second.getByPlaceholderText('Height'), { target: { value: '14' } });

    fireEvent.change(container.querySelector('input[accept="image/*"]')!, { target: { files: [new File(['image'], 'vase.png', { type: 'image/png' })] } });
    fireEvent.change(container.querySelector('input[accept=".glb"]')!, { target: { files: [new File(['model'], 'vase.glb', { type: 'model/gltf-binary' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload Product' }));

    await waitFor(() => expect(mocks.insertVariations).toHaveBeenCalledOnce());
    expect(mocks.uploadToR2).toHaveBeenCalledWith(expect.any(File), 'products');
    expect(mocks.uploadToR2).toHaveBeenCalledWith(expect.any(File), 'models');
    expect(mocks.insertProduct).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ancient Vase', stock: 5, image: 'https://files.example/products/uploaded', model3d: 'https://files.example/models/uploaded' }));
    expect(mocks.insertVariations).toHaveBeenCalledWith([
      expect.objectContaining({ product_id: 'product-1', price: 350, stock: 2, product_weight_g: 1500, shipping_length_in: null, shipping_width_in: null, shipping_height_in: null }),
      expect.objectContaining({ product_id: 'product-1', price: 500, stock: 3, product_weight_g: 2000, shipping_length_in: 12, shipping_width_in: 10, shipping_height_in: 14 }),
    ]);
    expect(mocks.recomputeProductStock).toHaveBeenCalledWith('product-1');
  });
});
