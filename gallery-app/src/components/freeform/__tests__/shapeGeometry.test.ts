import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { shapeFromModelBase } from '../../../lib/measurements';
import { applyShapeGeometry, cacheProfileCoefficients, getBoundsFromSnapshots, getGeometrySnapshot, isUneditedShape, restoreSourceGeometry } from '../shapeGeometry';

describe('original model geometry', () => {
  const profiles: Record<string, THREE.BufferGeometry> = {
    cylinder: new THREE.CylinderGeometry(1, 1, 3, 24, 24),
    rounded: new THREE.SphereGeometry(1, 24, 24),
    bowl: new THREE.LatheGeometry([new THREE.Vector2(.2, 0), new THREE.Vector2(.6, .2), new THREE.Vector2(1, .6)], 24),
    neck: new THREE.LatheGeometry([new THREE.Vector2(.5, 0), new THREE.Vector2(1, .5), new THREE.Vector2(.45, .8), new THREE.Vector2(.5, 1)], 24),
    square: new THREE.BoxGeometry(2, 3, 2, 4, 24, 4),
    irregular: new THREE.CylinderGeometry(.7, 1.2, 3, 7, 24).scale(1, 1, .65),
  };
  it.each(Object.keys(profiles))('deforms every control from immutable source geometry on %s models', (name) => {
    const mesh = new THREE.Mesh(profiles[name].clone());
    mesh.position.set(.3, .4, -.2);
    const root = new THREE.Group();
    root.add(mesh);
    const snapshot = getGeometrySnapshot(mesh, root)!;
    const bounds = getBoundsFromSnapshots([snapshot]);
    cacheProfileCoefficients(snapshot, bounds);
    const source = Array.from(snapshot.localPositions);
    const base = shapeFromModelBase({ height: 10, bodyWidth: 8, neckWidth: 5, rimSize: 4 });
    const sections = { body: .45, neck: .8, rim: .98 };
    for (const key of ['height', 'bodyWidth', 'neckWidth', 'rimSize', 'curvature'] as const) {
      const edited = { ...base, [key]: key === 'curvature' ? 100 : base[key] * 1.5 };
      applyShapeGeometry(mesh.geometry, snapshot, bounds, edited, sections);
      const first = Array.from(mesh.geometry.getAttribute('position').array);
      expect(first.every(Number.isFinite)).toBe(true);
      expect(first).not.toEqual(source);
      applyShapeGeometry(mesh.geometry, snapshot, bounds, edited, sections);
      expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(first);
      applyShapeGeometry(mesh.geometry, snapshot, bounds, base, sections);
      expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(source);
      expect(mesh.geometry.getAttribute('normal').array).toEqual(snapshot.localNormals);
    }
    const extreme = { ...base, height: 15, bodyWidth: 4, neckWidth: 7.5, rimSize: 2, curvature: 0 };
    applyShapeGeometry(mesh.geometry, snapshot, bounds, extreme, sections);
    expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
  });

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
