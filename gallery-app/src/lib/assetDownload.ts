import { resolveAssetUrl } from './assetDelivery';

export class AssetDownloadError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  constructor(message: string, retryable: boolean, status?: number) { super(message); this.name = 'AssetDownloadError'; this.retryable = retryable; this.status = status; }
}

export type DownloadProgress = { loaded: number; total?: number; attempt: number };

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Timeout measures inactivity, never the total duration of an active download. */
export async function downloadAsset(source: string, options: {
  signal: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  onRetry?: () => void;
  idleMs?: number;
  retryDelayMs?: number;
  deliveryMode?: 'gateway' | 'direct';
  cache?: RequestCache;
}): Promise<ArrayBuffer> {
  const { signal, onProgress, onRetry, idleMs = 30_000, retryDelayMs = 1000 } = options;
  const url = resolveAssetUrl(source, options.deliveryMode)!;
  const canUseRanges = url.startsWith('/media/r2/models/') && !url.includes('?');
  const rangeSize = 1024 * 1024;
  let chunks: Uint8Array[] = [];
  let loaded = 0;
  let total: number | undefined;
  let etag: string | undefined;
  const reset = () => { chunks = []; loaded = 0; total = undefined; etag = undefined; };
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout>;
    let stalled = false;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { stalled = true; controller.abort(); }, idleMs);
    };
    resetTimer();
    try {
      // Only owned public models use bounded ranges on the one recovery attempt.
      // Keep received bytes only when a strong ETag identifies their exact version.
      const ranged = attempt === 2 && canUseRanges;
      if (!ranged || !etag || (total !== undefined && loaded >= total)) reset();
      let more = false;
      do {
        resetTimer();
        const start = loaded;
        const end = total === undefined ? start + rangeSize - 1 : Math.min(start + rangeSize, total) - 1;
        const response = await fetch(url, {
          signal: controller.signal,
          ...(options.cache ? { cache: options.cache } : {}),
          ...(ranged ? { headers: { Range: `bytes=${start}-${end}`, ...(etag ? { 'If-Range': etag } : {}) } } : {}),
        });
        if (!response.ok) {
          void response.body?.cancel();
          throw new AssetDownloadError(`Download failed (${response.status})`, [408, 425, 429].includes(response.status) || response.status >= 500, response.status);
        }
        const encoding = response.headers.get('Content-Encoding');
        const encoded = Boolean(encoding && encoding.toLowerCase() !== 'identity');
        const responseTag = response.headers.get('ETag');
        const strongTag = responseTag && /^"[^"\r\n]*"$/.test(responseTag) ? responseTag : undefined;
        let expected: number | undefined;
        if (ranged && response.status === 206) {
          const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') || '');
          const [offset, last, size] = match ? match.slice(1).map(Number) : [];
          if (!match || ![offset, last, size].every(Number.isSafeInteger) || offset !== start || last !== Math.min(end, size - 1) || size <= last || last < offset || encoded || !strongTag || (etag && etag !== strongTag) || (total !== undefined && size !== total)) {
            void response.body?.cancel();
            throw new AssetDownloadError('Could not validate the resumed model download', false);
          }
          total = size; etag = strongTag; expected = last - offset + 1;
          more = last + 1 < size;
        } else if (response.status === 200) {
          // If-Range can return a complete replacement. Never append it to old bytes.
          reset();
          const length = Number(response.headers.get('Content-Length'));
          total = !encoded && Number.isSafeInteger(length) && length > 0 ? length : undefined;
          etag = !encoded ? strongTag : undefined;
          expected = total;
          more = false;
        } else {
          void response.body?.cancel();
          throw new AssetDownloadError('Unexpected partial model response', false);
        }
        const base = loaded;
        const reader = response.body?.getReader();
        const append = (value: Uint8Array) => {
          if (expected !== undefined && loaded - base + value.byteLength > expected) throw new AssetDownloadError('Download length did not match the response', false);
          chunks.push(value); loaded += value.byteLength;
          onProgress?.({ loaded, total, attempt });
        };
        if (reader) {
          try {
            while (true) {
              resetTimer();
              const { done, value } = await reader.read();
              if (done) break;
              append(value);
            }
          } finally { reader.releaseLock(); }
        } else { append(new Uint8Array(await response.arrayBuffer())); }
        if (expected !== undefined && loaded - base !== expected) throw new AssetDownloadError('Download incomplete', true);
      } while (more);
      const result = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      return result.buffer;
    } catch (error) {
      controller.abort();
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const failure = error instanceof AssetDownloadError ? error : new AssetDownloadError(stalled ? 'Download stopped responding' : 'Could not reach this file', true);
      if (!failure.retryable || attempt === 2) throw failure;
      clearTimeout(timer!);
      signal.removeEventListener('abort', cancel);
      onRetry?.();
      await wait(retryDelayMs, signal);
    } finally {
      clearTimeout(timer!);
      signal.removeEventListener('abort', cancel);
    }
  }
  throw new AssetDownloadError('Could not reach this file', true);
}
