const STORAGE_ORIGIN = 'https://wlnknpbjkcmxwxtuspeh.supabase.co';
const R2_PREFIXES = new Set(['products', 'models', 'Landing Page Video']);
const STORAGE_PREFIXES = new Set(['shop', 'artisans', 'avatars', 'reviews']);
const TYPES = {
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm',
};
const RESPONSE_HEADERS = ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified', 'Content-Encoding'];

function failure(status, message, extra = {}) {
  return new Response(message, { status, headers: { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}

export function parseAssetPath(input) {
  const url = new URL(input);
  if (url.search || /%2f|%5c|%00|\\/i.test(url.pathname)) return null;
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return null; }
  const segments = path.split('/').slice(1);
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[\x00-\x1f\x7f\\]/.test(segment))) return null;
  if (segments[0] === 'r2' && R2_PREFIXES.has(segments[1]) && segments.length > 2) {
    if (!TYPES[segments.at(-1).split('.').pop().toLowerCase()]) return null;
    return { source: 'r2', key: segments.slice(1).join('/') };
  }
  if (segments[0] === 'storage' && segments[1] === 'products' && STORAGE_PREFIXES.has(segments[2]) && segments.length > 3) {
    if (!/^image\//.test(TYPES[segments.at(-1).split('.').pop().toLowerCase()] || '')) return null;
    return { source: 'storage', key: segments.slice(2).join('/') };
  }
  return null;
}

function cacheHeaders(headers, key, status, source) {
  headers.set('X-Content-Type-Options', 'nosniff');
  if (status !== 200 && status !== 304) {
    headers.set('Cache-Control', 'no-store');
    headers.set('CDN-Cache-Control', 'no-store');
    return headers;
  }
  const versioned = source === 'r2' && /(?:^|\/)\d{10,}_[\w-]+\.[a-z0-9]+$/i.test(key);
  headers.set('Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300, must-revalidate');
  headers.set('CDN-Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600, must-revalidate');
  return headers;
}

function matches(value, etag, weak = true) {
  return value?.split(',').some(tag => tag.trim() === '*' || (weak ? tag.trim().replace(/^W\//, '') : tag.trim()) === etag);
}

export function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || '');
  if (!match || (!match[1] && !match[2]) || !size) return null;
  const offset = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset < 0 || offset >= size || end < offset || (!match[1] && Number(match[2]) === 0)) return null;
  return { offset, length: end - offset + 1 };
}

async function r2Response(request, env, asset) {
  const meta = await env.ASSETS.head(asset.key);
  if (!meta) return failure(404, 'Asset not found');
  const headers = new Headers();
  meta.writeHttpMetadata(headers);
  const etag = meta.httpEtag;
  headers.set('ETag', etag);
  headers.set('Last-Modified', meta.uploaded.toUTCString());
  headers.set('Content-Type', TYPES[asset.key.split('.').pop().toLowerCase()]);
  headers.set('Accept-Ranges', 'bytes');
  const modified = Math.floor(meta.uploaded.getTime() / 1000) * 1000;
  const ifMatch = request.headers.get('If-Match');
  const unmodifiedSince = Date.parse(request.headers.get('If-Unmodified-Since'));
  if ((ifMatch && !matches(ifMatch, etag, false)) || (!ifMatch && Number.isFinite(unmodifiedSince) && modified > unmodifiedSince)) return failure(412, 'Asset changed');
  const noneMatch = request.headers.get('If-None-Match');
  const since = Date.parse(request.headers.get('If-Modified-Since'));
  if ((noneMatch && matches(noneMatch, etag)) || (!noneMatch && Number.isFinite(since) && modified <= since)) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers: cacheHeaders(headers, asset.key, 304, asset.source) });
  }
  let range;
  const rangeHeader = request.method === 'GET' && request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');
  const useRange = !ifRange || ifRange === etag || (Number.isFinite(Date.parse(ifRange)) && modified <= Date.parse(ifRange));
  if (rangeHeader && useRange) {
    range = parseRange(rangeHeader, meta.size);
    if (!range) return failure(416, 'Invalid byte range', { 'Content-Range': `bytes */${meta.size}` });
  }
  const status = range ? 206 : 200;
  headers.set('Content-Length', String(range?.length ?? meta.size));
  if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`);
  else headers.delete('Content-Range');
  cacheHeaders(headers, asset.key, status, asset.source);
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  const object = await env.ASSETS.get(asset.key, { onlyIf: { etagMatches: meta.etag }, ...(range ? { range } : {}) });
  if (!object) return failure(404, 'Asset not found');
  if (!('body' in object)) return failure(503, 'Asset changed during download. Retry.');
  return new Response(object.body, { status, headers });
}

export function createGateway(fetchImpl = fetch) {
  const handler = {
    async fetch(request, env) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return failure(405, 'Read-only endpoint', { Allow: 'GET, HEAD' });
      const asset = parseAssetPath(request.url);
      if (!asset) return failure(404, 'Asset not found');
      try {
        if (asset.source === 'r2') return await r2Response(request, env, asset);
        const headers = new Headers();
        for (const name of ['Range', 'If-None-Match', 'If-Modified-Since', 'If-Match', 'If-Unmodified-Since', 'If-Range']) {
          if (request.headers.has(name)) headers.set(name, request.headers.get(name));
        }
        const key = asset.key.split('/').map(encodeURIComponent).join('/');
        const upstream = await fetchImpl(`${STORAGE_ORIGIN}/storage/v1/object/public/products/${key}`, {
          method: request.method, headers, redirect: 'manual', signal: request.signal,
        });
        if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304) return failure(502, 'Unexpected asset redirect');
        const responseHeaders = new Headers();
        for (const name of RESPONSE_HEADERS) if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name));
        cacheHeaders(responseHeaders, asset.key, upstream.status, asset.source);
        return new Response(request.method === 'HEAD' || upstream.status === 304 ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
      } catch {
        return failure(503, 'Asset delivery temporarily unavailable');
      }
    },
  };
  return {
    async fetch(request, env) {
      const response = await handler.fetch(request, env);
      return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
    },
  };
}

export default createGateway();
