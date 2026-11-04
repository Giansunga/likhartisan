import { expect, it } from 'vitest';
import auditedAssets from '../auditedShapeAssets.json';
import { hasAuditedShapeAsset } from '../shapeAssetEligibility';

it('accepts an audited model revision and rejects a replacement until it is audited', () => {
  const [id, url] = Object.entries(auditedAssets)[0];
  expect(hasAuditedShapeAsset(id, url)).toBe(true);
  expect(hasAuditedShapeAsset(id, new URL('replacement.glb', url).href)).toBe(false);
  expect(hasAuditedShapeAsset('different-model', url)).toBe(false);
});
