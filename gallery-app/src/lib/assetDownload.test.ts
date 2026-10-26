// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetDownloadError, downloadAsset } from './assetDownload';
import { R2_ORIGIN } from './assetDelivery';

const source = `${R2_ORIGIN}/models/sample.glb`;
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('asset downloads', () => {
  it('requests only the same-origin gateway and reports progress for a 25 MB file', async () => {
    const bytes = new Uint8Array(25 * 1024 * 1024);
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/media/r2/models/sample.glb');
      return new Response(bytes, { headers: { 'Content-Length': String(bytes.length) } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onProgress = vi.fn();
    const result = await downloadAsset(source, { signal: new AbortController().signal, onProgress });
    expect(result.byteLength).toBe(bytes.length);
    expect(fetchMock.mock.calls[0][0]).toBe('/media/r2/models/sample.glb');
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: bytes.length, total: bytes.length, attempt: 1 });
  });
  it('retries a transient HTTP failure once and then succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('Unavailable', { status: 503 })).mockResolvedValueOnce(new Response('model'));
    vi.stubGlobal('fetch', fetchMock);
    const onRetry = vi.fn();
    const result = await downloadAsset(source, { signal: new AbortController().signal, retryDelayMs: 0, onRetry });
    expect(new TextDecoder().decode(result)).toBe('model');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it('never retries missing objects or keeps retrying network failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('Not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(downloadAsset(source, { signal: new AbortController().signal })).rejects.toMatchObject({ retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset().mockRejectedValue(new TypeError('network'));
    await expect(downloadAsset(source, { signal: new AbortController().signal, retryDelayMs: 0 })).rejects.toBeInstanceOf(AssetDownloadError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('cancels in-flight work without an automatic retry', async () => {
    const fetchMock = vi.fn((_url: string, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const promise = downloadAsset(source, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('allows an active download to last longer than the inactivity limit', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        let count = 0;
        const next = () => { controller.enqueue(new Uint8Array([++count])); if (count < 8) setTimeout(next, 10); else controller.close(); };
        setTimeout(next, 10);
      },
    })));
    vi.stubGlobal('fetch', fetchMock);
    const result = downloadAsset(source, { signal: new AbortController().signal, idleMs: 15 });
    await vi.advanceTimersByTimeAsync(100);
    expect((await result).byteLength).toBe(8);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('aborts and retries once when the response body stops arriving', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementationOnce(async (_url, { signal }) => new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new DOMException('Stalled', 'AbortError'))); } }))).mockResolvedValueOnce(new Response('recovered'));
    vi.stubGlobal('fetch', fetchMock);
    const result = downloadAsset(source, { signal: new AbortController().signal, idleMs: 20, retryDelayMs: 5 });
    await vi.advanceTimersByTimeAsync(100);
    expect(new TextDecoder().decode(await result)).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resumes received model bytes with bounded ranges and the original strong ETag', async () => {
    const bytes = Uint8Array.from({ length: 2 * 1024 * 1024 + 123 }, (_, index) => index % 251);
    let sent = false;
    const prefix = 37;
    const fetchMock = vi.fn().mockImplementationOnce(async () => new Response(new ReadableStream({
      pull(controller) {
        if (!sent) { sent = true; controller.enqueue(bytes.slice(0, prefix)); }
        else controller.error(new TypeError('Connection interrupted'));
      },
    }), { headers: { 'Content-Length': String(bytes.length), ETag: '"model-v1"' } })).mockImplementation(async (_url, options) => {
      const { Range: range, 'If-Range': tag } = options.headers;
      expect(tag).toBe('"model-v1"');
      const [start, end] = range.slice(6).split('-').map(Number);
      expect(end - start + 1).toBeLessThanOrEqual(1024 * 1024);
      return new Response(bytes.slice(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, ETag: tag } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onRetry = vi.fn();
    const result = await downloadAsset(source, { signal: new AbortController().signal, retryDelayMs: 0, onRetry });
    expect(Buffer.compare(Buffer.from(result), Buffer.from(bytes))).toBe(0);
    expect(fetchMock.mock.calls[1][1].headers.Range).toBe(`bytes=${prefix}-${prefix + 1024 * 1024 - 1}`);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses small requests after an initial transfer failure before any bytes arrive', async () => {
    const bytes = new Uint8Array(1024 * 1024 + 10).fill(42);
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Network failed')).mockImplementation(async (_url, options) => {
      const [start, requestedEnd] = options.headers.Range.slice(6).split('-').map(Number);
      const end = Math.min(requestedEnd, bytes.length - 1);
      return new Response(bytes.slice(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, ETag: '"version"' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(Buffer.compare(Buffer.from(await downloadAsset(source, { signal: new AbortController().signal, retryDelayMs: 0 })), Buffer.from(bytes))).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    { 'Content-Range': 'bytes 1-3/4', ETag: '"version"' },
    { 'Content-Range': 'bytes 0-3/4', ETag: 'W/"version"' },
    { 'Content-Range': 'bytes 0-3/4', ETag: '"version"', 'Content-Encoding': 'gzip' },
  ] as Record<string, string>[])('rejects inconsistent or unverifiable range responses without looping', async headers => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Network')).mockResolvedValueOnce(new Response('data', { status: 206, headers }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(downloadAsset(source, { signal: new AbortController().signal, retryDelayMs: 0 })).rejects.toMatchObject({ retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('accepts a full replacement if the server ignores Range or the version changes', async () => {
    let sent = false;
    const fetchMock = vi.fn().mockImplementationOnce(async () => new Response(new ReadableStream({
      pull(controller) {
        if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode('old')); }
        else controller.error(new TypeError('Network'));
      },
    }), { headers: { 'Content-Length': '20', ETag: '"old-version"' } })).mockResolvedValueOnce(new Response('complete new model', { headers: { ETag: '"new-version"' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await downloadAsset(source, { signal: new AbortController().signal, retryDelayMs: 0 });
    expect(new TextDecoder().decode(result)).toBe('complete new model');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('assembles a 25 MB model on the recovery attempt without larger requests', async () => {
    const size = 25 * 1024 * 1024;
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Network')).mockImplementation(async (_url, options) => {
      const [start, end] = options.headers.Range.slice(6).split('-').map(Number);
      expect(end - start + 1).toBeLessThanOrEqual(1024 * 1024);
      return new Response(new Uint8Array(end - start + 1).fill(42), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${size}`, ETag: '"large"' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = new Uint8Array(await downloadAsset(source, { signal: new AbortController().signal, retryDelayMs: 0 }));
    expect(result.byteLength).toBe(size);
    expect(result.every(value => value === 42)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(26);
  });

  it('stops when recovery itself fails without retrying every chunk', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Network')).mockResolvedValueOnce(new Response('Busy', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(downloadAsset(source, { signal: new AbortController().signal, retryDelayMs: 0 })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not send gateway range headers to private or unrelated origins', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Network')).mockResolvedValueOnce(new Response('private model'));
    vi.stubGlobal('fetch', fetchMock);
    await downloadAsset('https://private.example/model.glb?token=private', { signal: new AbortController().signal, retryDelayMs: 0 });
    expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
  });
});
