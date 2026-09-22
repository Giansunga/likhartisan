import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

type Dimensions = { height: number; bodyWidth: number; neckWidth: number; rimSize: number };
type Point = THREE.Vector3;
type Triangle = [Point, Point, Point];

// glTF stores coordinates in meters. The admin form records physical inches.
const METERS_PER_INCH = 0.0254;

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
    new GLTFLoader().parse(sourceBuffer, '', (gltf) => resolve(gltf.scene), reject);
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
