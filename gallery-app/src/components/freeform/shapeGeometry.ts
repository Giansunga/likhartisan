import * as THREE from 'three';

type Dimensions = { height: number; bodyWidth: number; neckWidth: number; rimSize: number };
type Shape = Dimensions & { curvature: number; unit?: 'cm' | 'in'; geometryMode?: 'baseline'; baseline?: Dimensions };

export function isUneditedShape(shape: Shape): boolean {
  const factor = shape.unit === 'in' ? 2.54 : 1;
  const baseline = shape.geometryMode === 'baseline' && shape.baseline
    ? shape.baseline
    : { height: 25 / factor, bodyWidth: 20 / factor, neckWidth: 15 / factor, rimSize: 12 / factor };
  return (['height', 'bodyWidth', 'neckWidth', 'rimSize'] as const).every((key) =>
    Math.abs(shape[key] - baseline[key]) < 0.000001
  ) && Math.abs(shape.curvature - 50) < 0.000001;
}

export function restoreSourceGeometry(geometry: THREE.BufferGeometry, positions: Float32Array, normals: Float32Array | null): void {
  const position = geometry.getAttribute('position');
  (position.array as Float32Array).set(positions);
  position.needsUpdate = true;
  const normal = geometry.getAttribute('normal');
  if (normal && normals) {
    (normal.array as Float32Array).set(normals);
    normal.needsUpdate = true;
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
