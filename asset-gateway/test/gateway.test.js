import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGateway, parseAssetPath, parseRange } from '../src/index.js';

const bytes = new TextEncoder().encode('0123456789');
function fixture() {
  const calls = [];
  const meta = {
    size: bytes.length, etag: 'version-1', httpEtag: '"version-1"', uploaded: new Date('2026-01-01T00:00:00Z'),
    writeHttpMetadata(headers) { headers.set('Content-Type', 'application/octet-stream'); },
  };
  const env = { ASSETS: {
    async head(key) { calls.push(['head', key]); return key.includes('missing') ? null : meta; },
    async get(key, options) {
      calls.push(['get', key, options]);
      const range = options.range;
      return { ...meta, body: new ReadableStream({ start(controller) { controller.enqueue(range ? bytes.slice(range.offset, range.offset + range.length) : bytes); controller.close(); } }) };
    },
  } };
  return { env, calls };
}
const request = (path = '/r2/models/1786333477321_model.glb', init) => new Request(`https://gateway.test${path}`, init);

test('serves a model with the correct MIME type, bytes and immutable caching', async () => {
  const { env } = fixture();
  const response = await createGateway().fetch(request(), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'model/gltf-binary');
  assert.equal(response.headers.get('Content-Length'), '10');
  assert.match(response.headers.get('Cache-Control'), /immutable/);
  assert.equal(await response.text(), '0123456789');
});
test('HEAD does not download the object', async () => {
  const { env, calls } = fixture();
  const response = await createGateway().fetch(request(undefined, { method: 'HEAD' }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.equal(calls.length, 1);
});
test('ranges, suffixes, invalid ranges and If-Range', async () => {
  for (const [range, expected] of [['bytes=2-4', '234'], ['bytes=-3', '789'], ['bytes=8-', '89']]) {
    const { env } = fixture();
    const response = await createGateway().fetch(request(undefined, { headers: { Range: range } }), env);
    assert.equal(response.status, 206);
    assert.equal(await response.text(), expected);
    assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Content-Length'), String(expected.length));
  }
  const { env } = fixture();
  const invalid = await createGateway().fetch(request(undefined, { headers: { Range: 'bytes=99-100' } }), env);
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('Content-Range'), 'bytes */10');
  const changed = await createGateway().fetch(request(undefined, { headers: { Range: 'bytes=0-1', 'If-Range': '"old"' } }), env);
  assert.equal(changed.status, 200);
  assert.equal(await changed.text(), '0123456789');
  assert.equal(parseRange('bytes=0-1,5-6', 10), null);
  assert.equal(parseRange('bytes=-0', 10), null);
});
test('conditional requests return 304/412 without downloading the object', async () => {
  for (const headers of [{ 'If-None-Match': 'W/"version-1"' }, { 'If-Modified-Since': 'Thu, 01 Jan 2026 00:00:00 GMT' }]) {
    const { env, calls } = fixture();
    const response = await createGateway().fetch(request(undefined, { headers }), env);
    assert.equal(response.status, 304);
    assert.equal(await response.text(), '');
    assert.equal(calls.length, 1);
  }
  const { env } = fixture();
  assert.equal((await createGateway().fetch(request(undefined, { headers: { 'If-Match': '"old"' } }), env)).status, 412);
  assert.equal((await createGateway().fetch(request(undefined, { headers: { 'If-Match': 'W/"version-1"' } }), env)).status, 412);
});
test('rejects private prefixes, bad paths, queries and arbitrary proxies', async () => {
  const { env, calls } = fixture();
  for (const path of ['/r2/chat/private.jpg', '/storage/products/chat/private.jpg', '/r2/models/%2fsecret.glb', '/r2/models/%00bad.glb', '/r2/models/../secret.glb', '/r2/models/a.glb?url=https://evil.test', '/storage/other/shop/photo.jpg', '/r2/models/file.env', '/proxy/https://evil.test/file.jpg']) {
    assert.equal((await createGateway().fetch(request(path), env)).status, 404, path);
  }
  for (const method of ['PUT', 'POST', 'DELETE', 'OPTIONS']) assert.equal((await createGateway().fetch(request(undefined, { method }), env)).status, 405);
  assert.equal(calls.length, 0);
  assert.equal(parseAssetPath('https://gateway.test/r2/models/shop%20one/model.glb').key, 'models/shop one/model.glb');
});
test('missing and upstream failures are not cached', async () => {
  const { env } = fixture();
  const missing = await createGateway().fetch(request('/r2/products/missing.jpg'), env);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('Cache-Control'), 'no-store');
  env.ASSETS.head = () => { throw new Error('Internal details must not be returned'); };
  const failure = await createGateway().fetch(request(), env);
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /Internal details/);
});
test('Supabase public media uses a fixed upstream without forwarding credentials', async () => {
  let received;
  const gateway = createGateway(async (url, options) => {
    received = { url, options };
    return new Response(bytes, { status: 206, headers: { 'Content-Type': 'image/jpeg', 'Content-Range': 'bytes 0-9/100', 'Set-Cookie': 'secret=hidden' } });
  });
  const response = await gateway.fetch(request('/storage/products/artisans/shop%20one/photo.jpg', { headers: { Range: 'bytes=0-9', Authorization: 'Bearer private', Cookie: 'session=private' } }), {});
  assert.equal(received.url, 'https://wlnknpbjkcmxwxtuspeh.supabase.co/storage/v1/object/public/products/artisans/shop%20one/photo.jpg');
  assert.equal(received.options.headers.get('Range'), 'bytes=0-9');
  assert.equal(received.options.headers.has('Authorization'), false);
  assert.equal(received.options.headers.has('Cookie'), false);
  assert.equal(response.headers.has('Set-Cookie'), false);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(await response.text(), '0123456789');
});
test('does not follow upstream redirects or cache upstream errors', async () => {
  const redirect = await createGateway(async () => new Response(null, { status: 302, headers: { Location: 'https://evil.test' } })).fetch(request('/storage/products/shop/photo.jpg'), {});
  assert.equal(redirect.status, 502);
  const missing = await createGateway(async () => new Response('Missing', { status: 404 })).fetch(request('/storage/products/reviews/photo.jpg'), {});
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('CDN-Cache-Control'), 'no-store');
});
test('returns a stream before all object bytes arrive and handles a 25 MB object', async () => {
  const { env } = fixture();
  let controller;
  env.ASSETS.head = async () => ({ size: 25 * 1024 * 1024, etag: 'large', httpEtag: '"large"', uploaded: new Date(), writeHttpMetadata() {} });
  env.ASSETS.get = async () => ({ body: new ReadableStream({ start(value) { controller = value; } }) });
  const response = await createGateway().fetch(request(), env);
  assert.equal(response.headers.get('Content-Length'), String(25 * 1024 * 1024));
  assert.ok(controller);
  controller.enqueue(new Uint8Array(25 * 1024 * 1024)); controller.close();
  assert.equal((await response.arrayBuffer()).byteLength, 25 * 1024 * 1024);
});
