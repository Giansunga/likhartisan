export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_MODEL_MAX_BYTES = 25 * 1024 * 1024;
export function validateProductFile(file: Pick<File, 'name' | 'size'>, folder: 'products' | 'models'): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (folder === 'models' && extension !== 'glb') return 'Choose a .glb 3D model.';
  if (folder === 'products' && !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension || '')) return 'Choose a JPG, PNG, WebP, or GIF product image.';
  const limit = folder === 'models' ? PRODUCT_MODEL_MAX_BYTES : PRODUCT_IMAGE_MAX_BYTES;
  if (file.size <= 0) return 'This file is empty. Choose another file.';
  if (file.size > limit) return `${folder === 'models' ? '3D models' : 'Product images'} must be ${limit / (1024 * 1024)} MB or smaller.`;
  return null;
}
