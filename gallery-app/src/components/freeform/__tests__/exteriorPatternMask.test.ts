import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clonePatternGeometry, computePatternNormals, updateExteriorPatternMask } from '../exteriorPatternMask';

describe('pot exterior pattern mask', () => {
  it('marks the outside wall while excluding the open interior and top rim', () => {
    const profile = [
      new THREE.Vector2(1.9, -2), new THREE.Vector2(2, -1), new THREE.Vector2(2, 0),
      new THREE.Vector2(2, 1), new THREE.Vector2(2, 2),
      new THREE.Vector2(1.6, 2), new THREE.Vector2(1.6, 1),
      new THREE.Vector2(1.6, 0), new THREE.Vector2(1.6, -1),
    ];
    const pot = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
    const scene = new THREE.Group();
    scene.add(pot);

    updateExteriorPatternMask(scene);
    const positions = pot.geometry.getAttribute('position');
    const mask = pot.geometry.getAttribute('decorExterior');
    let exteriorCount = 0;
    for (let index = 0; index < positions.count; index += 3) {
      const radius = [0, 1, 2].reduce((sum, n) => sum + Math.hypot(positions.getX(index + n), positions.getZ(index + n)), 0) / 3;
      const y = [0, 1, 2].reduce((sum, n) => sum + positions.getY(index + n), 0) / 3;
      if (radius > 1.9 && Math.abs(y) < 1.5) { exteriorCount++; expect(mask.getX(index)).toBe(1); }
      if (radius < 1.7 || y > 1.95) expect(mask.getX(index)).toBe(0);
      expect(mask.getX(index + 1)).toBe(mask.getX(index));
      expect(mask.getX(index + 2)).toBe(mask.getX(index));
    }
    expect(exteriorCount).toBeGreaterThan(0);
  });

  it('does not mark a separate attachment when only the pot is processed', () => {
    const design = new THREE.Group();
    const scene = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 4, 24), new THREE.MeshStandardMaterial());
    const attachment = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    design.add(scene, attachment);
    scene.add(pot);
    updateExteriorPatternMask(scene);
    expect(pot.geometry.getAttribute('decorExterior')).toBeDefined();
    expect(attachment.geometry.getAttribute('decorExterior')).toBeUndefined();
  });

  it('covers complete square wall triangles including their top and bottom corners', () => {
    const pot = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4));
    updateExteriorPatternMask(pot);
    const normal = pot.geometry.getAttribute('normal');
    const mask = pot.geometry.getAttribute('decorExterior');
    for (let i = 0; i < normal.count; i++) expect(mask.getX(i)).toBe(Math.abs(normal.getY(i)) < 0.1 ? 1 : 0);
  });

  it('keeps exposed wall faces beside raised bands eligible', () => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 4, 48, 12, true));
    const band = new THREE.Mesh(new THREE.TorusGeometry(2, 0.18, 8, 48));
    band.rotation.x = Math.PI / 2;
    const scene = new THREE.Group();
    scene.add(pot, band);
    updateExteriorPatternMask(scene);
    const position = pot.geometry.getAttribute('position');
    const mask = pot.geometry.getAttribute('decorExterior');
    for (let i = 0; i < position.count; i += 3) {
      const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
      if (Math.abs(y) > 0.25) expect(mask.getX(i)).toBe(1);
    }
  });

  it('rejects an outward-wound inner shell hidden behind the exterior', () => {
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 4, 32, 1, true));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 4, 32, 1, true));
    const scene = new THREE.Group();
    scene.add(outer, inner);
    updateExteriorPatternMask(scene);
    expect(Array.from(inner.geometry.getAttribute('decorExterior').array).every((value) => value === 0)).toBe(true);
    expect(Array.from(outer.geometry.getAttribute('decorExterior').array).every((value) => value === 1)).toBe(true);
  });

  it('preserves smooth normals, material groups and source geometry after expansion', () => {
    const source = new THREE.CylinderGeometry(2, 2, 4, 24);
    const prepared = clonePatternGeometry(source);
    expect(Array.from(prepared.getAttribute('normal').array)).toEqual(Array.from(source.toNonIndexed().getAttribute('normal').array));
    const reshaped = source.clone();
    reshaped.computeVertexNormals();
    const expected = reshaped.toNonIndexed().getAttribute('normal');
    computePatternNormals(prepared);
    const actual = prepared.getAttribute('normal');
    for (let i = 0; i < actual.array.length; i++) expect(actual.array[i]).toBeCloseTo(expected.array[i], 5);
    expect(prepared.groups).toEqual(source.groups);
    expect(source.index).not.toBeNull();
  });

  it('supports reversed winding and keeps exposure valid after radial shape edits', () => {
    const geometry = new THREE.CylinderGeometry(2, 2, 4, 32, 4, true);
    const indices = geometry.index!;
    for (let i = 0; i < indices.count; i += 3) {
      const b = indices.getX(i + 1);
      indices.setX(i + 1, indices.getX(i + 2));
      indices.setX(i + 2, b);
    }
    const pot = new THREE.Mesh(geometry);
    updateExteriorPatternMask(pot);
    expect(Array.from(pot.geometry.getAttribute('decorExterior').array).every(v => v === 1)).toBe(true);
    const p = pot.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const factor = 1.2 + p.getY(i) * 0.04;
      p.setXYZ(i, p.getX(i) * factor, p.getY(i) * 1.2, p.getZ(i) * factor);
    }
    pot.geometry.computeBoundingBox();
    updateExteriorPatternMask(pot, true);
    const cached = Array.from(pot.geometry.getAttribute('decorExterior').array);
    updateExteriorPatternMask(pot);
    expect(Array.from(pot.geometry.getAttribute('decorExterior').array)).toEqual(cached);
  });
});
