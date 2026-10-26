import { useEffect, useRef, useState } from 'react';
import { AssetDownloadError, downloadAsset } from '../lib/assetDownload';
import { resolveAssetUrl, R2_ORIGIN, STORAGE_ORIGIN } from '../lib/assetDelivery';
import { PublicGLTFLoader } from '../lib/publicModelLoader';
import type { Mesh, Material, Texture } from 'three';
import './asset-check.css';

const SAMPLES = [
  { label: 'Product photo', type: 'image', url: `${R2_ORIGIN}/products/1786637170944_c5695c19.jpg` },
  { label: 'Shop photo', type: 'image', url: `${STORAGE_ORIGIN}/storage/v1/object/public/products/shop/f94761a7-e442-41bc-aee3-c854df71b96d/profile-1786508446736-1d31d3d4-4401-438d-8896-305513f945fa.jpg` },
  { label: '3D model', type: 'model', url: `${R2_ORIGIN}/models/1786333477321_5066b82a.glb` },
  { label: 'Video playback data', type: 'video', url: `${R2_ORIGIN}/Landing%20Page%20Video/LikhArtisan%203min.mp4` },
] as const;
type Result = { label: string; stage: string; status: 'waiting' | 'running' | 'passed' | 'failed'; seconds?: string; failureStage?: string; downloadedBytes?: number; httpStatus?: number; smallRequest?: 'passed' | 'failed' };

async function checkSmallRequest(url: string, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8_000);
  try {
    if (signal.aborted) abort();
    const response = await fetch(url, { signal: controller.signal, headers: { Range: 'bytes=0-1023' }, cache: 'no-store' });
    if (response.status !== 206 || !response.headers.get('Content-Range')?.startsWith('bytes 0-1023/')) { void response.body?.cancel(); return 'failed'; }
    return (await response.arrayBuffer()).byteLength === 1024 ? 'passed' : 'failed';
  } catch { return 'failed'; }
  finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

async function decodeImage(bytes: ArrayBuffer, signal: AbortSignal) {
  const url = URL.createObjectURL(new Blob([bytes]));
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const cleanup = () => { signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null; };
      const abort = () => { cleanup(); image.removeAttribute('src'); reject(new DOMException('Cancelled', 'AbortError')); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error('Image decoding failed')); };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort(); else image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

export default function AssetCheckPage() {
  const [network, setNetwork] = useState('Smart cellular');
  const [mode, setMode] = useState<'gateway' | 'direct'>('gateway');
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [results, setResults] = useState<Result[]>(SAMPLES.map(sample => ({ label: sample.label, stage: 'Not checked', status: 'waiting' })));
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function run() {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const { signal } = controller;
    setRunning(true); setCopied(false);
    setResults(SAMPLES.map(sample => ({ label: sample.label, stage: 'Waiting', status: 'waiting' })));
    const update = (index: number, value: Partial<Result>) => { if (!signal.aborted) setResults(old => old.map((row, i) => i === index ? { ...row, ...value } : row)); };
    try {
      for (const [index, sample] of SAMPLES.entries()) {
        if (signal.aborted) break;
        const start = performance.now();
        let stage = 'Downloading';
        let downloadedBytes = 0;
        let smallRequest: 'passed' | 'failed' | undefined;
        const reportStage = (value: string) => { stage = value; update(index, { stage }); };
        update(index, { status: 'running', stage: 'Downloading' });
        try {
          if (sample.type === 'model') {
            reportStage('Checking a small model request');
            smallRequest = await checkSmallRequest(resolveAssetUrl(sample.url, mode), signal);
            update(index, { smallRequest });
            reportStage('Downloading');
          }
          if (sample.type === 'video') {
            const videoController = new AbortController();
            const abortVideo = () => videoController.abort();
            signal.addEventListener('abort', abortVideo, { once: true });
            const timer = setTimeout(abortVideo, 30_000);
            try {
              const response = await fetch(resolveAssetUrl(sample.url, mode), { signal: videoController.signal, headers: { Range: 'bytes=0-1023' }, cache: 'no-store' });
              if (response.status !== 206 || !response.headers.get('Content-Range')?.startsWith('bytes 0-1023/')) {
                void response.body?.cancel(); throw new Error('Video range unavailable');
              }
              if ((await response.arrayBuffer()).byteLength !== 1024) throw new Error('Video range incomplete');
            } finally { clearTimeout(timer); signal.removeEventListener('abort', abortVideo); }
          } else {
            const bytes = await downloadAsset(sample.url, { signal, deliveryMode: mode, cache: 'no-store', onRetry: () => reportStage('Retrying download'), onProgress: ({ loaded, total }) => { downloadedBytes = loaded; reportStage(total ? `Downloading ${Math.round(100 * loaded / total)}%` : 'Downloading'); } });
            reportStage('Checking file');
            if (sample.type === 'image') await decodeImage(bytes, signal);
            else {
              const url = new URL(resolveAssetUrl(sample.url, mode)!, window.location.href);
              const model = await new PublicGLTFLoader().parseAsync(bytes, url.href.slice(0, url.href.lastIndexOf('/') + 1));
              model.scene.traverse(object => {
                const mesh = object as Mesh;
                mesh.geometry?.dispose();
                if (!mesh.material) return;
                for (const material of [mesh.material].flat() as Material[]) {
                  for (const value of Object.values(material)) if ((value as Texture)?.isTexture) (value as Texture).dispose();
                  material.dispose();
                }
              });
            }
          }
          update(index, { status: 'passed', stage: sample.type === 'model' ? 'Downloaded and decoded' : 'Loaded', seconds: ((performance.now() - start) / 1000).toFixed(1) });
        } catch (error) {
          update(index, { status: 'failed', stage: stage === 'Checking file' ? 'File check failed' : 'Download failed', failureStage: stage, downloadedBytes, httpStatus: error instanceof AssetDownloadError ? error.status : undefined, seconds: ((performance.now() - start) / 1000).toFixed(1) });
        }
      }
    } finally {
      if (active.current === controller) { active.current = null; setRunning(false); }
    }
  }
  const stop = () => {
    active.current?.abort();
    setResults(old => old.map(row => row.status === 'running' || row.status === 'waiting' ? { ...row, status: 'waiting', stage: 'Stopped' } : row));
  };
  async function copy() {
    const report = { network, delivery: mode, results };
    try { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); setCopied(true); } catch { setCopied(false); }
  }
  return <div className="asset-check-page"><section>
    <h1>Check media loading</h1>
    <p>Test photos, a 3D model, and video data on your current connection. This downloads about 12 MB. For a normal-network test, turn your VPN off first.</p>
    <div className="asset-check-options">
      <label>Connection<select value={network} onChange={event => setNetwork(event.target.value)} disabled={running}>{['Smart cellular', 'DITO cellular', 'Globe cellular', 'Globe Wi-Fi', 'Converge Wi-Fi', 'PLDT Wi-Fi', 'Other Wi-Fi', 'VPN enabled'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Delivery<select value={mode} onChange={event => setMode(event.target.value as 'gateway' | 'direct')} disabled={running}><option value="gateway">Website delivery</option><option value="direct">Original storage (comparison)</option></select></label>
    </div>
    <div className="asset-check-actions"><button type="button" disabled={running} onClick={() => void run()}>Run checks</button>{running && <button type="button" onClick={stop}>Stop</button>}<button type="button" disabled={running || results.every(row => row.status === 'waiting')} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy results'}</button></div>
    <ul aria-live="polite">{results.map(row => <li key={row.label}><strong>{row.label}</strong><span data-status={row.status}>{row.status === 'passed' ? 'Passed · ' : row.status === 'failed' ? 'Failed · ' : ''}{row.stage}{row.seconds ? ` · ${row.seconds}s` : ''}{row.smallRequest && ` · Small request ${row.smallRequest}`}{row.httpStatus && ` · HTTP ${row.httpStatus}`}</span></li>)}</ul>
    <p className="asset-check-note">Results contain only your selected connection label and file-check outcomes. No account details or private links are included.</p>
  </section></div>;
}
