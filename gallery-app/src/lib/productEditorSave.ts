import type { ProductVariationDraft } from '../types/adminProducts';
import { normalizeCatalogMeasurement } from './measurements';
import { kgToGrams, positiveInches } from './shipping';

export function productVariationUpdateData(variation: ProductVariationDraft) {
  const productWeightG = kgToGrams(variation.weightKg);
  const packagingWeightG = kgToGrams(variation.packagingWeightKg);
  return {
    dimensions: normalizeCatalogMeasurement(variation.dimensions.trim() || 'N/A', 'in'),
    height: normalizeCatalogMeasurement(variation.height.trim() || 'N/A', 'in'),
    opening_diameter: normalizeCatalogMeasurement(variation.openingDiameter.trim() || 'N/A', 'in'),
    measurement_unit: 'in' as const,
    price: variation.price ? Number(variation.price) : null,
    stock: Number(variation.stock) || 0,
    ...(!variation.id || variation.shippingEdited ? {
      weight_kg: variation.weightKg === '' ? null : Number(variation.weightKg),
      product_weight_g: productWeightG,
      packaging_weight_g: packagingWeightG,
      shipping_weight_g: (productWeightG || 0) + (packagingWeightG || 0) || null,
      shipping_length_in: positiveInches(variation.shippingLengthIn),
      shipping_width_in: positiveInches(variation.shippingWidthIn),
      shipping_height_in: positiveInches(variation.shippingHeightIn),
    } : {}),
  };
}
