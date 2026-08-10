import type { GeneratedAttachmentRecipe } from './generatedAttachmentCatalog';

export type AttachmentFamily = 'handle' | 'body' | 'neck';

export type GeneratedAttachmentSocket = {
  id: string;
  name: string;
  family: AttachmentFamily;
  height: number;
  azimuth: number;
  pairGroup: string | null;
  maxWidthRatio: number;
  maxHeightRatio: number;
};

export type AttachmentSocketSnapshot = Pick<GeneratedAttachmentSocket, 'id' | 'name' | 'family' | 'height' | 'azimuth' | 'pairGroup'>;

export type AttachmentPlacementTransform = {
  horizontalDegrees: number;
  verticalRatio: number;
  surfaceOffsetRatio: number;
  twistDegrees: number;
  scaleMultiplier: number;
  thicknessMultiplier: number;
};

export const MIN_HANDLE_THICKNESS = 0.5;
export const MAX_HANDLE_THICKNESS = 1.5;

export function clampHandleThickness(value: unknown) {
  const thickness = finiteNumber(value, 1);
  return Math.min(MAX_HANDLE_THICKNESS, Math.max(MIN_HANDLE_THICKNESS, thickness));
}

export type AttachmentPlacement = {
  socket: AttachmentSocketSnapshot;
  transform: AttachmentPlacementTransform;
};

export const DEFAULT_ATTACHMENT_TRANSFORM: AttachmentPlacementTransform = {
  horizontalDegrees: 0,
  verticalRatio: 0,
  surfaceOffsetRatio: 0.006,
  twistDegrees: 0,
  scaleMultiplier: 1,
  thicknessMultiplier: 1,
};

export function getDefaultAttachmentTransform(family: AttachmentFamily): AttachmentPlacementTransform {
  return {
    ...DEFAULT_ATTACHMENT_TRANSFORM,
    verticalRatio: family === 'handle' ? -0.035 : DEFAULT_ATTACHMENT_TRANSFORM.verticalRatio,
  };
}

export type CatalogSettingsRecord = {
  recipe_key: string;
  active: boolean;
  default_price: number | null;
  default_production_days: number | null;
};

export type ShopOverrideRecord = {
  recipe_key: string;
  shop_id: string;
  enabled: boolean;
  price_adjustment: number | null;
  production_days_adjustment: number | null;
};

export type GeneratedAttachmentAsset = {
  recipe: GeneratedAttachmentRecipe;
  shopId: string | null;
  priceAdjustment: number;
  productionDaysAdjustment: number;
};

export type GeneratedAttachmentSelection = {
  version: 4;
  id: string;
  recipeKey: string;
  recipeVersion: number;
  name: string;
  family: AttachmentFamily;
  shopId: string | null;
  placements: AttachmentPlacement[];
  priceAdjustment: number;
  productionDaysAdjustment: number;
};

export type AttachmentSelection = GeneratedAttachmentSelection;

export const ATTACHMENT_FAMILIES: { id: AttachmentFamily; label: string }[] = [
  { id: 'handle', label: 'Handles' },
  { id: 'body', label: 'Body Attachments' },
  { id: 'neck', label: 'Neck Attachments' },
];

function finiteNumber(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampTransform(raw: Partial<AttachmentPlacementTransform> | null | undefined): AttachmentPlacementTransform {
  return {
    horizontalDegrees: finiteNumber(raw?.horizontalDegrees, 0),
    verticalRatio: finiteNumber(raw?.verticalRatio, 0),
    surfaceOffsetRatio: finiteNumber(raw?.surfaceOffsetRatio, DEFAULT_ATTACHMENT_TRANSFORM.surfaceOffsetRatio),
    twistDegrees: finiteNumber(raw?.twistDegrees, 0),
    scaleMultiplier: finiteNumber(raw?.scaleMultiplier, 1),
    thicknessMultiplier: clampHandleThickness(raw?.thicknessMultiplier),
  };
}

export function resolveCatalogAssets(recipes: GeneratedAttachmentRecipe[], settings: CatalogSettingsRecord[], overrides: ShopOverrideRecord[], shopId: string | null) {
  const settingsByKey = new Map(settings.map((setting) => [setting.recipe_key, setting]));
  const overridesByKey = new Map(overrides.filter((override) => override.shop_id === shopId).map((override) => [override.recipe_key, override]));
  return recipes.reduce<GeneratedAttachmentAsset[]>((assets, recipe) => {
    const setting = settingsByKey.get(recipe.key);
    if (!setting?.active) return assets;
    const override = shopId ? overridesByKey.get(recipe.key) : undefined;
    if (override && !override.enabled) return assets;
    assets.push({
      recipe,
      shopId,
      priceAdjustment: finiteNumber(override?.price_adjustment, finiteNumber(setting.default_price, 0)),
      productionDaysAdjustment: finiteNumber(override?.production_days_adjustment, finiteNumber(setting.default_production_days, 0)),
    });
    return assets;
  }, []);
}

export function recipeFitsSocket(recipe: GeneratedAttachmentRecipe, socket: GeneratedAttachmentSocket, scaleMultiplier = 1) {
  return recipe.family === socket.family
    && recipe.envelope.width * recipe.scaleRatio * scaleMultiplier <= socket.maxWidthRatio
    && recipe.envelope.height * recipe.scaleRatio * scaleMultiplier <= socket.maxHeightRatio;
}

export function createAttachmentSelection(asset: GeneratedAttachmentAsset, sockets: GeneratedAttachmentSocket[]): AttachmentSelection {
  const orderedSockets = [...sockets].sort((a, b) => a.name.localeCompare(b.name));
  return {
    version: 4,
    id: `${asset.recipe.key}@${asset.recipe.version}:${orderedSockets.map((socket) => socket.id).join('+')}`,
    recipeKey: asset.recipe.key,
    recipeVersion: asset.recipe.version,
    name: asset.recipe.name,
    family: asset.recipe.family,
    shopId: asset.shopId,
    placements: orderedSockets.map(({ id, name, family, height, azimuth, pairGroup }) => ({
      socket: { id, name, family, height, azimuth, pairGroup },
      transform: getDefaultAttachmentTransform(family),
    })),
    priceAdjustment: asset.priceAdjustment,
    productionDaysAdjustment: asset.productionDaysAdjustment,
  };
}

export function selectedSocketIds(selections: AttachmentSelection[]) {
  return new Set(selections.flatMap((selection) => selection.placements.map((placement) => placement.socket.id)));
}

export function upsertAttachmentSelection(selections: AttachmentSelection[], next: AttachmentSelection) {
  const nextSocketIds = new Set(next.placements.map((placement) => placement.socket.id));
  return [...selections.filter((selection) => !selection.placements.some((placement) => nextSocketIds.has(placement.socket.id))), next];
}

export function updateAttachmentPlacement(selections: AttachmentSelection[], selectionId: string, socketId: string, transform: AttachmentPlacementTransform) {
  return selections.map((selection) => selection.id !== selectionId ? selection : {
    ...selection,
    version: 4 as const,
    placements: selection.placements.map((placement) => placement.socket.id === socketId ? { ...placement, transform: clampTransform(transform) } : placement),
  });
}

export function updateHandleThickness(selections: AttachmentSelection[], selectionId: string, thicknessMultiplier: number) {
  const thickness = clampHandleThickness(thicknessMultiplier);
  return selections.map((selection) => selection.id !== selectionId || selection.family !== 'handle' ? selection : {
    ...selection,
    version: 4 as const,
    placements: selection.placements.map((placement) => ({
      ...placement,
      transform: clampTransform({ ...placement.transform, thicknessMultiplier: thickness }),
    })),
  });
}

export function attachmentTotals(selections: AttachmentSelection[]) {
  return {
    price: selections.reduce((total, selection) => total + selection.priceAdjustment * selection.placements.length, 0),
    productionDays: selections.reduce((total, selection) => total + selection.productionDaysAdjustment, 0),
  };
}

function normalizeSocket(rawValue: unknown, family: AttachmentFamily): AttachmentSocketSnapshot | null {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, unknown> : null;
  if (!raw || !raw.id || !raw.name) return null;
  return {
    id: String(raw.id), name: String(raw.name), family,
    height: finiteNumber(raw.height, 0.5), azimuth: finiteNumber(raw.azimuth, 0),
    pairGroup: raw.pairGroup ? String(raw.pairGroup) : null,
  };
}

export function normalizeAttachmentSelections(input: unknown): AttachmentSelection[] {
  if (!Array.isArray(input)) return [];
  return input.reduce<AttachmentSelection[]>((result, rawValue) => {
    const raw = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, unknown> : null;
    if (!raw || (raw.version !== 3 && raw.version !== 4) || !raw.recipeKey || !raw.recipeVersion || !raw.name) return result;
    const family = raw.family;
    if (family !== 'handle' && family !== 'body' && family !== 'neck') return result;

    let placements: AttachmentPlacement[] = [];
    if (raw.version === 4 && Array.isArray(raw.placements)) {
      placements = raw.placements.reduce<AttachmentPlacement[]>((placementResult, placementValue) => {
        const placement = placementValue && typeof placementValue === 'object' ? placementValue as Record<string, unknown> : null;
        const socket = normalizeSocket(placement?.socket, family);
        if (socket) placementResult.push({ socket, transform: clampTransform(placement?.transform as Partial<AttachmentPlacementTransform> | undefined) });
        return placementResult;
      }, []);
    } else if (raw.version === 3 && Array.isArray(raw.slots)) {
      placements = raw.slots.reduce<AttachmentPlacement[]>((placementResult, socketValue) => {
        const socket = normalizeSocket(socketValue, family);
        if (socket) placementResult.push({ socket, transform: getDefaultAttachmentTransform(family) });
        return placementResult;
      }, []);
    }
    if (!placements.length) return result;

    result.push({
      version: 4,
      id: String(raw.id || `${raw.recipeKey}@${raw.recipeVersion}:${placements.map((placement) => placement.socket.id).join('+')}`),
      recipeKey: String(raw.recipeKey), recipeVersion: finiteNumber(raw.recipeVersion, 1), name: String(raw.name), family,
      shopId: raw.shopId ? String(raw.shopId) : null, placements,
      priceAdjustment: finiteNumber(raw.priceAdjustment, 0), productionDaysAdjustment: finiteNumber(raw.productionDaysAdjustment, 0),
    });
    return result;
  }, []);
}

export type AttachmentParams = AttachmentSelection;
