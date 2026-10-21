export interface ProductCreationPaths { list: string; create: string; tools: string }
export const ADMIN_PRODUCT_PATHS: ProductCreationPaths = { list: '/admin/products', create: '/admin/products/create', tools: '/admin/products/create/3d-tools' };
export const ARTISAN_PRODUCT_PATHS: ProductCreationPaths = { list: '/artisan-dashboard/listings', create: '/artisan-dashboard/listings/create', tools: '/artisan-dashboard/listings/create/3d-tools' };
