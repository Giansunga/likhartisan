import { describe, expect, it } from 'vitest';
import { resolveAssetUrl, R2_ORIGIN, STORAGE_ORIGIN } from './assetDelivery';

describe('public media delivery boundary', () => {
  it('maps exact owned origins and nested, encoded keys without changing source data', () => {
    const source = `${R2_ORIGIN}/models/shop-123/My%20pot.glb`;
    const saved = { modelUrl: source, image: `${R2_ORIGIN}/products/123.jpg` };
    expect(resolveAssetUrl(source)).toBe('/media/r2/models/shop-123/My%20pot.glb');
    expect(resolveAssetUrl(`${STORAGE_ORIGIN}/storage/v1/object/public/products/artisans/photo.jpg`)).toBe('/media/storage/products/artisans/photo.jpg');
    expect(saved).toEqual({ modelUrl: source, image: `${R2_ORIGIN}/products/123.jpg` });
    expect(resolveAssetUrl(`${R2_ORIGIN}/Landing%20Page%20Video/LikhArtisan%203min.mp4`)).toBe('/media/r2/Landing%20Page%20Video/LikhArtisan%203min.mp4');
  });
  it.each([
    '/images/local.png', 'data:image/png;base64,abc', 'blob:https://likhartisan.com/abc',
    'https://another.r2.dev/products/a.jpg', `${R2_ORIGIN}.evil.test/products/a.jpg`,
    `${R2_ORIGIN}/chat/private.jpg`, `${R2_ORIGIN}/models/a.glb?X-Amz-Signature=secret`,
    `${R2_ORIGIN}/models/one%2Ftwo.glb`, `${R2_ORIGIN}/models/%00bad.glb`,
    `${STORAGE_ORIGIN}/storage/v1/object/sign/products/shop/a.jpg?token=private`,
    `${STORAGE_ORIGIN}/storage/v1/object/public/products/chat/private.jpg`,
    `${STORAGE_ORIGIN}/rest/v1/products`,
  ])('leaves private, unrelated and local sources unchanged: %s', source => expect(resolveAssetUrl(source)).toBe(source));
  it('supports direct delivery as an explicit rollback switch', () => {
    const source = `${R2_ORIGIN}/models/a.glb`;
    expect(resolveAssetUrl(source, 'direct')).toBe(source);
    expect(resolveAssetUrl(undefined)).toBeUndefined();
  });
});
