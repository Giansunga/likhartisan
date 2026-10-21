import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { LoadingManager } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ModelDeliveryPhase = 'loading' | 'retrying' | 'parsing' | 'ready' | 'error';
export type ModelDeliverySnapshot = {
  phase: ModelDeliveryPhase;
  attempt: number;
  loaded: number;
  total?: number;
  progress?: number;
  message?: string;
  retryable: boolean;
};

const snapshots = new Map<string, ModelDeliverySnapshot>();
const listeners = new Map<string, Set<() => void>>();
const unavailableCompressedVariants = new Set<string>();
const DEFAULT_SNAPSHOT: ModelDeliverySnapshot = { phase: 'loading', attempt: 0, loaded: 0, retryable: true };
const MAX_ATTEMPTS_PER_URL = 2;
const STALLED_REQUEST_MS = 12_000;

function publish(url: string, snapshot: ModelDeliverySnapshot) {
  snapshots.set(url, snapshot);
  listeners.get(url)?.forEach(listener => listener());
}

export function getModelDeliverySnapshot(url: string): ModelDeliverySnapshot {
  return snapshots.get(url) || DEFAULT_SNAPSHOT;
}

export function subscribeToModelDelivery(url: string, listener: () => void) {
  const subscribers = listeners.get(url) || new Set<() => void>();
  subscribers.add(listener);
  listeners.set(url, subscribers);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) listeners.delete(url);
  };
}

export function startModelDelivery(url: string) {
  if (!snapshots.has(url)) publish(url, DEFAULT_SNAPSHOT);
}

export function resetModelDelivery(url: string) {
  publish(url, DEFAULT_SNAPSHOT);
}

function modelCandidates(input: string) {
  const original = new URL(input, window.location.href);
  const paths: Array<{ url: URL; compressed: boolean }> = [];
  const configuredBase = import.meta.env.VITE_MODEL_ASSET_BASE_URL?.trim();
  const customBase = configuredBase
    ? new URL(configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`, window.location.origin)
    : null;
  const productionProxyBase = import.meta.env.PROD
    ? new URL('/model-assets/', window.location.origin)
    : null;
  const isPublicR2 = original.hostname.endsWith('.r2.dev');
  const isGLB = /\.glb$/i.test(original.pathname);

  if (isGLB) {
    const deliveryBases = isPublicR2
      ? [customBase, productionProxyBase].filter((base): base is URL => Boolean(base))
      : [];
    const uniqueDeliveryBases = [...new Map(deliveryBases.map(base => [base.href, base])).values()];

    for (const base of uniqueDeliveryBases) {
      const deliveryUrl = new URL(original.pathname.replace(/^\//, ''), base);
      const compressedDeliveryUrl = new URL(deliveryUrl.href);
      compressedDeliveryUrl.pathname += '.gz';
      paths.push({ url: compressedDeliveryUrl, compressed: true });
    }

    const compressedOriginal = new URL(original.href);
    compressedOriginal.pathname += '.gz';
    paths.push({ url: compressedOriginal, compressed: true });

    for (const base of uniqueDeliveryBases) {
      paths.push({ url: new URL(original.pathname.replace(/^\//, ''), base), compressed: false });
    }
  }

  paths.push({ url: original, compressed: false });
  const seen = new Set<string>();
  return paths.filter(candidate => {
    const key = candidate.url.href;
    if (seen.has(key) || (candidate.compressed && unavailableCompressedVariants.has(key))) return false;
    seen.add(key);
    return true;
  });
}

class ModelRequestError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'ModelRequestError';
    this.retryable = retryable;
  }
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('The model request was cancelled.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function readResponse(response: Response, controller: AbortController, compressed: boolean, url: string, attempt: number): Promise<ArrayBuffer> {
  const totalHeader = Number(response.headers.get('content-length'));
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined;
  const reader = response.body?.getReader();
  if (!reader) return response.arrayBuffer();

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    if (controller.signal.aborted) throw new DOMException('The model request was cancelled.', 'AbortError');
    let timer: number | undefined;
    const stalled = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        controller.abort();
        reject(new ModelRequestError('The model download stopped responding.', true));
      }, STALLED_REQUEST_MS);
    });
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await Promise.race([reader.read(), stalled]);
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
    }
    if (result.done) break;
    chunks.push(result.value);
    loaded += result.value.byteLength;
    publish(url, {
      phase: 'loading', attempt, loaded,
      ...(!compressed && total ? { total, progress: Math.min(100, Math.round((loaded / total) * 100)) } : {}),
      retryable: true,
    });
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

async function fetchCandidate(candidate: { url: URL; compressed: boolean }, originalUrl: string, signal: AbortSignal, attempt: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const stallTimer = window.setTimeout(abort, STALLED_REQUEST_MS);
  try {
    const response = await fetch(candidate.url.href, { signal: controller.signal, cache: 'default' });
    window.clearTimeout(stallTimer);
    if (!response.ok) {
      if (candidate.compressed && response.status === 404) unavailableCompressedVariants.add(candidate.url.href);
      throw new ModelRequestError(`Model request failed (${response.status}).`, retryableStatus(response.status));
    }
    const buffer = await readResponse(response, controller, candidate.compressed, originalUrl, attempt);
    return { buffer, url: candidate.url.href };
  } catch (error) {
    window.clearTimeout(stallTimer);
    if (signal.aborted) throw new DOMException('The model request was cancelled.', 'AbortError');
    if (error instanceof ModelRequestError) throw error;
    throw new ModelRequestError('The model could not be reached. Check your connection.', true);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

async function decodeCompressedVariant(buffer: ArrayBuffer, compressed: boolean) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2));
  const hasGzipSignature = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!compressed || !hasGzipSignature) return buffer;
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new ModelRequestError('This browser cannot unpack the optional compressed copy.', false);
  }
  try {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  } catch {
    throw new ModelRequestError('The compressed model copy could not be unpacked.', false);
  }
}

function basePath(url: string) {
  const resolved = new URL(url, window.location.href);
  resolved.pathname = resolved.pathname.slice(0, resolved.pathname.lastIndexOf('/') + 1);
  resolved.search = '';
  resolved.hash = '';
  return resolved.href;
}

async function loadGLTFWithFallbacks(url: string, loader: GLTFLoader, signal: AbortSignal): Promise<GLTF> {
  const candidates = modelCandidates(url);
  let lastError: unknown = new ModelRequestError('The model could not be loaded.', false);
  let overallAttempt = 0;

  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_URL; attempt++) {
      overallAttempt += 1;
      publish(url, { phase: attempt === 1 ? 'loading' : 'retrying', attempt: overallAttempt, loaded: 0, retryable: true });
      try {
        const { buffer, url: resolvedUrl } = await fetchCandidate(candidate, url, signal, overallAttempt);
        publish(url, { phase: 'parsing', attempt: overallAttempt, loaded: buffer.byteLength, retryable: false });
        const modelBytes = await decodeCompressedVariant(buffer, candidate.compressed);
        const gltf = await loader.parseAsync(modelBytes, basePath(resolvedUrl));
        publish(url, { phase: 'ready', attempt: overallAttempt, loaded: modelBytes.byteLength, retryable: false });
        return gltf;
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error;
        const retryable = error instanceof ModelRequestError && error.retryable;
        if (retryable && attempt < MAX_ATTEMPTS_PER_URL) {
          await delay(attempt * 600, signal);
          continue;
        }
        if (candidate.compressed || (error instanceof ModelRequestError && error.retryable)) break;
        publish(url, {
          phase: 'error', attempt: overallAttempt, loaded: 0,
          message: error instanceof Error ? error.message : 'The model could not be loaded.',
          retryable,
        });
        throw error;
      }
    }
  }

  const retryable = lastError instanceof ModelRequestError && lastError.retryable;
  publish(url, {
    phase: 'error', attempt: overallAttempt, loaded: 0,
    message: lastError instanceof Error ? lastError.message : 'The model could not be loaded.',
    retryable,
  });
  throw lastError;
}

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);

export class ResilientGLTFLoader extends GLTFLoader {
  constructor(manager?: LoadingManager) {
    super(manager);
    this.setDRACOLoader(dracoLoader);
    this.setMeshoptDecoder(MeshoptDecoder);
  }

  override load(url: string, onLoad: (data: GLTF) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void) {
    const controller = new AbortController();
    let cancelled = false;
    this.manager.itemStart(url);
    void loadGLTFWithFallbacks(url, this, controller.signal).then(gltf => {
      if (cancelled) { this.manager.itemEnd(url); return; }
      onProgress?.({ lengthComputable: false, loaded: getModelDeliverySnapshot(url).loaded, total: 0 } as ProgressEvent);
      onLoad(gltf);
      this.manager.itemEnd(url);
    }).catch(error => {
      if (cancelled) { this.manager.itemEnd(url); return; }
      this.manager.itemError(url);
      this.manager.itemEnd(url);
      onError?.(error);
    });
    return { abort: () => { cancelled = true; controller.abort(); } };
  }
}

export function markModelDeliveryFailure(url: string, error: unknown) {
  if (getModelDeliverySnapshot(url).phase === 'error') return;
  publish(url, {
    phase: 'error', attempt: getModelDeliverySnapshot(url).attempt, loaded: 0,
    message: error instanceof Error ? error.message : 'The model could not be loaded.',
    retryable: false,
  });
}
