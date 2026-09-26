import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const sourceIndices = new WeakMap<THREE.BufferGeometry, { indices: Uint32Array; count: number }>();
const exposureCache = new WeakMap<THREE.Object3D, Map<THREE.BufferGeometry, Uint8Array>>();

/** Give each face its own mask vertices, retaining the uploaded normals and groups. */
export function clonePatternGeometry(source: THREE.BufferGeometry) {
  if (!source.index) return source.clone();
  const geometry = source.toNonIndexed();
  sourceIndices.set(geometry, { indices: Uint32Array.from(source.index.array), count: source.attributes.position.count });
  return geometry;
}

/** Preserve source smoothing when shape edits update the expanded geometry. */
export function computePatternNormals(geometry: THREE.BufferGeometry) {
  const source = sourceIndices.get(geometry);
  if (!source) { geometry.computeVertexNormals(); return; }
  const position = geometry.getAttribute('position');
  const positions = new Float32Array(source.count * 3);
  for (let i = 0; i < position.count; i++) {
    const offset = source.indices[i] * 3;
    positions[offset] = position.getX(i);
    positions[offset + 1] = position.getY(i);
    positions[offset + 2] = position.getZ(i);
  }
  const original = new THREE.BufferGeometry();
  original.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  original.setIndex(new THREE.BufferAttribute(source.indices, 1));
  original.computeVertexNormals();
  const smooth = original.getAttribute('normal');
  const normals = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const sourceIndex = source.indices[i];
    normals[i * 3] = smooth.getX(sourceIndex);
    normals[i * 3 + 1] = smooth.getY(sourceIndex);
    normals[i * 3 + 2] = smooth.getZ(sourceIndex);
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  original.dispose();
}

/** Classify exterior faces independently of tessellation, roundness or ribs. */
export function updateExteriorPatternMask(scene: THREE.Object3D, reuseRadialExposure = false) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3()).length();
  const tolerance = Math.max(extent * 0.00001, 0.0000001);
  const exposure = reuseRadialExposure ? exposureCache.get(scene) || new Map() : new Map<THREE.BufferGeometry, Uint8Array>();
  exposureCache.set(scene, exposure);
  const meshes: THREE.Mesh[] = [];
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry.attributes.position) return;
    // The viewer prepares these before taking immutable shape snapshots.
    if (child.geometry.index) child.geometry = clonePatternGeometry(child.geometry);
    meshes.push(child);
  });
  const worldPositions = new Float32Array(meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count * 3, 0));
  if (!worldPositions.length) return;
  const vertex = new THREE.Vector3();
  let offset = 0;
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      vertex.toArray(worldPositions, offset);
      offset += 3;
    }
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.BufferAttribute(worldPositions, 3));
  let tree: MeshBVH | undefined;
  const ray = new THREE.Ray();
  const radial = new THREE.Vector3(), sample = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const centroid = new THREE.Vector3(), normal = new THREE.Vector3(), edge = new THREE.Vector3();
  const visible = (point: THREE.Vector3) => {
    tree ||= new MeshBVH(surface, { maxLeafTris: 8 });
    radial.set(point.x - center.x, 0, point.z - center.z).normalize();
    ray.origin.copy(point).addScaledVector(radial, extent);
    ray.direction.copy(radial).negate();
    const hit = tree.raycastFirst(ray, THREE.DoubleSide, 0, extent + tolerance);
    return hit != null && hit.distance >= extent - tolerance;
  };
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    const mask = new Float32Array(positions.count);
    const cached = exposure.get(mesh.geometry) || new Uint8Array(positions.count / 3);
    exposure.set(mesh.geometry, cached);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i + 2 < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i);
      b.fromBufferAttribute(positions, i + 1);
      c.fromBufferAttribute(positions, i + 2);
      normal.subVectors(b, a).cross(edge.subVectors(c, a)).applyMatrix3(normalMatrix).normalize();
      a.applyMatrix4(mesh.matrixWorld);
      b.applyMatrix4(mesh.matrixWorld);
      c.applyMatrix4(mesh.matrixWorld);
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      radial.set(centroid.x - center.x, 0, centroid.z - center.z).normalize();
      // Uploaded models can reverse their winding. Exposure, rather than the
      // normal's sign, distinguishes their exterior from the inner shell.
      if (Math.abs(normal.dot(radial)) <= 0.05 || Math.abs(normal.y) >= 0.85) continue;
      // A raised band can obscure a large face's center but leave its edges exposed.
      const largeFace = Math.max(a.distanceToSquared(b), a.distanceToSquared(c), b.distanceToSquared(c)) > (extent * 0.03) ** 2;
      const exposed = cached[i / 3] ? cached[i / 3] === 2
        : visible(centroid) || (largeFace && [a, b, c].some((corner) => visible(sample.copy(corner).lerp(centroid, 0.05))));
      cached[i / 3] = exposed ? 2 : 1;
      if (exposed) mask.fill(1, i, i + 3);
    }
    const attribute = mesh.geometry.getAttribute('decorExterior');
    if (attribute?.count === mask.length) {
      (attribute.array as Float32Array).set(mask);
      attribute.needsUpdate = true;
    } else mesh.geometry.setAttribute('decorExterior', new THREE.BufferAttribute(mask, 1));
  }
  surface.dispose();
}
