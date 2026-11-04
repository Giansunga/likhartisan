import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { shapeFromModelBase } from '../../../lib/measurements';
import { resolveShapeTargets } from '../calibrateModel';
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

describe('model-specific width targets', () => {
  function createVessel(points: [number, number][]) {
    const rings = points.flatMap(([height, radius], i) => {
      const next = points[i + 1];
      if (!next) return [new THREE.Vector2(radius, height)];
      return Array.from({ length: 20 }, (_, j) => new THREE.Vector2(
        THREE.MathUtils.lerp(radius, next[1], j / 20),
        THREE.MathUtils.lerp(height, next[0], j / 20),
      ));
    });
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(rings, 32));
    const root = new THREE.Group();
    root.add(mesh);
    return { mesh, root };
  }

  it('finds a high body and a short neck close to the rim', () => {
    const { mesh, root } = createVessel([
      [0, 0.55], [0.5, 0.8], [0.75, 1], [0.81, 1], [0.9, 0.5], [0.94, 0.5], [1, 0.65],
    ]);
    const profile = resolveShapeTargets(root, undefined, '/short-neck.glb');
    expect(profile.body).toBeGreaterThan(0.73);
    expect(profile.neck).toBeGreaterThan(0.89);
    const snapshot = getGeometrySnapshot(mesh, root)!;
    const bounds = getBoundsFromSnapshots([snapshot]);
    cacheProfileCoefficients(snapshot, bounds);
    const base = { ...shapeFromModelBase({ height: 10, bodyWidth: 8, neckWidth: 5, rimSize: 4 }), targetProfile: profile };
    const widthAt = (height: number) => {
      const positions = mesh.geometry.getAttribute('position');
      let radius = 0;
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(positions.getY(i) - height) < 1e-5) radius = Math.max(radius, Math.hypot(positions.getX(i), positions.getZ(i)));
      }
      return 2 * radius;
    };
    const legacySections = { body: 0.45, neck: 0.8, rim: 0.98 };
    applyShapeGeometry(mesh.geometry, snapshot, bounds, { ...base, bodyWidth: 12 }, legacySections);
    expect(widthAt(0.75)).toBeGreaterThan(2.9);
    expect(widthAt(0.94)).toBeCloseTo(1, 5);
    expect(widthAt(1)).toBeCloseTo(1.3, 5);
    applyShapeGeometry(mesh.geometry, snapshot, bounds, { ...base, neckWidth: 7.5 }, legacySections);
    expect(widthAt(0.75)).toBeCloseTo(2, 5);
    expect(widthAt(0.92)).toBeGreaterThan(1.45);
    expect(widthAt(1)).toBeCloseTo(1.3, 5);
    applyShapeGeometry(mesh.geometry, snapshot, bounds, base, legacySections);
    expect(mesh.geometry.getAttribute('position').array).toEqual(snapshot.localPositions);
  });

  it('recognizes a bowl and a straight planter as neckless', () => {
    for (const points of [
      [[0, 0.35], [0.4, 0.8], [1, 1]],
      [[0, 0.8], [1, 0.8]],
    ] as [number, number][][]) {
      const { root } = createVessel(points);
      const profile = resolveShapeTargets(root, undefined, '/neckless.glb');
      expect(profile.body).not.toBeNull();
      expect(profile.neck).toBeNull();
    }
  });
});
