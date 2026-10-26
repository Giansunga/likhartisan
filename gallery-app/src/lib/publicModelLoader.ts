import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { LoadingManager } from 'three';
import { captureException } from './sentry';
import { downloadAsset } from './assetDownload';
import { resolveAssetUrl } from './assetDelivery';

export type ModelLoadState = { phase: 'loading' | 'retrying' | 'preparing' | 'ready' | 'error'; loaded: number; total?: number };
const initial: ModelLoadState = { phase: 'loading', loaded: 0 };
const states = new Map<string, ModelLoadState>();
const subscriptions = new Map<string, Set<() => void>>();
const requests = new Map<string, AbortController>();
const owners = new Map<string, number>();
const cancellations = new Map<string, ReturnType<typeof setTimeout>>();

export function modelState(source: string) { return states.get(source) || initial; }
export function updateModelState(source: string, state: ModelLoadState) {
  states.set(source, state);
  subscriptions.get(source)?.forEach(listener => listener());
}
export function subscribeModel(source: string, listener: () => void) {
  const listeners = subscriptions.get(source) || new Set<() => void>();
  listeners.add(listener); subscriptions.set(source, listeners);
  return () => { listeners.delete(listener); if (!listeners.size) subscriptions.delete(source); };
}
export function retainModel(source: string, onCancel: () => void) {
  clearTimeout(cancellations.get(source));
  owners.set(source, (owners.get(source) || 0) + 1);
  return () => {
    owners.set(source, (owners.get(source) || 1) - 1);
    cancellations.set(source, setTimeout(() => {
      cancellations.delete(source);
      if (!owners.get(source)) {
        owners.delete(source);
        if (requests.has(source)) {
          requests.get(source)?.abort();
          requests.delete(source);
          states.delete(source);
          onCancel();
        }
      }
    }, 0));
  };
}

const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);

export class PublicGLTFLoader extends GLTFLoader {
  constructor(manager?: LoadingManager) {
    super(manager || new LoadingManager());
    this.manager.setURLModifier(resource => resolveAssetUrl(resource)!);
    this.setDRACOLoader(draco);
    this.setMeshoptDecoder(MeshoptDecoder);
  }

  override load(source: string, onLoad: (gltf: GLTF) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void) {
    const controller = new AbortController();
    requests.set(source, controller);
    this.manager.itemStart(source);
    updateModelState(source, initial);
    void downloadAsset(source, {
      signal: controller.signal,
      onRetry: () => updateModelState(source, { phase: 'retrying', loaded: 0 }),
      onProgress: ({ loaded, total }) => {
        updateModelState(source, { phase: 'loading', loaded, total });
        onProgress?.({ loaded, total: total || 0, lengthComputable: Boolean(total) } as ProgressEvent);
      },
    }).then(async bytes => {
      updateModelState(source, { phase: 'preparing', loaded: bytes.byteLength });
      const url = new URL(resolveAssetUrl(source)!, window.location.href);
      url.hash = ''; url.search = '';
      const gltf = await this.parseAsync(bytes, new URL('.', url).href);
      if (controller.signal.aborted) return;
      updateModelState(source, { phase: 'ready', loaded: bytes.byteLength });
      onLoad(gltf);
    }).catch(error => {
      if (controller.signal.aborted) return;
      captureException(new Error(`Public model ${modelState(source).phase === 'preparing' ? 'preparation' : 'download'} failed`));
      updateModelState(source, { phase: 'error', loaded: 0 });
      this.manager.itemError(source);
      onError?.(error);
    }).finally(() => {
      if (requests.get(source) === controller) requests.delete(source);
      this.manager.itemEnd(source);
    });
    return { abort: () => controller.abort() };
  }
}
