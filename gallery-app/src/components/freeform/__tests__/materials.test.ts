import { describe, expect, it } from 'vitest';
import {
  FINISHES,
  FINISH_DEFINITIONS,
  getFinishDefinition,
  normalizeFinishId,
  normalizeMaterialParams,
} from '../materials';

describe('finish definitions', () => {
  it('exposes five dielectric shopper finishes with distinct physical profiles', () => {
    expect(FINISHES.map((finish) => finish.id)).toEqual(['raw_clay', 'matte', 'glazed', 'acrylic_paint', 'water_paint']);
    expect(FINISHES.every((finish) => finish.metalness === 0)).toBe(true);
    expect(new Set(FINISHES.map((finish) => `${finish.roughness}:${finish.clearcoat}:${finish.textureStyle}`)).size).toBe(FINISHES.length);
    expect(FINISH_DEFINITIONS.glazed).toMatchObject({ roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
    expect(FINISH_DEFINITIONS.raw_clay).toMatchObject({ color: '#BE734F', roughness: 0.88, clearcoat: 0 });
  });

  it('keeps legacy finishes readable and falls unknown values back to raw clay', () => {
    expect(normalizeFinishId('ceramic')).toBe('ceramic');
    expect(normalizeFinishId('metallic')).toBe('metallic');
    expect(normalizeFinishId('not-a-finish')).toBe('raw_clay');
    expect(getFinishDefinition('not-a-finish').id).toBe('raw_clay');
  });

  it('normalizes persisted material data without tinting a valid selected color', () => {
    expect(normalizeMaterialParams({ finish: 'glazed', color: '#12abef' })).toEqual({ finish: 'glazed', color: '#12ABEF' });
    expect(normalizeMaterialParams({ finish: 'unknown', color: 'invalid' })).toEqual({ finish: 'raw_clay', color: '#BE734F' });
  });
});
