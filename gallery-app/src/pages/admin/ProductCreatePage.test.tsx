import ArtisanProductCreatePage from '../artisan/ArtisanProductCreatePage';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductCreatePage from './ProductCreatePage';

const mocks = vi.hoisted(() => ({
  insertProduct: vi.fn(),
  insertVariations: vi.fn(),
  uploadToR2: vi.fn(),
  recomputeProductStock: vi.fn(),
  refreshProducts: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => table === 'shops'
      ? { select: () => ({ order: async () => ({ data: [{ id: 'shop-1', name: 'Clay Studio', email: 'shop@example.com' }, { id: 'shop-2', name: 'Second Studio', email: 'second@example.com' }] }) }) }
      : table === 'artisans'
        ? { select: () => ({ eq: (_key: string, shopId: string) => ({ order: async () => ({ data: shopId === 'shop-1' ? [{ id: 'artisan-1', shop_id: 'shop-1', name: 'Juan Dela Cruz', specialty: 'Master Potter' }] : [{ id: 'artisan-2', shop_id: 'shop-2', name: 'Ana', specialty: 'Potter' }], error: null }), eq: () => ({ single: async () => ({ data: { id: 'artisan-1' }, error: null }) }) }) }) }
      : table === 'products'
        ? { insert: (row: unknown) => { mocks.insertProduct(row); return { select: () => ({ single: async () => ({ data: { id: 'product-1' }, error: null }) }) }; } }
        : { insert: async (rows: unknown) => { mocks.insertVariations(rows); return { error: null }; } },
  },
}));
vi.mock('../../components/artisan/artisanContextValue', () => ({ useArtisanPortal: () => ({ shop: { id: 'shop-1', name: 'Clay Studio' }, refreshProducts: mocks.refreshProducts }) }));
vi.mock('../../lib/r2', () => ({ uploadToR2: mocks.uploadToR2 }));
vi.mock('../../lib/stockSync', () => ({ recomputeProductStock: mocks.recomputeProductStock }));
vi.mock('../../realtime/usePortalRealtimeRefresh', () => ({ usePortalRealtimeRefresh: () => undefined }));

function renderPage(artisan = false) {
  return render(<MemoryRouter initialEntries={[artisan ? '/artisan-dashboard/listings/create' : '/admin/products/create']}><Routes>
    <Route path="/artisan-dashboard/listings/create" element={<ArtisanProductCreatePage />} />
    <Route path="/artisan-dashboard/listings" element={<p>Artisan listings</p>} />
    <Route path="/admin/products/create" element={<ProductCreatePage />} />
    <Route path="/admin/products" element={<p>Product list</p>} />
  </Routes></MemoryRouter>);
}

function variationCard(number: number) {
  return screen.getByText(`Variation ${number}`).parentElement!.parentElement!;
}

describe('admin product upload form', () => {
  it('clears the artisan when switching shops and blocks upload without an artisan', async () => {
    const { container } = renderPage();
    await screen.findByRole('option', { name: 'Clay Studio' });
    const shop = container.querySelector('select[name="shopId"]')!;
    fireEvent.change(shop, { target: { value: 'shop-1' } });
    await screen.findByRole('option', { name: 'Juan Dela Cruz' });
    const artisan = screen.getByRole('combobox', { name: 'Featured Artisan *' });
    fireEvent.change(artisan, { target: { value: 'artisan-1' } });
    fireEvent.change(shop, { target: { value: 'shop-2' } });
    await screen.findByRole('option', { name: 'Ana' });
    expect(artisan).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'Juan Dela Cruz' })).not.toBeInTheDocument();
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByText('Select a Featured Artisan for this shop.')).toBeInTheDocument();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
    expect(mocks.insertProduct).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadToR2.mockImplementation(async (_file: File, folder: string) => `https://files.example/${folder}/uploaded`);
    mocks.recomputeProductStock.mockResolvedValue(5);
    mocks.refreshProducts.mockResolvedValue(undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
  });

  it('starts with required weight and product dimensions without optional shipping fields', () => {
    renderPage();
    expect(screen.getAllByRole('option').slice(1, 6).map(option => option.textContent)).toEqual(['Vases', 'Planters', 'Jars', 'Decorative Pieces', 'Others']);
    expect(screen.queryByRole('option', { name: /Bowls|Teapots|Plates/ })).not.toBeInTheDocument();
    expect(screen.getByText('Variation 1')).toBeInTheDocument();
    expect(within(variationCard(1)).getByRole('spinbutton', { name: 'Product weight (kg) *' })).toBeRequired();
    expect(within(variationCard(1)).getByRole('spinbutton', { name: 'Product weight (kg) *' })).toHaveValue(null);
    expect(screen.queryByRole('button', { name: /Shipping details/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Packaging weight (kg)')).not.toBeInTheDocument();
    expect(screen.queryByText('Packed length (in)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload Product' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add New Variation' }));
    expect(screen.getByText('Variation 2')).toBeInTheDocument();
    expect(within(variationCard(2)).getByRole('spinbutton', { name: 'Product weight (kg) *' })).toBeRequired();
    fireEvent.click(within(variationCard(2)).getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('Variation 2')).not.toBeInTheDocument();

    fireEvent.click(within(variationCard(1)).getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('No variations added yet. Add a variation below.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add New Variation' }));
    expect(screen.getByText('Variation 1')).toBeInTheDocument();
  });

  it('saves image, model, catalog dimensions, stock, and required weight for two variations', async () => {
    const { container } = renderPage();
    await screen.findByRole('option', { name: 'Clay Studio' });
    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: 'Ancient Vase' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Tags (optional)' }), { target: { value: ' Rustic, CLAY, clay ' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Tags (optional)' }), { target: { value: ' Hand   made ' } });
    fireEvent.change(container.querySelector('select[name="category"]')!, { target: { value: 'Vases' } });
    fireEvent.change(container.querySelector('select[name="shopId"]')!, { target: { value: 'shop-1' } });
    await screen.findByRole('option', { name: 'Juan Dela Cruz' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Featured Artisan *' }), { target: { value: 'artisan-1' } });

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
    fireEvent.change(screen.getByLabelText('Product image'), { target: { files: [new File(['image'], 'vase.png', { type: 'image/png' })] } });
    fireEvent.change(container.querySelector('input[accept=".glb"]')!, { target: { files: [new File(['model'], 'vase.glb', { type: 'model/gltf-binary' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload Product' }));

    await waitFor(() => expect(mocks.insertVariations).toHaveBeenCalledOnce());
    expect(mocks.uploadToR2).toHaveBeenCalledWith(expect.any(File), 'products');
    expect(mocks.uploadToR2).toHaveBeenCalledWith(expect.any(File), 'models');
    expect(mocks.insertProduct).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ancient Vase', stock: 5, image: 'https://files.example/products/uploaded', model3d: 'https://files.example/models/uploaded' }));
    expect(mocks.insertVariations).toHaveBeenCalledWith([
      expect.objectContaining({ product_id: 'product-1', price: 350, stock: 2, product_weight_g: 1500, shipping_weight_g: 1500 }),
      expect.objectContaining({ product_id: 'product-1', price: 500, stock: 3, product_weight_g: 2000, shipping_weight_g: 2000 }),
    ]);
    expect(mocks.insertProduct).toHaveBeenCalledWith(expect.objectContaining({ featured_artisan_id: 'artisan-1', tags: ['rustic', 'clay', 'hand made'] }));
    for (const row of mocks.insertVariations.mock.calls[0][0]) {
      for (const key of ['packaging_weight_g', 'shipping_length_in', 'shipping_width_in', 'shipping_height_in']) expect(row).not.toHaveProperty(key);
    }
    expect(mocks.recomputeProductStock).toHaveBeenCalledWith('product-1');
  });
  it('locks artisan creation to the portal shop, uploads with shop scope and refreshes listings', async () => {
    const { container } = renderPage(true);
    expect(screen.queryByRole('combobox', { name: 'Assign to Shop' })).not.toBeInTheDocument();
    expect(screen.queryByText('Assign to Shop')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Shipping details/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Packaging weight (kg)')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Second Studio' })).not.toBeInTheDocument();
    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: 'Artisan Vase' } });
    fireEvent.change(container.querySelector('select[name="category"]')!, { target: { value: 'Vases' } });
    await screen.findByRole('option', { name: 'Juan Dela Cruz' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Featured Artisan *' }), { target: { value: 'artisan-1' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 6 in × 4 in'), { target: { value: '6 in x 4 in' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 8 in'), { target: { value: '8 in' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1.5'), { target: { value: '1.5' } });
    const model = new File(['model'], 'pot.glb');
    fireEvent.change(screen.getByLabelText('3D model'), { target: { files: [model] } });
    fireEvent.submit(container.querySelector('form')!);
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByText('Artisan listings')).toBeInTheDocument();
    expect(mocks.uploadToR2).toHaveBeenCalledWith(model, 'models', { shopId: 'shop-1' });
    expect(mocks.insertProduct).toHaveBeenCalledOnce();
    expect(mocks.insertProduct).toHaveBeenCalledWith(expect.objectContaining({ shop_id: 'shop-1', featured_artisan_id: 'artisan-1', name: 'Artisan Vase' }));
    expect(mocks.insertVariations).toHaveBeenCalledOnce();
    expect(mocks.refreshProducts).toHaveBeenCalledOnce();
  });

  it('preserves the artisan draft after an upload failure and allows retry', async () => {
    mocks.uploadToR2.mockRejectedValueOnce(new Error('Upload unavailable'));
    const { container } = renderPage(true);
    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: 'Keep this draft' } });
    fireEvent.change(container.querySelector('select[name="category"]')!, { target: { value: 'Vases' } });
    await screen.findByRole('option', { name: 'Juan Dela Cruz' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Featured Artisan *' }), { target: { value: 'artisan-1' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 6 in × 4 in'), { target: { value: '6 in x 4 in' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 8 in'), { target: { value: '8 in' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1.5'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('3D model'), { target: { files: [new File(['model'], 'pot.glb')] } });
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload unavailable');
    expect(container.querySelector('input[name="name"]')).toHaveValue('Keep this draft');
    expect(screen.getAllByText('pot.glb').length).toBeGreaterThan(0);
    expect(mocks.insertProduct).not.toHaveBeenCalled();
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByText('Artisan listings')).toBeInTheDocument();
    expect(mocks.insertProduct).toHaveBeenCalledOnce();
  });

  it('rejects invalid files before uploading and keeps the existing draft', async () => {
    renderPage(true);
    fireEvent.change(screen.getByLabelText('3D model'), { target: { files: [new File(['x'], 'pot.obj')] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a .glb');
    const oversized = new File(['x'], 'image.png'); Object.defineProperty(oversized, 'size', { value: 5 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText('Product image'), { target: { files: [oversized] } });
    expect(screen.getByRole('alert')).toHaveTextContent('5 MB');
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

});
