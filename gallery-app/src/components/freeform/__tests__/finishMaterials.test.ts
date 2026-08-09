import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyFinishToScene,
  disposeFinishTextureCache,
  generateCylindricalUVs,
  getFinishTextureSet,
} from '../finishMaterials';

afterEach(disposeFinishTextureCache);

describe('finish material pipeline', () => {
  it('caches deterministic texture sets and gives finishes different surface maps', () => {
    const firstClay = getFinishTextureSet('raw_clay');
    const secondClay = getFinishTextureSet('raw_clay');
    const glaze = getFinishTextureSet('glazed');
    expect(secondClay).toBe(firstClay);
    expect(firstClay.normalMap.image.data).toEqual(getFinishTextureSet('raw_clay').normalMap.image.data);
    expect(firstClay.normalMap.image.data).not.toEqual(glaze.normalMap.image.data);
    expect(firstClay.roughnessMap.wrapS).toBe(THREE.RepeatWrapping);
  });

  it('converts single and array materials to physical materials while preserving render flags', () => {
    const group = new THREE.Group();
    const first = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.65, side: THREE.DoubleSide });
    const second = new THREE.MeshBasicMaterial();
    const singleMesh = new THREE.Mesh(new THREE.BoxGeometry(), first);
    const multiMesh = new THREE.Mesh(new THREE.BoxGeometry(), [first.clone(), second]);
    group.add(singleMesh, multiMesh);

    applyFinishToScene(group, { finish: 'glazed', color: '#336699' });

    const single = singleMesh.material as THREE.MeshPhysicalMaterial;
    const multiple = multiMesh.material as THREE.MeshPhysicalMaterial[];
    expect(single).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(single).toMatchObject({ transparent: true, opacity: 0.65, side: THREE.DoubleSide, roughness: 0.2, metalness: 0, clearcoat: 1 });
    expect(single.color.getHexString()).toBe('336699');
    expect(single.normalMap).toBe(getFinishTextureSet('glazed').normalMap);
    expect(multiple).toHaveLength(2);
    expect(multiple.every((material) => material instanceof THREE.MeshPhysicalMaterial)).toBe(true);
  });

  it('switches finish properties without replacing an established physical material', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial());
    applyFinishToScene(mesh, { finish: 'raw_clay', color: '#A0522D' });
    const physical = mesh.material as THREE.MeshPhysicalMaterial;
    applyFinishToScene(mesh, { finish: 'acrylic_paint', color: '#A0522D' });
    expect(mesh.material).toBe(physical);
    expect(physical).toMatchObject({ roughness: 0.38, metalness: 0, clearcoat: 0.25 });
    expect(physical.color.getHexString()).toBe('a0522d');
  });

  it('generates bounded cylindrical UVs for geometry with no usable UV attribute', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      1, -1, 0,
      0, 1, 1,
      -1, -1, 0,
    ], 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const root = new THREE.Group();
    root.add(mesh);
    generateCylindricalUVs(root);
    const uv = geometry.getAttribute('uv');
    expect(uv.count).toBe(3);
    for (let index = 0; index < uv.count; index++) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(index)).toBeLessThanOrEqual(1);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(index)).toBeLessThanOrEqual(1);
    }
  });
});
