import { describe, expect, it } from 'vitest';
import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_MODEL_MAX_BYTES, validateProductFile } from './productFiles';
describe('product upload limits', () => {
  it('accepts GLB and supported images at the exact size limits', () => {
    expect(validateProductFile({ name: 'pot.GLB', size: PRODUCT_MODEL_MAX_BYTES }, 'models')).toBeNull();
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif']) expect(validateProductFile({ name: `pot.${ext}`, size: PRODUCT_IMAGE_MAX_BYTES }, 'products')).toBeNull();
  });
  it('rejects oversized, empty and incompatible files', () => {
    expect(validateProductFile({ name: 'pot.glb', size: PRODUCT_MODEL_MAX_BYTES + 1 }, 'models')).toMatch(/25 MB/);
    expect(validateProductFile({ name: 'pot.png', size: PRODUCT_IMAGE_MAX_BYTES + 1 }, 'products')).toMatch(/5 MB/);
    expect(validateProductFile({ name: 'pot.glb', size: 0 }, 'models')).toMatch(/empty/);
    for (const name of ['pot.gltf', 'pot.obj', 'pot.exe']) expect(validateProductFile({ name, size: 20 }, 'models')).toMatch(/Choose a .glb/);
    expect(validateProductFile({ name: 'pot.svg', size: 20 }, 'products')).toMatch(/product image/);
  });
});
