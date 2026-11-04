import * as THREE from 'three';
import { PublicGLTFLoader } from '../../lib/publicModelLoader';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { ShapeTargetProfileV3 } from '../../lib/measurements';

type Dimensions = { height: number; bodyWidth: number; neckWidth: number; rimSize: number };
type Point = THREE.Vector3;
type Triangle = [Point, Point, Point];

// glTF stores coordinates in meters. The admin form records physical inches.
const METERS_PER_INCH = 0.0254;

const targetOverrides: Readonly<Record<string, Partial<ShapeTargetProfileV3>>> = {
  // Target existing wall rings on the coarse Mini U-Shape Vase mesh.
  '9de75e12-fd41-43e7-89c0-6f6a1e51def1/1790400086755_8d06f3b5.glb': {
    body: 0.7278, neck: 0.8674, neckKind: 'upperWall', lipStart: 0.9579,
  },
  'e474b847-db24-4b11-bab9-d4aed0628abb/original-e474b847-db24-4b11-bab9-d4aed0628abb-a2a2a8a0d47c8bd9.glb': {
    body: 0.62, neck: 0.82, neckKind: 'upperWall',
    limits: { bodyWidth: [0.75, 1.5], neckWidth: [0.85, 1.15] },
  },
  // The coarse lip spans 94–100% of the Jarlet's height.
  '14705771-7788-4c5b-b18d-42e1fdc3e059/1790431315660_d443df7f.glb': {
    rim: 0.94, lipStart: 0.935,
  },
  // Full lip movement starts below the mouth reference plane so the
  // interior faces crossing that plane scale with the exterior lip.
  'ac003cd7-178d-423c-8672-3a4ca742b23d/1790220280284_bd2255cc.glb': {
    lipStart: 0.953,
  },
  'eeb89cd2-85bb-4f8e-9605-935d7c25a800/original-eeb89cd2-85bb-4f8e-9605-935d7c25a800-1d42669d00ce6aa3.glb': {
    foot: 0.14,
  },
};
const detectedTargets = new WeakMap<THREE.Group, { asset: string; profile: ShapeTargetProfileV3 }>();

export function resolveShapeTargets(scene: THREE.Group, modelId: string | undefined, assetUrl: string): ShapeTargetProfileV3 {
  const assetName = assetUrl.split(/[?#]/)[0].split('/').pop();
  const asset = `${modelId}/${assetName}`;
  const override = targetOverrides[asset];
  const cached = detectedTargets.get(scene);
  if (cached?.asset === asset) return cached.profile;

  const allTriangles = trianglesAtWorldPositions(scene);
  const allBounds = boundsOf(allTriangles);
  const triangles = mainVessel(allTriangles, allBounds);
  const bounds = boundsOf(triangles);
  const totalHeight = allBounds.max.y - allBounds.min.y;
  const height = bounds.max.y - bounds.min.y;
  const profile: ShapeTargetProfileV3 = {
    version: 3, base: 0, top: 0, foot: 0, body: null, neck: null, neckKind: null, rim: null, mouthStart: null, curve: [],
  };
  if (Number.isFinite(height) && height > 0 && Number.isFinite(totalHeight)) {
    const toRootHeight = (t: number) => THREE.MathUtils.clamp((bounds.min.y + height * t - allBounds.min.y) / totalHeight, 0, 1);
    profile.base = toRootHeight(0);
    profile.top = toRootHeight(1);
    const rim = override?.rim === undefined ? findMouthBand(triangles, bounds) : override.rim;
    detectWallTargets(triangles, bounds, rim, profile, toRootHeight, override);
  }
  detectedTargets.set(scene, { asset, profile });
  return profile;
}

function boundsOf(triangles: Triangle[]) {
  const bounds = new THREE.Box3();
  for (const triangle of triangles) for (const vertex of triangle) bounds.expandByPoint(vertex);
  return bounds;
}

// Weld coincident vertices for connectivity across GLB material and UV seams.
// Weight components by surface area so a dense, detached accessory cannot win.
function mainVessel(triangles: Triangle[], bounds: THREE.Box3): Triangle[] {
  if (!triangles.length) return [];
  const epsilon = bounds.getSize(new THREE.Vector3()).length() * 1e-6 || 1e-8;
  const parents = Int32Array.from(triangles, (_, i) => i);
  const firstOwner = new Map<string, number>();
  function root(index: number): number {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  }
  triangles.forEach((triangle, i) => {
    for (const p of triangle) {
      const key = `${Math.round(p.x / epsilon)},${Math.round(p.y / epsilon)},${Math.round(p.z / epsilon)}`;
      const owner = firstOwner.get(key);
      if (owner === undefined) firstOwner.set(key, i);
      else parents[root(i)] = root(owner);
    }
  });
  const areas = new Float64Array(triangles.length);
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  let largest = 0;
  triangles.forEach(([a, b, c], i) => {
    const component = root(i);
    areas[component] += edgeA.subVectors(b, a).cross(edgeB.subVectors(c, a)).length();
    if (areas[component] > areas[largest]) largest = component;
  });
  return triangles.filter((_, i) => root(i) === largest);
}

// The lowest point of the upper envelope across azimuths keeps a scalloped
// or tilted lip together. A sector gap or a central cap leaves Rim unavailable.
function findMouthBand(triangles: Triangle[], bounds: THREE.Box3): number | null {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const sectors = Array<number>(24).fill(-Infinity);
  const mouthRadius = Math.min(size.x, size.z) * 0.12;
  for (const triangle of triangles) for (const point of triangle) {
    const x = point.x - center.x;
    const z = point.z - center.z;
    if (Math.hypot(x, z) < mouthRadius) continue;
    const angle = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    const sector = Math.floor(angle * sectors.length) % sectors.length;
    sectors[sector] = Math.max(sectors[sector], (point.y - bounds.min.y) / size.y);
  }
  const bottom = Math.min(...sectors);
  if (bottom < 0.65 || !Number.isFinite(bottom)) return null;
  const cap = triangles.some(([a, b, c]) =>
    [a, b, c].every((p) => p.y > bounds.min.y + size.y * (bottom - 0.025))
      && Math.hypot((a.x + b.x + c.x) / 3 - center.x, (a.z + b.z + c.z) / 3 - center.z) < mouthRadius * 0.5);
  return cap ? null : Math.min(0.985, bottom - 0.025);
}

function detectWallTargets(
  triangles: Triangle[], bounds: THREE.Box3, rim: number | null, profile: ShapeTargetProfileV3,
  toRootHeight: (height: number) => number, override?: Partial<ShapeTargetProfileV3>,
) {
  const height = bounds.max.y - bounds.min.y;
  const steps = 80;
  const slices: Triangle[][] = Array.from({ length: steps - 1 }, () => []);
  const sliceY = slices.map((_, i) => bounds.min.y + height * (i + 1) / steps);
  for (const triangle of triangles) {
    const [a, b, c] = triangle;
    const low = Math.min(a.y, b.y, c.y);
    const high = Math.max(a.y, b.y, c.y);
    const first = Math.max(0, Math.floor((low - bounds.min.y) / height * steps) - 1);
    const last = Math.min(slices.length - 1, Math.ceil((high - bounds.min.y) / height * steps) - 1);
    for (let i = first; i <= last; i++) {
      if (sliceY[i] >= low && sliceY[i] <= high) slices[i].push(triangle);
    }
  }
  const widths = slices.map((triangles, i) => sectionWidth(triangles, sliceY[i]));
  const smooth = widths.map((width, i) =>
    (widths[i - 1] ?? width) * 0.25 + width * 0.5 + (widths[i + 1] ?? width) * 0.25);
  // A neck must follow a shoulder and either open toward the rim or
  // remain narrow for several slices. A tapered upper wall alone is not a neck.
  let neckIndex: number | null = null;
  let neckScore = 0;
  for (let i = 32; i <= Math.min(73, Math.floor(((rim ?? 1) - 0.04) * steps) - 1); i++) {
    const width = smooth[i];
    const shoulder = Math.max(...smooth.slice(14, i - 4));
    const upper = smooth.slice(i + 1, Math.min(i + 6, smooth.length));
    if (width <= 0 || shoulder < width * 1.12 || smooth[i - 3] < width * 0.99
      || upper.some((sample) => sample < width * 0.98)
      || Math.min(...upper.slice(0, 2)) > width * 1.12) continue;
    const score = (shoulder - width) / shoulder;
    if (score > neckScore + 0.005) {
      neckIndex = i;
      neckScore = score;
    }
  }
  const span = profile.top - profile.base;
  const lip = override?.lipStart ?? toRootHeight(rim ?? 1);
  const naturalNeck = override?.neck !== undefined ? override.neck
    : neckIndex === null ? null : toRootHeight((neckIndex + 1) / steps);
  const neck = naturalNeck === null ? null : Math.min(naturalNeck, lip - span * 0.05);
  const bodyCeiling = neck === null ? lip - span * 0.125 : neck - span * 0.05;
  const bodyEnd = Math.min(68, Math.floor((bodyCeiling - profile.base) / span * steps + 1e-8) - 1);
  const bodyWidths = smooth.slice(12, bodyEnd + 1).map((width, offset) => {
    const i = offset + 12;
    return Math.min(width, smooth[i - 2], smooth[i + 2]);
  });
  const widest = Math.max(...bodyWidths);
  const footIndex = smooth.slice(2, 10).findIndex((width, i) =>
    width > 0 && Math.abs(smooth[i + 3] - width) < widest * 0.04);
  profile.foot = override?.foot ?? toRootHeight((footIndex < 0 ? 5 : footIndex + 3) / steps);
  if (widest > 0) {
    const comparable = bodyWidths.flatMap((width, i) => width >= widest * 0.985 ? [i + 12] : []);
    const bodyIndex = comparable[Math.floor(comparable.length / 2)];
    profile.body = toRootHeight((bodyIndex + 1) / steps);
  }
  if (override?.body != null && override.body <= bodyCeiling + 1e-8) profile.body = override.body;
  if (profile.body !== null && rim !== null) {
    profile.neck = neck ?? THREE.MathUtils.lerp(profile.body, lip, 0.6);
    profile.neckKind = override?.neckKind ?? (neck === null ? 'upperWall' : 'natural');
  }
  if (rim !== null) {
    const rimHeight = toRootHeight(rim);
    const wall = profile.neck ?? profile.body ?? profile.foot;
    if (rimHeight > wall + 0.02) {
      profile.rim = rimHeight;
      profile.mouthStart = THREE.MathUtils.lerp(wall, lip, 0.35);
      if (override?.lipStart !== undefined) profile.lipStart = lip;
    }
  }
  if (profile.body === null) return;
  const upperWall = profile.neck === null
    ? profile.mouthStart ?? toRootHeight(0.9)
    : (profile.body + profile.neck) / 2;
  const widthAt = (t: number) => {
    const local = (t - profile.base) / (profile.top - profile.base);
    const index = THREE.MathUtils.clamp(local * steps - 1, 0, smooth.length - 1);
    return THREE.MathUtils.lerp(smooth[Math.floor(index)], smooth[Math.ceil(index)], index % 1);
  };
  for (const [start, end] of [[profile.foot, profile.body], [profile.body, upperWall]]) {
    // Very short upper-wall bands can sit entirely between vertex rings.
    // Keep rounding on the main wall instead of creating a small bulge at the shoulder.
    if (end - start < span * (start === profile.body ? 0.12 : 0.075)) continue;
    const peak = (start + end) / 2;
    const original = widthAt(peak);
    if (original <= 0) continue;
    const chord = (widthAt(start) + widthAt(end)) / 2;
    profile.curve.push([start, peak, end, THREE.MathUtils.clamp(chord / original - 1, -0.2, 0.2)]);
  }
  if (override?.limits) profile.limits = override.limits;
}

function trianglesAtWorldPositions(scene: THREE.Group): Triangle[] {
  const triangles: Triangle[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (!positions) return;
    const indices = object.geometry.getIndex();
    const count = indices?.count ?? positions.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const vertices = [0, 1, 2].map((offset) => {
        const index = indices?.getX(i + offset) ?? i + offset;
        return new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      }) as Triangle;
      triangles.push(vertices);
    }
  });
  return triangles;
}

function sectionWidth(triangles: Triangle[], y: number): number {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const triangle of triangles) {
    for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      if ((a.y < y && b.y < y) || (a.y > y && b.y > y)) continue;
      const fraction = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      const x = a.x + (b.x - a.x) * fraction;
      const z = a.z + (b.z - a.z) * fraction;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  return Number.isFinite(minX) ? Math.max(maxX - minX, maxZ - minZ) : 0;
}

function getSections(triangles: Triangle[]) {
  const bounds = new THREE.Box3();
  for (const triangle of triangles) for (const vertex of triangle) bounds.expandByPoint(vertex);
  if (bounds.isEmpty()) throw new Error('The model contains no measurable mesh.');
  const height = bounds.max.y - bounds.min.y;
  if (height <= 0) throw new Error('The model has no measurable height.');
  const widthAt = (t: number) => sectionWidth(triangles, bounds.min.y + height * t);
  const body = Array.from({ length: 21 }, (_, i) => ({ t: 0.18 + i * 0.027, width: widthAt(0.18 + i * 0.027) }))
    .reduce((largest, value) => value.width > largest.width ? value : largest);
  const neck = Array.from({ length: 11 }, (_, i) => ({ t: 0.70 + i * 0.019, width: widthAt(0.70 + i * 0.019) }))
    .filter((value) => value.width > 0)
    .reduce((smallest, value) => value.width < smallest.width ? value : smallest, { t: 0.8, width: Infinity });
  const rim = { t: 0.98, width: widthAt(0.98) };
  if (!body.width || !Number.isFinite(neck.width) || !rim.width) {
    throw new Error('Could not measure the body, neck, and rim of this GLB. Use a complete upright pottery mesh.');
  }
  return { bounds, height, body, neck, rim };
}

export function sectionScale(t: number, anchors: [number, number][]): number {
  if (t <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    if (t <= anchors[i][0]) {
      const [startT, startScale] = anchors[i - 1];
      const [endT, endScale] = anchors[i];
      const progress = (t - startT) / (endT - startT);
      return startScale + (endScale - startScale) * progress;
    }
  }
  return anchors[anchors.length - 1][1];
}

export function getSectionAnchors(scene: THREE.Group): { body: number; neck: number; rim: number } {
  const { body, neck, rim } = getSections(trianglesAtWorldPositions(scene));
  return { body: body.t, neck: neck.t, rim: rim.t };
}

export function measureModelScene(scene: THREE.Group): Dimensions {
  const { height, body, neck, rim } = getSections(trianglesAtWorldPositions(scene));
  return { height: height / METERS_PER_INCH, bodyWidth: body.width / METERS_PER_INCH,
    neckWidth: neck.width / METERS_PER_INCH, rimSize: rim.width / METERS_PER_INCH };
}

export function calibrateModelScene(scene: THREE.Group, dimensions: Dimensions, attempt = 0): THREE.Group {
  const calibrated = scene.clone(true);
  calibrated.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry = object.geometry.clone();
  });
  const source = getSections(trianglesAtWorldPositions(calibrated));
  const center = source.bounds.getCenter(new THREE.Vector3());
  const ratios = {
    body: dimensions.bodyWidth * METERS_PER_INCH / source.body.width,
    neck: dimensions.neckWidth * METERS_PER_INCH / source.neck.width,
    rim: dimensions.rimSize * METERS_PER_INCH / source.rim.width,
  };
  const anchors = [[source.body.t, ratios.body], [source.neck.t, ratios.neck], [source.rim.t, ratios.rim]] as [number, number][];
  anchors.sort((a, b) => a[0] - b[0]);
  const heightScale = dimensions.height * METERS_PER_INCH / source.height;
  calibrated.updateMatrixWorld(true);
  calibrated.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const toWorld = object.matrixWorld;
    const toLocal = toWorld.clone().invert();
    const positions = object.geometry.getAttribute('position');
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(toWorld);
      const t = (point.y - source.bounds.min.y) / source.height;
      const radialScale = sectionScale(t, anchors);
      point.set(center.x + (point.x - center.x) * radialScale,
        center.y + (point.y - center.y) * heightScale,
        center.z + (point.z - center.z) * radialScale).applyMatrix4(toLocal);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    object.geometry.computeVertexNormals();
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
  });
  const measured = getSections(trianglesAtWorldPositions(calibrated));
  const target = [dimensions.height, dimensions.bodyWidth, dimensions.neckWidth, dimensions.rimSize].map((value) => value * METERS_PER_INCH);
  const actual = [measured.height, measured.body.width, measured.neck.width, measured.rim.width];
  if (actual.some((value, i) => Math.abs(value - target[i]) > target[i] * 0.005)) {
    if (attempt < 3) return calibrateModelScene(calibrated, dimensions, attempt + 1);
    throw new Error('This model could not be calibrated to the entered measurements. Check the mesh orientation and dimensions.');
  }
  return calibrated;
}

export async function calibrateModelFile(file: File, dimensions: Dimensions): Promise<File> {
  const sourceBuffer = await file.arrayBuffer();
  const source = await new Promise<THREE.Group>((resolve, reject) => {
    new PublicGLTFLoader().parse(sourceBuffer, '', (gltf) => resolve(gltf.scene), reject);
  });
  const scene = calibrateModelScene(source, dimensions);
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(scene, (result) => {
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('Could not create a calibrated GLB.'));
    }, reject, { binary: true });
  });
  return new File([buffer], `${file.name.replace(/\.(glb|gltf)$/i, '')}-calibrated.glb`, { type: 'model/gltf-binary' });
}
