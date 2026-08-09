import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { applyFinishToScene, generateCylindricalUVs } from '../components/freeform/finishMaterials';
import type { MaterialParams } from '../components/freeform/materials';

type ShapeParams = { height: number; bodyWidth: number; neckWidth: number; rimSize: number; curvature: number };

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normalizeParam(value: number, midpoint: number): number {
  return THREE.MathUtils.clamp((value - midpoint) / midpoint, -1, 1);
}

function getProfileScale(t: number, shapeParams: ShapeParams): number {
  const bodyDelta = normalizeParam(shapeParams.bodyWidth, 20);
  const neckDelta = normalizeParam(shapeParams.neckWidth, 15);
  const rimDelta = normalizeParam(shapeParams.rimSize, 12);
  const curvature = normalizeParam(shapeParams.curvature, 50);

  const baseInfluence = 1 - smoothstep(0.06, 0.3, t);
  const bodyInfluence = smoothstep(0.1, 0.35, t) * (1 - smoothstep(0.55, 0.75, t));
  const shoulderInfluence = smoothstep(0.5, 0.7, t) * (1 - smoothstep(0.7, 0.88, t));
  const neckInfluence = smoothstep(0.6, 0.8, t) * (1 - smoothstep(0.85, 0.96, t));
  const rimInfluence = smoothstep(0.82, 1.0, t);

  const strength = 0.45;
  let scaleOffset = 0;
  scaleOffset += baseInfluence * bodyDelta * strength * 0.7;
  scaleOffset += bodyInfluence * bodyDelta * strength;
  scaleOffset += shoulderInfluence * ((bodyDelta + neckDelta) / 2) * strength;
  scaleOffset += neckInfluence * neckDelta * strength;
  scaleOffset += rimInfluence * rimDelta * strength;

  const bellyCurve = Math.sin(t * Math.PI) * 0.16 * curvature;
  const shoulderCurve = shoulderInfluence * -0.08 * curvature;

  return THREE.MathUtils.clamp(1 + scaleOffset + bellyCurve + shoulderCurve, 0.25, 1.8);
}

type GeometrySnapshot = { rootPositions: Float32Array; rootToLocal: THREE.Matrix4 };
type ModelBounds = { minY: number; rangeY: number; centerX: number; centerY: number; centerZ: number };

function getGeometrySnapshot(mesh: THREE.Mesh, root: THREE.Group): GeometrySnapshot | null {
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

  return { rootPositions, rootToLocal };
}

function getBoundsFromSnapshots(snapshots: Iterable<GeometrySnapshot>): ModelBounds {
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

function applyDeformationToClone(clone: THREE.Group, shapeParams: ShapeParams): void {
  clone.updateMatrixWorld(true);

  const geometrySnapshots = new Map<THREE.BufferGeometry, GeometrySnapshot>();

  clone.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const snapshot = getGeometrySnapshot(child, clone);
      if (snapshot) geometrySnapshots.set(child.geometry, snapshot);
    }
  });

  if (geometrySnapshots.size === 0) return;

  const modelBounds = getBoundsFromSnapshots(geometrySnapshots.values());
  const hScale = THREE.MathUtils.clamp(shapeParams.height / 25, 0.35, 1.8);
  const { minY, rangeY, centerX, centerY, centerZ } = modelBounds;
  const rootVertex = new THREE.Vector3();
  const localVertex = new THREE.Vector3();

  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const snapshot = geometrySnapshots.get(child.geometry);
    if (!snapshot) return;

    const pos = child.geometry.attributes.position;
    const arr = pos.array as Float32Array;
    const count = pos.count;
    const { rootPositions, rootToLocal } = snapshot;

    for (let i = 0; i < count; i++) {
      const ox = rootPositions[i * 3];
      const oy = rootPositions[i * 3 + 1];
      const oz = rootPositions[i * 3 + 2];

      const t = Math.max(0, Math.min(1, (oy - minY) / rangeY));
      const scaleXZ = getProfileScale(t, shapeParams);

      rootVertex.set(
        centerX + (ox - centerX) * scaleXZ,
        centerY + (oy - centerY) * hScale,
        centerZ + (oz - centerZ) * scaleXZ
      );
      localVertex.copy(rootVertex).applyMatrix4(rootToLocal);

      arr[i * 3] = localVertex.x;
      arr[i * 3 + 1] = localVertex.y;
      arr[i * 3 + 2] = localVertex.z;
    }

    pos.needsUpdate = true;
    child.geometry.computeVertexNormals();
    child.geometry.computeBoundingBox();
    child.geometry.computeBoundingSphere();
  });
}

export async function exportSceneToGLB(
  baseScene: THREE.Group,
  shapeParams: ShapeParams,
  materialParams: MaterialParams,
): Promise<ArrayBuffer | null> {
  if (!baseScene) return null;

  const clone = baseScene.clone(true);

  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry = child.geometry.clone();
      if (Array.isArray(child.material)) {
        child.material = child.material.map((mat) => mat.clone());
      } else {
        child.material = child.material.clone();
      }
    }
  });
  clone.updateMatrixWorld(true);

  generateCylindricalUVs(clone);
  applyDeformationToClone(clone, shapeParams);
  applyFinishToScene(clone, materialParams);

  return new Promise<ArrayBuffer | null>((resolve) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      clone,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          const json = JSON.stringify(result);
          resolve(new TextEncoder().encode(json).buffer);
        }
      },
      // @ts-expect-error GLTFExporter callback signature
      (error: Error) => {
        console.error('GLB export failed:', error);
        resolve(null);
      },
      { binary: true }
    );
  });
}

export function downloadGLB(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${filename}.glb`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportSnapshotDimensions(shapeParams: ShapeParams): { width: number; height_cm: number } {
  return {
    width: shapeParams.bodyWidth,
    height_cm: shapeParams.height,
  };
}
