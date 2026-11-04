import { act } from 'react';
import { _roots, advance, createRoot, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeformScene } from '../FreeformViewer';
import { createAttachmentSelection, type AttachmentSelection } from '../attachments';
import { GENERATED_ATTACHMENT_RECIPES } from '../generatedAttachmentCatalog';
import { resolveAttachmentMount } from '../attachmentPlacement';
import type { AttachmentAnalysis } from '../attachmentValidation';
import type { ShapeParams } from '../shapeGeometry';

vi.mock('@react-three/fiber', async importOriginal => {
  const THREE = await import('three');
  const loaded = { scene: new THREE.Group().add(new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(.05, -.5), new THREE.Vector2(.4, -.5), new THREE.Vector2(.65, -.35),
    new THREE.Vector2(.85, -.05), new THREE.Vector2(1, .3), new THREE.Vector2(1.05, .35),
  ], 48), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }))) };
  return { ...await importOriginal<typeof import('@react-three/fiber')>(), useLoader: () => loaded };
});
beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

extend({ Group: THREE.Group });
const recipe = GENERATED_ATTACHMENT_RECIPES.find(item => item.key === 'square-bridge')!;
const shape = { unit: 'in' as const, geometryMode: 'baseline' as const,
  baseline: { height: 4, bodyWidth: 6, neckWidth: 6, rimSize: 6 },
  height: 4, bodyWidth: 10, neckWidth: 10, rimSize: 10, curvature: 50 };
const selection = createAttachmentSelection({ recipe, shopId: null, priceAdjustment: 0, productionDaysAdjustment: 0 },
  [-90, 90].map((azimuth, i) => ({ id: i ? 'auto-handle-right' : 'auto-handle-left', name: i ? 'Right' : 'Left',
    family: 'handle' as const, height: .55, azimuth, pairGroup: 'pair', maxWidthRatio: .27, maxHeightRatio: .27 })));
const cleanup: Array<() => void> = [];
afterEach(async () => { await act(async () => cleanup.splice(0).forEach(dispose => dispose())); });

async function viewer(paused: boolean, attachments = [selection], initialShape: ShapeParams = shape) {
  const canvas = document.createElement('canvas');
  const root = createRoot(canvas);
  const renderer = {
    domElement: canvas, render: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn(),
    xr: { enabled: false, isPresenting: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), setAnimationLoop: vi.fn() },
    shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
    capabilities: { maxTextureSize: 4096, getMaxAnisotropy: () => 1 },
  } as unknown as THREE.WebGLRenderer;
  await root.configure({ gl: renderer, frameloop: 'never', size: { width: 800, height: 600, top: 0, left: 0 }, dpr: 1 });
  const analyzed = vi.fn<(analysis: AttachmentAnalysis) => void>();
  const render = async (nextShape = initialShape) => {
    await act(async () => root.render(<FreeformScene modelFile="bowl.gltf" shapeParams={nextShape}
      materialParams={{ color: '#A5E0CF', finish: 'glazed' }} attachmentParams={attachments}
      pauseAttachmentAnalysis={paused} showAttachmentSockets={false} onMorphDetected={() => {}}
      onAttachmentAnalysis={analyzed} />));
  };
  await render();
  cleanup.push(() => root.unmount());
  const state = _roots.get(canvas)!.store.getState();
  const frame = () => advance(1, true, state);
  const group = () => state.scene.children.find(child => child.type === 'Group')! as THREE.Group;
  return { frame, group, render, analyzed };
}

function expectMountedOnCurrentSurface(group: THREE.Group, attachments: AttachmentSelection[]) {
  const base = group.children[0];
  attachments[0].placements.forEach((placement, i) => {
    const expected = resolveAttachmentMount(base, placement.socket, recipe, placement.transform)!;
    const handle = group.children[i + 1];
    expect(handle.visible).toBe(true);
    expect(handle.position.distanceTo(expected.position)).toBeLessThan(.00001);
    expect(handle.scale.x).toBeCloseTo(expected.scale, 5);
  });
}

describe('submitted handle placement', () => {
  it('mounts a read-only handle on the shaped surface on the first frame and after a shape update', async () => {
    const targeted: ShapeParams = { ...shape, targetProfile: { version: 1, body: 0.68, neck: null, rim: 0.98 } };
    const editor = await viewer(false, [selection], targeted);
    editor.frame(); editor.frame();
    const saved = JSON.parse(JSON.stringify(editor.analyzed.mock.calls.at(-1)![0].attachments)) as AttachmentSelection[];
    const preview = await viewer(true, saved, targeted);
    preview.frame();
    expectMountedOnCurrentSurface(preview.group(), saved);
    const originalMount = preview.group().children[1].position.clone();
    await preview.render({ ...targeted, bodyWidth: 9.9 });
    preview.frame();
    expectMountedOnCurrentSurface(preview.group(), saved);
    expect(preview.group().children[1].position.distanceTo(originalMount)).toBeGreaterThan(0.00001);
  });

  it('recreates the accepted editor placements after submitting and cold-loading the shop viewer', async () => {
    const editor = await viewer(false);
    editor.frame(); editor.frame();
    const saved = JSON.parse(JSON.stringify(editor.analyzed.mock.calls.at(-1)![0].attachments)) as AttachmentSelection[];
    const submitted = await viewer(true, saved);
    submitted.frame(); submitted.frame();
    expectMountedOnCurrentSurface(submitted.group(), saved);
    saved[0].placements.forEach((_, i) => {
      expect(submitted.group().children[i + 1].position.distanceTo(editor.group().children[i + 1].position)).toBeLessThan(.00001);
    });
  });
});
