// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { PublicGLTFLoader, modelState, retainModel } from './publicModelLoader';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function minimalGLB() {
  const json = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] });
  const text = json.padEnd(Math.ceil(json.length / 4) * 4, ' ');
  const bytes = new ArrayBuffer(20 + text.length);
  const view = new DataView(bytes);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, text.length, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(bytes, 20).set(new TextEncoder().encode(text));
  return bytes;
}
it('parses a valid GLB through the shared loader', async () => {
  vi.stubGlobal('window', { location: { href: 'https://likhartisan.com/' } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(minimalGLB())));
  const source = '/media/r2/models/valid.glb';
  const model = await new PublicGLTFLoader().loadAsync(source);
  expect(model.scene.isGroup).toBe(true);
  expect(modelState(source).phase).toBe('ready');
});
it('does not download corrupt models repeatedly after a successful HTTP response', async () => {
  vi.stubGlobal('window', { location: { href: 'https://likhartisan.com/' } });
  const fetchMock = vi.fn(async () => new Response('not a GLB'));
  vi.stubGlobal('fetch', fetchMock);
  const source = '/media/r2/models/corrupt.glb';
  await expect(new PublicGLTFLoader().loadAsync(source)).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(modelState(source).phase).toBe('error');
});
it('cancels on final viewer unmount while preserving other viewers sharing the model', async () => {
  vi.useFakeTimers();
  const aborted = vi.fn();
  vi.stubGlobal('fetch', vi.fn((_url: string, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted(); reject(new DOMException('Cancelled', 'AbortError')); }))));
  const source = '/media/r2/models/shared.glb';
  const clear = vi.fn();
  const one = retainModel(source, clear);
  const two = retainModel(source, clear);
  new PublicGLTFLoader().load(source, vi.fn());
  one(); await vi.advanceTimersByTimeAsync(1);
  expect(aborted).not.toHaveBeenCalled();
  two(); await vi.advanceTimersByTimeAsync(1);
  expect(aborted).toHaveBeenCalledTimes(1);
  expect(clear).toHaveBeenCalledTimes(1);
});
