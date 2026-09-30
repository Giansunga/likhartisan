import { describe, expect, it } from 'vitest';
import { createLandingFeature, isEligibleLandingModel, landingLookAtProgress, parseLandingFeature, type LandingModel } from '../landing3dFeature';

const model: LandingModel = {
  id: 'model-1', name: 'Vase', category: 'Vase', file_url: 'https://example.com/vase.glb',
  thumbnail: null, shop_id: 'shop-1', status: 'active',
  base_height_in: 12, base_body_width_in: 8, base_neck_width_in: 5, base_rim_size_in: 6,
  base_price_php: 500, base_production_days: 7,
};

describe('landing 3D feature', () => {
  it('offers only active, shop-linked models with a file and complete measurements', () => {
    expect(isEligibleLandingModel(model)).toBe(true);
    expect(isEligibleLandingModel({ ...model, status: 'archived' })).toBe(false);
    expect(isEligibleLandingModel({ ...model, shop_id: null })).toBe(false);
    expect(isEligibleLandingModel({ ...model, base_price_php: null })).toBe(false);
    expect(isEligibleLandingModel({ ...model, file_url: '' })).toBe(false);
    expect(isEligibleLandingModel({ ...model, file_url: 'https://example.com/vase.png' })).toBe(false);
  });

  it('starts from the selected model baseline and rejects stale model measurements', () => {
    const feature = createLandingFeature(model);
    expect(feature.stages.start.shape).toMatchObject({ height: 12, bodyWidth: 8, geometryMode: 'baseline', unit: 'in' });
    expect(parseLandingFeature(feature, model)).not.toBeNull();
    expect(parseLandingFeature(feature, { ...model, base_height_in: 14 })).toBeNull();
    expect(parseLandingFeature({ ...feature, stages: { ...feature.stages, start: { ...feature.stages.start, shape: { ...feature.stages.start.shape, baseline: { ...feature.stages.start.shape.baseline, height: undefined } } } } }, model)).toBeNull();
  });

  it('starts with finishes available at the model shop', () => {
    const feature = createLandingFeature(model, 'Sosima Gomez Pottery');
    expect(feature.stages.finishOne.material.finish).toBe('raw_clay');
    expect(feature.stages.finishTwo.material.finish).toBe('raw_clay');
  });

  it('uses each published visual look at the existing scroll boundaries', () => {
    const feature = createLandingFeature(model);
    feature.stages.finishOne.material.color = '#112233';
    feature.stages.finishTwo.material.color = '#223344';
    expect(landingLookAtProgress(feature, 0.1)).toBe(feature.stages.start);
    expect(landingLookAtProgress(feature, 0.45).shape.height).toBeCloseTo((feature.stages.start.shape.height + feature.stages.shape.shape.height) / 2);
    expect(landingLookAtProgress(feature, 0.65).material.color).toBe('#112233');
    expect(landingLookAtProgress(feature, 0.75).material.color).toBe('#223344');
    expect(landingLookAtProgress(feature, 0.85)).toBe(feature.stages.decorate);
    expect(landingLookAtProgress(feature, 0.95)).toBe(feature.stages.details);
  });
});
