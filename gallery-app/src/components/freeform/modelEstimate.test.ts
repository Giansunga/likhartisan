import { describe, expect, it } from 'vitest';
import { DEFAULT_DECORATION } from './decor';
import { estimateModelDesign, modelBaseFromRow, type ModelBase } from './modelEstimate';
import type { ShapeParamsInches } from '../../lib/measurements';

const base: ModelBase = { height: 10, bodyWidth: 8, neckWidth: 5, rimSize: 4, price: 1250, productionDays: 5 };
const shape: ShapeParamsInches = { ...base, curvature: 50, unit: 'in' };
const raw = { finish: 'raw_clay' as const, color: '#BE734F' };

function estimate(overrides: Partial<Parameters<typeof estimateModelDesign>[0]> = {}) {
  return estimateModelDesign({ base, shape, material: raw, decoration: DEFAULT_DECORATION, attachmentPrice: 0, attachmentDays: 0, ...overrides });
}

describe('model baseline and mock estimate', () => {
  it('requires every persisted baseline field and accepts positive dimensions beyond the old slider bounds', () => {
    const row = { base_height_in: 10, base_body_width_in: 8, base_neck_width_in: 5,
      base_rim_size_in: 4, base_price_php: 1250, base_production_days: 5 };
    expect(modelBaseFromRow({ ...row, thumbnail: null } as typeof row)).toEqual(base);
    expect(modelBaseFromRow({ ...row, base_price_php: null })).toBeNull();
    expect(modelBaseFromRow({ ...row, base_height_in: 13, base_body_width_in: 14,
      base_neck_width_in: 14, base_rim_size_in: 14 })).toEqual({ ...base, height: 13,
      bodyWidth: 14, neckWidth: 14, rimSize: 14 });
    expect(modelBaseFromRow({ ...row, base_rim_size_in: 0 })).toBeNull();
    expect(modelBaseFromRow({ ...row, base_neck_width_in: 1000 })).toBeNull();
    expect(modelBaseFromRow({ ...row, base_production_days: 0 })).toBeNull();
  });

  it('starts at the entered price and days, then tracks each dimension', () => {
    expect(estimate()).toEqual({ price: 1250, productionDays: 5 });
    expect(estimate({ shape: { ...shape, height: 11, bodyWidth: 9, neckWidth: 6, rimSize: 5 } }))
      .toEqual({ price: 1450, productionDays: 6 });
    expect(estimate({ shape: { ...shape, height: 9, bodyWidth: 7 } }))
      .toEqual({ price: 1110, productionDays: 5 });
  });

  it('applies finish, pattern, and existing attachment adjustments independently', () => {
    expect(estimate({ material: { ...raw, finish: 'glazed' } })).toEqual({ price: 1450, productionDays: 7 });
    expect(estimate({ decoration: { ...DEFAULT_DECORATION, patternId: 'wave', effect: 'engraved', placement: 'full' } }))
      .toEqual({ price: 1550, productionDays: 7 });
    expect(estimate({ attachmentPrice: 99, attachmentDays: 2 })).toEqual({ price: 1349, productionDays: 7 });
    expect(estimate({ decoration: DEFAULT_DECORATION })).toEqual({ price: 1250, productionDays: 5 });
  });

  it('floors a smaller design at half the base price and one day', () => {
    expect(estimate({ base: { ...base, height: 20, bodyWidth: 16, neckWidth: 12, rimSize: 10, productionDays: 1 },
      shape: { ...shape, height: 2, bodyWidth: 2, neckWidth: 1, rimSize: 1 } }))
      .toEqual({ price: 625, productionDays: 1 });
  });
});
