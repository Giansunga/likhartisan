import * as THREE from 'three';
import { PublicGLTFLoader } from '../../lib/publicModelLoader';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { ShapeTargetProfile } from '../../lib/measurements';

type Dimensions = { height: number; bodyWidth: number; neckWidth: number; rimSize: number };
type Point = THREE.Vector3;
type Triangle = [Point, Point, Point];

// glTF stores coordinates in meters. The admin form records physical inches.
const METERS_PER_INCH = 0.0254;

const targetOverrides: Readonly<Record<string, ShapeTargetProfile>> = {
  // Mini U-Shape Vase: its continuous wall opens straight into the rim.
  '9de75e12-fd41-43e7-89c0-6f6a1e51def1/1790400086755_8d06f3b5.glb': {
    version: 1, body: 0.8125, neck: null, rim: 0.98,
  },
};
const detectedTargets = new WeakMap<THREE.Group, ShapeTargetProfile>();

export function resolveShapeTargets(scene: THREE.Group, modelId: string | undefined, assetUrl: string): ShapeTargetProfile {
  const assetName = assetUrl.split(/[?#]/)[0].split('/').pop();
  const override = targetOverrides[`${modelId}/${assetName}`];
  if (override) return override;
  const cached = detectedTargets.get(scene);
  if (cached) return cached;

  const triangles = trianglesAtWorldPositions(scene);
  const bounds = new THREE.Box3();
  for (const triangle of triangles) for (const vertex of triangle) bounds.expandByPoint(vertex);
  const height = bounds.max.y - bounds.min.y;
  let profile: ShapeTargetProfile = { version: 1, body: null, neck: null, rim: 0.98 };
  if (Number.isFinite(height) && height > 0) {
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
    for (let i = 32; i <= 73; i++) {
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
    const bodyEnd = neckIndex === null ? 68 : neckIndex - 5;
    const bodyWidths = smooth.slice(12, bodyEnd + 1).map((width, offset) => {
      const i = offset + 12;
      return Math.min(width, smooth[i - 2], smooth[i + 2]);
    });
    const widest = Math.max(...bodyWidths);
    if (widest > 0 && smooth[77] > 0) {
      const comparable = bodyWidths.flatMap((width, i) => width >= widest * 0.985 ? [i + 12] : []);
      const bodyIndex = comparable[Math.floor(comparable.length / 2)];
      profile = { ...profile, body: (bodyIndex + 1) / steps, neck: neckIndex === null ? null : (neckIndex + 1) / steps };
    }
  }
  detectedTargets.set(scene, profile);
  return profile;
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
