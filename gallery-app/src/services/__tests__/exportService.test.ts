import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeFinishTextureCache } from '../../components/freeform/finishMaterials';

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
});
