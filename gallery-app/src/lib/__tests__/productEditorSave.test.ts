import { describe, expect, it } from 'vitest';
import type { ProductVariationDraft } from '../../types/adminProducts';
import { productVariationUpdateData } from '../productEditorSave';

const variation: ProductVariationDraft = {
  id: 'variation-1', dimensions: '6 in x 4 in', height: '8 in', openingDiameter: '3 in',
  weightKg: '0.4', packagingWeightKg: '0.1', shippingLengthIn: '10', shippingWidthIn: '8', shippingHeightIn: '12',
  price: '500', stock: '2',
};

describe('productVariationUpdateData', () => {
  it('leaves saved shipping columns untouched for ordinary edits', () => {
    const update = productVariationUpdateData(variation);
    expect(update).toEqual(expect.objectContaining({ price: 500, stock: 2 }));
    expect(update).not.toHaveProperty('product_weight_g');
    expect(update).not.toHaveProperty('shipping_weight_g');
    expect(update).not.toHaveProperty('shipping_length_in');
  });

  it('writes required weight without optional package fields for a new variation', () => {
    const update = productVariationUpdateData({ ...variation, id: undefined, weightKg: '1.2', packagingWeightKg: '', shippingLengthIn: '', shippingWidthIn: '', shippingHeightIn: '' });
    expect(update).toEqual(expect.objectContaining({ product_weight_g: 1200, shipping_weight_g: 1200 }));
    for (const key of ['packaging_weight_g', 'shipping_length_in', 'shipping_width_in', 'shipping_height_in']) expect(update).not.toHaveProperty(key);
  });

  it('can repair missing weight on an existing variation', () => {
    const update = productVariationUpdateData({ ...variation, shippingEdited: true });
    expect(update).toEqual(expect.objectContaining({ product_weight_g: 400, shipping_weight_g: 500 }));
  });

  it('updates edited weight and retains saved package data', () => {
    const update = productVariationUpdateData({ ...variation, weightKg: '1.2', shippingEdited: true });
    expect(update).toEqual(expect.objectContaining({ weight_kg: 1.2, product_weight_g: 1200, shipping_weight_g: 1300 }));
    for (const key of ['packaging_weight_g', 'shipping_length_in', 'shipping_width_in', 'shipping_height_in']) expect(update).not.toHaveProperty(key);
    expect(variation).toEqual(expect.objectContaining({ packagingWeightKg: '0.1', shippingLengthIn: '10', shippingWidthIn: '8', shippingHeightIn: '12' }));
  });
});
