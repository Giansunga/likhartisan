import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { shapeFromModelBase } from '../../../lib/measurements';
import { isUneditedShape, restoreSourceGeometry } from '../shapeGeometry';

describe('original model geometry', () => {
  it('recognizes the catalog baseline and only treats actual control changes as edits', () => {
    const base = shapeFromModelBase({ height: 14, bodyWidth: 5, neckWidth: 5, rimSize: 5 });
    expect(isUneditedShape(base)).toBe(true);
    expect(isUneditedShape({ ...base, height: 14.1 })).toBe(false);
    expect(isUneditedShape({ ...base, curvature: 51 })).toBe(false);
  });

  it('restores each mesh exactly without changing existing morph influences', () => {
    const meshes = [new THREE.Mesh(new THREE.BoxGeometry()), new THREE.Mesh(new THREE.SphereGeometry())];
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      const originalPositions = (geometry.getAttribute('position').array as Float32Array).slice();
      const originalNormals = (geometry.getAttribute('normal').array as Float32Array).slice();
      mesh.morphTargetInfluences = [0.4];
      const positions = geometry.getAttribute('position').array as Float32Array;
      positions[0] += 2;
      (geometry.getAttribute('normal').array as Float32Array)[0] = 0;

      restoreSourceGeometry(geometry, originalPositions, originalNormals);
      expect(geometry.getAttribute('position').array).toEqual(originalPositions);
      expect(geometry.getAttribute('normal').array).toEqual(originalNormals);
      expect(mesh.morphTargetInfluences).toEqual([0.4]);
    }
  });
});
