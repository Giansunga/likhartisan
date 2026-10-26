export const R2_ORIGIN = 'https://pub-0cc6e7109e7e48a183d54d0426453a6a.r2.dev';
export const STORAGE_ORIGIN = 'https://wlnknpbjkcmxwxtuspeh.supabase.co';
const R2_PREFIXES = new Set(['products', 'models', 'Landing Page Video']);
const STORAGE_PREFIXES = new Set(['shop', 'artisans', 'avatars', 'reviews']);

/** Display/load boundary only. Never persist this derived URL over the source URL. */
export function resolveAssetUrl(source: string, mode?: string): string;
export function resolveAssetUrl(source: undefined, mode?: string): undefined;
export function resolveAssetUrl(source: string | undefined, mode?: string): string | undefined;
export function resolveAssetUrl(source: string | undefined, mode: string = import.meta.env.VITE_ASSET_DELIVERY_MODE || 'gateway'): string | undefined {
  if (!source || mode === 'direct') return source;
  let url: URL;
  try { url = new URL(source); } catch { return source; }
  if (url.username || url.password || url.search || /%2f|%5c|%00|\\/i.test(url.pathname)) return source;
  let segments: string[];
  try { segments = url.pathname.split('/').slice(1).map(decodeURIComponent); } catch { return source; }
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || Array.from(segment).some(char => char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) return source;
  const key = segments.map(encodeURIComponent).join('/');
  if (url.origin === R2_ORIGIN && R2_PREFIXES.has(segments[0]) && segments.length > 1) return `/media/r2/${key}${url.hash}`;
  if (url.origin === STORAGE_ORIGIN && segments.slice(0, 5).join('/') === 'storage/v1/object/public/products' && STORAGE_PREFIXES.has(segments[5]) && segments.length > 6) {
    return `/media/storage/products/${segments.slice(5).map(encodeURIComponent).join('/')}${url.hash}`;
  }
  return source;
}

export function assetBackground(source: string | undefined) {
  return `url(${JSON.stringify(resolveAssetUrl(source) || '')})`;
}
