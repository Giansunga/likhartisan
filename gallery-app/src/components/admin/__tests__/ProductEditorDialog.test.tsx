import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductEditorDialog from '../ProductEditorDialog';
import type { Product } from '../../../types';

const mocks = vi.hoisted(() => ({ variations: [] as Record<string, unknown>[] }));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({ select: () => ({ eq: () => ({ order: async () => ({ data: table === 'artisans' ? [{ id: 'artisan-1', shop_id: 'shop-1', name: 'Juan Dela Cruz', specialty: 'Master Potter' }] : mocks.variations, error: null }) }) }) }),
  },
}));

const product: Product = {
  id: 'product-1', name: 'Pet Bowl', description: '', category: 'Others', price: 450, stock: 2, inStock: true,
  image: '/product.png', materials: 'Clay', dimensions: '', height: '', openingDiameter: '', technique: 'Handmade',
  featuredArtisanId: 'artisan-1', shopId: 'shop-1', shopName: 'Test Shop', status: 'active', views: 8, ratingAvg: 0, ratingCount: 0,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};

function variationCard(number: number) {
  return screen.getByText(`Variation ${number}`).closest('article')!;
}

describe('ProductEditorDialog', () => {
  it('loads tags, saves pending changes, restores persisted tags and allows clearing', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ProductEditorDialog product={{ ...product, tags: ['Clay', 'rustic'] }} onClose={vi.fn()} onSave={onSave} />);
    await screen.findByText('Variation 1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag rustic' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Tags (optional)' }), { target: { value: ' Floral ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][1].tags).toEqual(['clay', 'floral']);
    rerender(<ProductEditorDialog product={{ ...product, tags: onSave.mock.calls[0][1].tags }} onClose={vi.fn()} onSave={onSave} />);
    await screen.findByText('Variation 1');
    expect(screen.getByRole('button', { name: 'Remove tag floral' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag clay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag floral' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][1].tags).toEqual([]);
  });

  it('blocks saving overlong tags before calling the save handler', async () => {
    const onSave = vi.fn();
    render(<ProductEditorDialog product={product} onClose={vi.fn()} onSave={onSave} />);
    await screen.findByText('Variation 1');
    fireEvent.change(screen.getByRole('textbox', { name: 'Tags (optional)' }), { target: { value: 'a'.repeat(41) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('40 characters');
    expect(onSave).not.toHaveBeenCalled();
  });
  it('requires an artisan for legacy products and preselects saved assignments', async () => {
    const onSave = vi.fn();
    const { rerender } = render(<ProductEditorDialog product={{ ...product, featuredArtisanId: undefined }} onClose={vi.fn()} onSave={onSave} />);
    await screen.findByRole('option', { name: 'Juan Dela Cruz' });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('Select a Featured Artisan for this shop.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    rerender(<ProductEditorDialog product={product} onClose={vi.fn()} onSave={onSave} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Featured Artisan *' })).toHaveValue('artisan-1'));
  });

  beforeEach(() => {
    mocks.variations = [{ id: 'variation-1', dimensions: '6 in x 4 in', height: '8 in', opening_diameter: '3 in', measurement_unit: 'in', product_weight_g: 400, packaging_weight_g: 100, shipping_length_in: 10, shipping_width_in: 8, shipping_height_in: 12, price: 450, stock: 2 }];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('shows saved editable weight while retaining untouched shipping values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<ProductEditorDialog product={product} onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByRole('heading', { name: 'Product Specifications' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Media Upload' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Variations' })).toBeInTheDocument();
    expect(within(screen.getByRole('combobox', { name: 'Category' })).getAllByRole('option').slice(1).map(option => option.textContent)).toEqual(['Vases', 'Planters', 'Jars', 'Decorative Pieces', 'Others']);
    const card = await screen.findByText('Variation 1').then(() => variationCard(1));
    expect(within(card).getByRole('spinbutton', { name: /Product weight/ })).toHaveValue(0.4);
    expect(within(card).getByRole('spinbutton', { name: /Product weight/ })).toBeRequired();
    expect(within(card).queryByText('Optional packed details')).not.toBeInTheDocument();
    expect(within(card).getAllByRole('textbox')).toHaveLength(3);
    fireEvent.change(within(card).getByRole('spinbutton', { name: 'Price' }), { target: { value: '500' } });
    fireEvent.change(container.querySelector('input[accept="image/jpeg,image/png"]')!, { target: { files: [new File(['image'], 'bowl.png', { type: 'image/png' })] } });
    fireEvent.change(container.querySelector('input[accept=".glb,model/gltf-binary"]')!, { target: { files: [new File(['model'], 'bowl.glb', { type: 'model/gltf-binary' })] } });
    expect(screen.getByText('bowl.png')).toBeInTheDocument();
    expect(screen.getAllByText('bowl.glb')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][1].variations[0]).toEqual(expect.objectContaining({
      id: 'variation-1', weightKg: '0.4', packagingWeightKg: '0.1', shippingLengthIn: '10', shippingWidthIn: '8', shippingHeightIn: '12', price: '500',
    }));
    expect(onSave.mock.calls[0][1].variations[0].shippingEdited).toBe(false);
    expect(onSave.mock.calls[0][1].imageFile).toEqual(expect.objectContaining({ name: 'bowl.png' }));
    expect(onSave.mock.calls[0][1].modelFile).toEqual(expect.objectContaining({ name: 'bowl.glb' }));
  });

  it('requires weight on a new variation and preserves the discard prompt', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ProductEditorDialog product={product} onClose={onClose} onSave={onSave} />);
    await screen.findByText('Variation 1');
    fireEvent.click(screen.getByRole('button', { name: 'Add Variation' }));
    const card = variationCard(2);
    expect(within(card).getByRole('spinbutton', { name: 'Product weight (kg) *' })).toBeInTheDocument();
    expect(within(card).getByText('Optional packed details')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('needs product weight');
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(within(card).getByRole('textbox', { name: 'Dimensions (in)' }), { target: { value: '9 in x 7 in' } });
    fireEvent.change(within(card).getByRole('textbox', { name: 'Height (in)' }), { target: { value: '11 in' } });
    fireEvent.change(within(card).getByRole('spinbutton', { name: 'Product weight (kg) *' }), { target: { value: '1.2' } });
    fireEvent.change(within(card).getByRole('spinbutton', { name: 'Stock' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][1].variations[1]).toEqual(expect.objectContaining({ weightKg: '1.2', shippingEdited: true, dimensions: '9 in x 7 in', height: '11 in' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('offers a weight repair field for an existing variation that lacks weight', async () => {
    mocks.variations[0] = { ...mocks.variations[0], product_weight_g: null };
    render(<ProductEditorDialog product={product} onClose={vi.fn()} onSave={vi.fn()} />);
    await screen.findByText('Variation 1');
    expect(within(variationCard(1)).getByRole('spinbutton', { name: 'Product weight (kg) *' })).toHaveValue(null);
  });

  it('loads legacy kilogram weight when gram weight is missing', async () => {
    mocks.variations[0] = { ...mocks.variations[0], product_weight_g: null, weight_kg: 2.5 };
    render(<ProductEditorDialog product={product} onClose={vi.fn()} onSave={vi.fn()} />);
    await screen.findByText('Variation 1');
    expect(within(variationCard(1)).getByRole('spinbutton', { name: /Product weight/ })).toHaveValue(2.5);
  });

  it('edits saved weight while preserving packaging and packed dimensions', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProductEditorDialog product={product} onClose={vi.fn()} onSave={onSave} />);
    await screen.findByText('Variation 1');
    fireEvent.change(within(variationCard(1)).getByRole('spinbutton', { name: /Product weight/ }), { target: { value: '1.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][1].variations[0]).toEqual(expect.objectContaining({ weightKg: '1.2', shippingEdited: true, packagingWeightKg: '0.1', shippingLengthIn: '10', shippingWidthIn: '8', shippingHeightIn: '12' }));
  });

  it.each(['', '0', '-1'])('blocks saving invalid weight %j', async (value) => {
    const onSave = vi.fn();
    render(<ProductEditorDialog product={product} onClose={vi.fn()} onSave={onSave} />);
    await screen.findByText('Variation 1');
    fireEvent.change(within(variationCard(1)).getByRole('spinbutton', { name: /Product weight/ }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('needs product weight');
    expect(onSave).not.toHaveBeenCalled();
  });
});
