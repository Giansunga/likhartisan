import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeFinishTextureCache } from '../../components/freeform/finishMaterials';
import { calibrateModelScene, measureModelScene } from '../../components/freeform/calibrateModel';

const exporterState = vi.hoisted(() => ({ scene: null as THREE.Object3D | null }));

vi.mock('three/examples/jsm/exporters/GLTFExporter.js', () => ({
  GLTFExporter: class {
    parse(
      scene: THREE.Object3D,
      onDone: (result: ArrayBuffer) => void,
    ) {
      exporterState.scene = scene;
      onDone(new ArrayBuffer(16));
    }
  },
}));

import { exportSceneToGLB } from '../exportService';

afterEach(() => {
  exporterState.scene = null;
  disposeFinishTextureCache();
});

describe('exportSceneToGLB finish output', () => {
  it('passes portable glossy PBR data and generated UVs to the GLTF exporter', async () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 16), new THREE.MeshStandardMaterial()));

    const result = await exportSceneToGLB(
      source,
      { height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 },
      { finish: 'glazed', color: '#336699' },
    );

    expect(result).toBeInstanceOf(ArrayBuffer);
    const exportedMesh = exporterState.scene?.getObjectByProperty('isMesh', true) as THREE.Mesh;
    const material = exportedMesh.material as THREE.MeshPhysicalMaterial;
    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.color.getHexString()).toBe('336699');
    expect(material).toMatchObject({ roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
    expect(material.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(material.roughnessMap).toBeInstanceOf(THREE.DataTexture);
    expect(exportedMesh.geometry.getAttribute('uv')?.count).toBe(exportedMesh.geometry.getAttribute('position').count);
  });

  it('keeps every vertex in place for a new design at its model baseline', async () => {
    const source = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.6, 2, 16), new THREE.MeshStandardMaterial());
    source.add(mesh);
    const original = Array.from(mesh.geometry.getAttribute('position').array);
    const baseline = { height: 13, bodyWidth: 14, neckWidth: 8, rimSize: 10 };
    await exportSceneToGLB(source,
      { ...baseline, curvature: 50, unit: 'in', geometryMode: 'baseline', baseline },
      { finish: 'raw_clay', color: '#BE734F' });
    const exported = exporterState.scene?.getObjectByProperty('isMesh', true) as THREE.Mesh;
    const result = Array.from(exported.geometry.getAttribute('position').array);
    result.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(original[index], 5));
  });

  it('exports edited dimensions in physical inches from a calibrated model', async () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.55, -1), new THREE.Vector2(1, -0.2),
      new THREE.Vector2(1, 0.2), new THREE.Vector2(0.45, 0.75),
      new THREE.Vector2(0.6, 1),
    ], 64), new THREE.MeshStandardMaterial()));
    const baseline = { height: 13, bodyWidth: 14, neckWidth: 6, rimSize: 8 };
    const stored = calibrateModelScene(source, baseline);
    await exportSceneToGLB(stored,
      { height: 14, bodyWidth: 15, neckWidth: 6.5, rimSize: 8.5,
        curvature: 50, unit: 'in', geometryMode: 'baseline', baseline },
      { finish: 'raw_clay', color: '#BE734F' });
    const measured = measureModelScene(exporterState.scene as THREE.Group);
    expect(measured.height).toBeCloseTo(14, 1);
    expect(measured.bodyWidth).toBeCloseTo(15, 1);
    expect(measured.neckWidth).toBeCloseTo(6.5, 1);
    expect(measured.rimSize).toBeCloseTo(8.5, 1);
    expect(measureModelScene(stored).height).toBeCloseTo(13, 1);
  });
});
