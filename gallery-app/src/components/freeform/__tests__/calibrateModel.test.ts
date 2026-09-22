import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { calibrateModelFile, calibrateModelScene, getSectionAnchors, measureModelScene } from '../calibrateModel';

describe('model calibration', () => {
  it('stores a physically sized copy without changing the uploaded scene', () => {
    const source = new THREE.Group();
    const profile = [
      new THREE.Vector2(0.55, -1), new THREE.Vector2(0.8, -0.7),
      new THREE.Vector2(1, -0.25), new THREE.Vector2(1, 0.15),
      new THREE.Vector2(0.65, 0.5), new THREE.Vector2(0.45, 0.75),
      new THREE.Vector2(0.6, 1),
    ];
    source.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 64), new THREE.MeshStandardMaterial()));
    const originalBounds = new THREE.Box3().setFromObject(source);
    const originalAnchors = getSectionAnchors(source);

    const calibrated = calibrateModelScene(source, { height: 13, bodyWidth: 14, neckWidth: 6, rimSize: 8 });
    const calibratedBounds = new THREE.Box3().setFromObject(calibrated);

    expect(calibrated).not.toBe(source);
    expect(calibratedBounds.max.y - calibratedBounds.min.y).toBeCloseTo(13 * 0.0254, 3);
    const measured = measureModelScene(calibrated);
    expect(measured.height).toBeCloseTo(13, 1);
    expect(measured.bodyWidth).toBeCloseTo(14, 1);
    expect(measured.neckWidth).toBeCloseTo(6, 1);
    expect(measured.rimSize).toBeCloseTo(8, 1);
    expect(new THREE.Box3().setFromObject(source)).toEqual(originalBounds);
    expect(getSectionAnchors(calibrated).neck).toBeCloseTo(originalAnchors.neck, 1);
  });

  it('parses an uploaded GLB and produces a calibrated GLB file', async () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.5, -1), new THREE.Vector2(1, -0.2),
      new THREE.Vector2(1, 0.2), new THREE.Vector2(0.45, 0.75),
      new THREE.Vector2(0.6, 1),
    ], 32), new THREE.MeshStandardMaterial()));
    const input = await new Promise<ArrayBuffer>((resolve, reject) => {
      new GLTFExporter().parse(source, (data) => resolve(data as ArrayBuffer), reject, { binary: true });
    });
    const calibrated = await calibrateModelFile(new File([input], 'pot.glb', { type: 'model/gltf-binary' }),
      { height: 13, bodyWidth: 14, neckWidth: 6, rimSize: 8 });
    const parsed = await new Promise<THREE.Group>((resolve, reject) => {
      calibrated.arrayBuffer().then((buffer) => new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), reject));
    });
    expect(calibrated.name).toBe('pot-calibrated.glb');
    expect(measureModelScene(parsed).height).toBeCloseTo(13, 1);
  });
});
