import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTACHMENT_TRANSFORM,
  attachmentTotals,
  createAttachmentSelection,
  normalizeAttachmentSelections,
  recipeFitsSocket,
  resolveCatalogAssets,
  selectedSocketIds,
  updateAttachmentPlacement,
  upsertAttachmentSelection,
  type GeneratedAttachmentSocket,
} from '../attachments';
import { GENERATED_ATTACHMENT_RECIPES } from '../generatedAttachmentCatalog';

const left: GeneratedAttachmentSocket = { id: 'left', name: 'Left', family: 'handle', height: 0.5, azimuth: -90, pairGroup: 'pair', maxWidthRatio: 0.3, maxHeightRatio: 0.3 };
const right: GeneratedAttachmentSocket = { ...left, id: 'right', name: 'Right', azimuth: 90 };
const bamboo = GENERATED_ATTACHMENT_RECIPES.find((recipe) => recipe.key === 'bamboo-loop')!;
const square = GENERATED_ATTACHMENT_RECIPES.find((recipe) => recipe.key === 'square-bridge')!;
const roundLoop = GENERATED_ATTACHMENT_RECIPES.find((recipe) => recipe.key === 'round-loop-handle')!;
const asset = { recipe: bamboo, shopId: 'shop-a', priceAdjustment: 100, productionDaysAdjustment: 2 };

describe('generated attachment selections', () => {
  it('resolves active catalog rows and applies shop precedence', () => {
    const result = resolveCatalogAssets(GENERATED_ATTACHMENT_RECIPES, [
      { recipe_key: bamboo.key, active: true, default_price: 80, default_production_days: 1 },
      { recipe_key: square.key, active: false, default_price: 90, default_production_days: 2 },
    ], [{ recipe_key: bamboo.key, shop_id: 'shop-a', enabled: true, price_adjustment: 120, production_days_adjustment: null }], 'shop-a');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ priceAdjustment: 120, productionDaysAdjustment: 1 });
  });

  it('snapshots recipe version, sockets, transforms, and pricing as version 4', () => {
    expect(createAttachmentSelection(asset, [left])).toMatchObject({
      version: 4,
      recipeKey: 'bamboo-loop',
      recipeVersion: 1,
      placements: [{ socket: { id: 'left', height: 0.5, azimuth: -90 }, transform: DEFAULT_ATTACHMENT_TRANSFORM }],
      priceAdjustment: 100,
    });
  });

  it('charges every physical handle but adds production days once', () => {
    expect(attachmentTotals([createAttachmentSelection(asset, [left, right])])).toEqual({ price: 200, productionDays: 2 });
  });

  it('fits Round Loop Handle sockets and prices a left/right pair per physical handle', () => {
    expect(recipeFitsSocket(roundLoop, left)).toBe(true);
    expect(recipeFitsSocket(roundLoop, right)).toBe(true);
    const selection = createAttachmentSelection({ ...asset, recipe: roundLoop }, [left, right]);
    expect(selection.placements.map((placement) => placement.socket.id)).toEqual(['left', 'right']);
    expect(attachmentTotals([selection])).toEqual({ price: 200, productionDays: 2 });
  });

  it('replaces occupied sockets while preserving different sockets', () => {
    const originalLeft = createAttachmentSelection(asset, [left]);
    const originalRight = createAttachmentSelection(asset, [right]);
    const replacement = createAttachmentSelection({ ...asset, recipe: square }, [left]);
    const result = upsertAttachmentSelection([originalLeft, originalRight], replacement);
    expect(result.map((selection) => selection.recipeKey)).toEqual(['bamboo-loop', 'square-bridge']);
    expect([...selectedSocketIds(result)].sort()).toEqual(['left', 'right']);
  });

  it('updates one side of a paired handle independently', () => {
    const selection = createAttachmentSelection(asset, [left, right]);
    const next = updateAttachmentPlacement([selection], selection.id, 'left', { ...DEFAULT_ATTACHMENT_TRANSFORM, twistDegrees: 40 });
    expect(next[0].placements.find((placement) => placement.socket.id === 'left')?.transform.twistDegrees).toBe(40);
    expect(next[0].placements.find((placement) => placement.socket.id === 'right')?.transform.twistDegrees).toBe(0);
  });

  it('fails closed on envelope or family mismatch', () => {
    expect(recipeFitsSocket(bamboo, left)).toBe(true);
    expect(recipeFitsSocket(bamboo, { ...left, maxWidthRatio: 0.05 })).toBe(false);
    expect(recipeFitsSocket(bamboo, { ...left, family: 'body' })).toBe(false);
  });

  it('upgrades version 3 snapshots and round-trips version 4', () => {
    const legacy = {
      version: 3, id: 'legacy', recipeKey: bamboo.key, recipeVersion: 1, name: bamboo.name,
      family: 'handle', shopId: null, slots: [left], priceAdjustment: 50, productionDaysAdjustment: 1,
    };
    const upgraded = normalizeAttachmentSelections([legacy]);
    expect(upgraded[0]).toMatchObject({ version: 4, placements: [{ socket: { id: 'left' }, transform: DEFAULT_ATTACHMENT_TRANSFORM }] });
    expect(normalizeAttachmentSelections(upgraded)).toEqual(upgraded);
    expect(normalizeAttachmentSelections([{ version: 2, id: 'old', points: [] }, { version: 1, id: 'older' }])).toEqual([]);
  });
});
