import type { DecorationParams } from './decor';
import type { MaterialParams } from './materials';
import type { ShapeParamsInches } from '../../lib/measurements';

export type ModelBase = {
  height: number;
  bodyWidth: number;
  neckWidth: number;
  rimSize: number;
  price: number;
  productionDays: number;
};

export type ModelBaseColumns = {
  base_height_in: number | null;
  base_body_width_in: number | null;
  base_neck_width_in: number | null;
  base_rim_size_in: number | null;
  base_price_php: number | null;
  base_production_days: number | null;
};

export const MODEL_DIMENSION_LIMITS = {
  height: [2, 20],
  bodyWidth: [2, 16],
  neckWidth: [1, 12],
  rimSize: [1, 10],
} as const;

export function modelBaseFromRow(row: Partial<ModelBaseColumns> | null | undefined): ModelBase | null {
  if (!row) return null;
  const base: ModelBase = {
    height: Number(row.base_height_in),
    bodyWidth: Number(row.base_body_width_in),
    neckWidth: Number(row.base_neck_width_in),
    rimSize: Number(row.base_rim_size_in),
    price: Number(row.base_price_php),
    productionDays: Number(row.base_production_days),
  };
  if ([row.base_height_in, row.base_body_width_in, row.base_neck_width_in, row.base_rim_size_in,
    row.base_price_php, row.base_production_days].some((value) => value == null)) return null;
  for (const key of Object.keys(MODEL_DIMENSION_LIMITS) as Array<keyof typeof MODEL_DIMENSION_LIMITS>) {
    const [min, max] = MODEL_DIMENSION_LIMITS[key];
    if (!Number.isFinite(base[key]) || base[key] < min || base[key] > max) return null;
  }
  return Number.isFinite(base.price) && base.price > 0 && Number.isInteger(base.productionDays)
    && base.productionDays >= 1 && base.productionDays <= 365 ? base : null;
}

export function estimateModelDesign(input: {
  base: ModelBase;
  shape: ShapeParamsInches;
  material: MaterialParams;
  decoration: DecorationParams;
  attachmentPrice: number;
  attachmentDays: number;
}) {
  const { base, shape, material, decoration } = input;
  const heightDelta = shape.height - base.height;
  const widthDelta = shape.bodyWidth - base.bodyWidth;
  const shapePrice = heightDelta * 80 + widthDelta * 60
    + (shape.neckWidth - base.neckWidth) * 30 + (shape.rimSize - base.rimSize) * 30;
  const finishPrice = material.finish === 'glazed' ? 200
    : material.finish === 'acrylic_paint' ? 100
      : material.finish === 'water_paint' ? 50 : 0;
  const finishDays = material.finish === 'glazed' ? 2
    : material.finish === 'acrylic_paint' || material.finish === 'water_paint' ? 1 : 0;
  const hasPattern = Boolean(decoration.patternId);
  const patternPrice = hasPattern
    ? (decoration.effect === 'engraved' ? 250 : 150) + (decoration.placement === 'full' ? 50 : 0)
    : 0;
  return {
    price: Math.round(Math.max(base.price / 2, base.price + shapePrice) + finishPrice + patternPrice + input.attachmentPrice),
    productionDays: Math.max(1, base.productionDays + Math.ceil((Math.max(0, heightDelta) + Math.max(0, widthDelta)) / 2)
      + finishDays + (hasPattern ? 1 : 0) + (hasPattern && decoration.effect === 'engraved' ? 1 : 0)
      + input.attachmentDays),
  };
}
