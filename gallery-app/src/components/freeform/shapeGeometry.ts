import * as THREE from 'three';
import { sectionScale } from './calibrateModel';
import { computePatternNormals } from './exteriorPatternMask';
import type { ShapeParamsInches } from '../../lib/measurements';

export type ShapeParams = Omit<ShapeParamsInches, 'unit'> & { unit?: 'cm' | 'in' };
type Shape = ShapeParams;

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

export type GeometrySnapshot = { localPositions: Float32Array; localNormals: Float32Array | null; rootPositions: Float32Array; profileCoefficients: Float32Array; rootToLocal: THREE.Matrix4 };
export type ModelBounds = { minY: number; rangeY: number; centerX: number; centerY: number; centerZ: number };

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normalizeParam(value: number, midpoint: number): number {
  return THREE.MathUtils.clamp((value - midpoint) / midpoint, -1, 1);
}

function localizedWeight(t: number, start: number, target: number, end: number): number {
  return t <= target ? smoothstep(start, target, t) : 1 - smoothstep(target, end, t);
}

export function getGeometrySnapshot(mesh: THREE.Mesh, root: THREE.Group): GeometrySnapshot | null {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  if (!position) return null;

  root.updateWorldMatrix(true, true);
  mesh.updateWorldMatrix(true, false);

  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const localToRoot = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
  const rootToLocal = new THREE.Matrix4().multiplyMatrices(
    new THREE.Matrix4().copy(mesh.matrixWorld).invert(),
    root.matrixWorld
  );

  const localPositions = position.array.slice() as Float32Array;
  const rootPositions = new Float32Array(localPositions.length);
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.set(localPositions[i * 3], localPositions[i * 3 + 1], localPositions[i * 3 + 2]);
    vertex.applyMatrix4(localToRoot);
    rootPositions[i * 3] = vertex.x;
    rootPositions[i * 3 + 1] = vertex.y;
    rootPositions[i * 3 + 2] = vertex.z;
  }

  const normal = geometry.attributes.normal;
  return { localPositions, localNormals: normal ? normal.array.slice() as Float32Array : null, rootPositions, profileCoefficients: new Float32Array(position.count * 4), rootToLocal };
}

export function getBoundsFromSnapshots(snapshots: Iterable<GeometrySnapshot>): ModelBounds {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const snapshot of snapshots) {
    for (let i = 0; i < snapshot.rootPositions.length; i += 3) {
      const x = snapshot.rootPositions[i];
      const y = snapshot.rootPositions[i + 1];
      const z = snapshot.rootPositions[i + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }

  return {
    minY,
    rangeY: maxY - minY || 1,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

export function cacheProfileCoefficients(snapshot: GeometrySnapshot, bounds: ModelBounds) {
  const { minY, rangeY } = bounds;
  const { rootPositions, profileCoefficients } = snapshot;
  const strength = 0.45;
  for (let vertexIndex = 0; vertexIndex < rootPositions.length / 3; vertexIndex++) {
    const t = Math.max(0, Math.min(1, (rootPositions[vertexIndex * 3 + 1] - minY) / rangeY));
    const baseInfluence = 1 - smoothstep(0.06, 0.3, t);
    const bodyInfluence = smoothstep(0.1, 0.35, t) * (1 - smoothstep(0.55, 0.75, t));
    const shoulderInfluence = smoothstep(0.5, 0.7, t) * (1 - smoothstep(0.7, 0.88, t));
    const neckInfluence = smoothstep(0.6, 0.8, t) * (1 - smoothstep(0.85, 0.96, t));
    const rimInfluence = smoothstep(0.82, 1.0, t);
    const coefficientIndex = vertexIndex * 4;
    profileCoefficients[coefficientIndex] = strength * (baseInfluence * 0.7 + bodyInfluence + shoulderInfluence * 0.5);
    profileCoefficients[coefficientIndex + 1] = strength * (shoulderInfluence * 0.5 + neckInfluence);
    profileCoefficients[coefficientIndex + 2] = strength * rimInfluence;
    profileCoefficients[coefficientIndex + 3] = Math.sin(t * Math.PI) * 0.16 - shoulderInfluence * 0.08;
  }
}


export function getShapeHeightScale(shape: ShapeParams): number {
  const baseline = shape.geometryMode === 'baseline' ? shape.baseline : undefined;
  return THREE.MathUtils.clamp(shape.height / (baseline?.height ?? (shape.unit === 'in' ? 25 / 2.54 : 25)), 0.35, 1.8);
}

export function applyShapeGeometry(
  geometry: THREE.BufferGeometry, snapshot: GeometrySnapshot, bounds: ModelBounds,
  shapeParams: ShapeParams, sections: { body: number; neck: number; rim: number },
): void {
  if (isUneditedShape(shapeParams)) {
    restoreSourceGeometry(geometry, snapshot.localPositions, snapshot.localNormals);
    return;
  }
  const factor = shapeParams.unit === 'in' ? 2.54 : 1;
  const geometryShapeParams = { ...shapeParams, height: shapeParams.height * factor,
    bodyWidth: shapeParams.bodyWidth * factor, neckWidth: shapeParams.neckWidth * factor, rimSize: shapeParams.rimSize * factor };
  const relativeBaseline = shapeParams.geometryMode === 'baseline' ? shapeParams.baseline : undefined;
  const baselineFactor = factor;
  const hScale = THREE.MathUtils.clamp(geometryShapeParams.height / (relativeBaseline ? relativeBaseline.height * baselineFactor : 25), 0.35, 1.8);
  const bodyDelta = normalizeParam(geometryShapeParams.bodyWidth, relativeBaseline ? relativeBaseline.bodyWidth * baselineFactor : 20);
  const neckDelta = normalizeParam(geometryShapeParams.neckWidth, relativeBaseline ? relativeBaseline.neckWidth * baselineFactor : 15);
  const rimDelta = normalizeParam(geometryShapeParams.rimSize, relativeBaseline ? relativeBaseline.rimSize * baselineFactor : 12);
  const curvatureDelta = normalizeParam(geometryShapeParams.curvature, 50);
  const profile = relativeBaseline ? shapeParams.targetProfile : undefined;
  const relativeAnchors = relativeBaseline && !profile ? ([
      [sections.body, geometryShapeParams.bodyWidth / (relativeBaseline.bodyWidth * baselineFactor)],
      [sections.neck, geometryShapeParams.neckWidth / (relativeBaseline.neckWidth * baselineFactor)],
      [sections.rim, geometryShapeParams.rimSize / (relativeBaseline.rimSize * baselineFactor)],
    ] as [number, number][]).sort((a, b) => a[0] - b[0]) : null;

  const { minY, rangeY, centerX, centerY, centerZ } = bounds;
  const rimStart = profile ? ((profile.neck ?? profile.body ?? 0.82) + profile.rim) / 2 : 0;
  const neckStart = profile?.body != null && profile.neck !== null ? (profile.body + profile.neck) / 2 : 0;
  const { rootPositions, profileCoefficients, rootToLocal } = snapshot;
  const pos = geometry.getAttribute('position');
  const rootVertex = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const ox = rootPositions[i * 3], oy = rootPositions[i * 3 + 1], oz = rootPositions[i * 3 + 2];
    const t = Math.max(0, Math.min(1, (oy - minY) / rangeY));
    const k = i * 4;
    let scaleXZ = relativeAnchors
      ? sectionScale(t, relativeAnchors) + profileCoefficients[k + 3] * curvatureDelta
      : 1 + profileCoefficients[k] * bodyDelta + profileCoefficients[k + 1] * neckDelta
        + profileCoefficients[k + 2] * rimDelta + profileCoefficients[k + 3] * curvatureDelta;
    if (profile) {
      scaleXZ = 1 + rimDelta * smoothstep(rimStart, profile.rim, t)
        + profileCoefficients[k + 3] * curvatureDelta;
      if (profile.body !== null) scaleXZ += bodyDelta * localizedWeight(t, 0.06, profile.body, profile.neck ?? profile.rim);
      if (profile.neck !== null) scaleXZ += neckDelta * localizedWeight(t, neckStart, profile.neck, profile.rim);
    }
    scaleXZ = THREE.MathUtils.clamp(scaleXZ, 0.25, 1.8);
    rootVertex.set(centerX + (ox - centerX) * scaleXZ, centerY + (oy - centerY) * hScale,
      centerZ + (oz - centerZ) * scaleXZ).applyMatrix4(rootToLocal);
    pos.setXYZ(i, rootVertex.x, rootVertex.y, rootVertex.z);
  }
  pos.needsUpdate = true;
  computePatternNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
