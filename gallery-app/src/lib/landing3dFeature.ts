import { modelBaseFromRow, type ModelBaseColumns } from '../components/freeform/modelEstimate';
import { DEFAULT_DECORATION, getPattern, type DecorationParams } from '../components/freeform/decor';
import { FINISH_DEFINITIONS, getAvailableFinishes, isFinishId, normalizeMaterialParams, type MaterialParams } from '../components/freeform/materials';
import { normalizeAttachmentSelections, type AttachmentSelection } from '../components/freeform/attachments';
import { shapeFromModelBase, type ShapeParamsInches } from './measurements';

export type LandingModel = ModelBaseColumns & {
  id: string;
  name: string;
  category: string;
  file_url: string;
  thumbnail: string | null;
  shop_id: string | null;
  status: string;
};

export type LandingLook = {
  shape: ShapeParamsInches;
  material: MaterialParams;
  decoration: DecorationParams;
  attachments: AttachmentSelection[];
};

export type LandingStages = {
  start: LandingLook;
  shape: LandingLook;
  finishOne: LandingLook;
  finishTwo: LandingLook;
  decorate: LandingLook;
  details: LandingLook;
};

export type LandingFeature = { version: 1; stages: LandingStages };

export function isEligibleLandingModel(model: LandingModel | null | undefined): model is LandingModel {
  if (!model || model.status !== 'active' || !model.shop_id || !modelBaseFromRow(model)) return false;
  try {
    const file = new URL(model.file_url);
    return ['http:', 'https:'].includes(file.protocol) && /\.(glb|gltf)$/i.test(file.pathname);
  } catch {
    return false;
  }
}

export function createLandingFeature(model: LandingModel, shopName?: string): LandingFeature {
  const base = modelBaseFromRow(model);
  if (!base) throw new Error('The selected model needs complete base measurements.');
  const originalShape = shapeFromModelBase(base);
  const changedShape: ShapeParamsInches = {
    ...originalShape,
    height: Math.min(999.99, base.height * 1.1),
    bodyWidth: Math.min(999.99, base.bodyWidth * 1.2),
    curvature: 75,
  };
  const available = getAvailableFinishes(shopName);
  const firstFinish = available.find((finish) => finish.id === 'glazed')
    || available.find((finish) => finish.id !== 'raw_clay') || FINISH_DEFINITIONS.raw_clay;
  const secondFinish = available.find((finish) => finish.id === 'matte')
    || available.find((finish) => finish.id !== 'raw_clay' && finish.id !== firstFinish.id) || firstFinish;
  const start: LandingLook = { shape: originalShape, material: { finish: 'raw_clay', color: FINISH_DEFINITIONS.raw_clay.color }, decoration: { ...DEFAULT_DECORATION }, attachments: [] };
  const shape: LandingLook = { ...start, shape: changedShape };
  const finishOne: LandingLook = { ...shape, material: { finish: firstFinish.id, color: firstFinish.id === 'glazed' ? '#A0522D' : firstFinish.color } };
  const finishTwo: LandingLook = { ...shape, material: { finish: secondFinish.id, color: secondFinish.id === 'matte' ? '#C65A2E' : secondFinish.color } };
  const decorate: LandingLook = { ...finishTwo, decoration: { patternId: 'traditional-curl', placement: 'full', scale: 1.1, color: '#315A9F', effect: 'engraved' } };
  const details: LandingLook = { ...decorate, attachments: [] };
  return { version: 1, stages: { start, shape, finishOne, finishTwo, decorate, details } };
}

const STAGE_NAMES = ['start', 'shape', 'finishOne', 'finishTwo', 'decorate', 'details'] as const;

export function isValidLandingLook(value: unknown, model: LandingModel): value is LandingLook {
  if (!value || typeof value !== 'object') return false;
  const look = value as LandingLook;
  const base = modelBaseFromRow(model);
  if (!base || !look.shape || look.shape.unit !== 'in' || look.shape.geometryMode !== 'baseline' || !look.shape.baseline) return false;
  if ((['height', 'bodyWidth', 'neckWidth', 'rimSize'] as const).some((key) =>
    !Number.isFinite(look.shape[key]) || look.shape[key] <= 0 || look.shape[key] > 999.99
    || !Number.isFinite(look.shape.baseline![key]) || look.shape.baseline![key] <= 0
    || Math.abs(look.shape.baseline![key] - base[key]) > 0.01)) return false;
  if (!Number.isFinite(look.shape.curvature) || look.shape.curvature < 0 || look.shape.curvature > 100) return false;
  if (!look.material || !isFinishId(look.material.finish) || !/^#[0-9a-f]{6}$/i.test(look.material.color)) return false;
  if (!look.decoration || typeof look.decoration.patternId !== 'string' || (look.decoration.patternId && !getPattern(look.decoration.patternId))) return false;
  if (!['upper', 'middle', 'lower', 'full'].includes(look.decoration.placement)
    || !['painted', 'engraved'].includes(look.decoration.effect)
    || !Number.isFinite(look.decoration.scale) || look.decoration.scale < 0.6 || look.decoration.scale > 1.6
    || !/^#[0-9a-f]{6}$/i.test(look.decoration.color)) return false;
  return Array.isArray(look.attachments)
    && normalizeAttachmentSelections(look.attachments).length === look.attachments.length;
}

export function parseLandingFeature(value: unknown, model: LandingModel): LandingFeature | null {
  if (!value || typeof value !== 'object') return null;
  const feature = value as LandingFeature;
  if (feature.version !== 1 || !feature.stages || STAGE_NAMES.some((name) => !isValidLandingLook(feature.stages[name], model))) return null;
  return feature;
}

export function landingLookAtProgress(feature: LandingFeature, progress: number): LandingLook {
  const { start, shape, finishOne, finishTwo, decorate, details } = feature.stages;
  if (progress < 0.3) return start;
  if (progress < 0.6) {
    const ratio = (progress - 0.3) / 0.3;
    return {
      ...shape,
      shape: {
        ...shape.shape,
        height: start.shape.height + (shape.shape.height - start.shape.height) * ratio,
        bodyWidth: start.shape.bodyWidth + (shape.shape.bodyWidth - start.shape.bodyWidth) * ratio,
        neckWidth: start.shape.neckWidth + (shape.shape.neckWidth - start.shape.neckWidth) * ratio,
        rimSize: start.shape.rimSize + (shape.shape.rimSize - start.shape.rimSize) * ratio,
        curvature: start.shape.curvature + (shape.shape.curvature - start.shape.curvature) * ratio,
      },
    };
  }
  if (progress < 0.7) return finishOne;
  if (progress < 0.8) return finishTwo;
  if (progress < 0.9) return decorate;
  return details;
}

export function normalizeLandingLook(look: LandingLook): LandingLook {
  return { ...look, material: normalizeMaterialParams(look.material), attachments: normalizeAttachmentSelections(look.attachments) };
}
