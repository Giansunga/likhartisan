import * as THREE from 'three';
import type { AttachmentFamily } from './attachments';

export type AttachmentEnvelope = {
  width: number;
  height: number;
  depth: number;
  contactRadius: number;
  triangleBudget: number;
};

export type GeneratedAttachmentRecipe = {
  key: string;
  version: number;
  name: string;
  family: AttachmentFamily;
  style: 'filipino' | 'minimal';
  description: string;
  thumbnail: string;
  envelope: AttachmentEnvelope;
  scaleRatio: number;
  /** Local Y coordinates of the two surface contacts after the recipe is built. */
  mountContactY?: readonly [number, number];
  build: () => THREE.Group;
};

const clay = () => new THREE.MeshStandardMaterial({ color: '#BE734F', roughness: 0.85, metalness: 0 });

type ThicknessController = (multiplier: number) => void;
const thicknessControllers = new WeakMap<THREE.Group, ThicknessController[]>();

function registerThicknessController(group: THREE.Group, controller: ThicknessController) {
  const controllers = thicknessControllers.get(group) || [];
  controllers.push(controller);
  thicknessControllers.set(group, controllers);
}

function registerScaleThickness(group: THREE.Group, object: THREE.Object3D, axes: readonly [number, number, number]) {
  const baseScale = object.scale.clone();
  registerThicknessController(group, (multiplier) => {
    object.scale.set(
      baseScale.x * (axes[0] ? multiplier : 1),
      baseScale.y * (axes[1] ? multiplier : 1),
      baseScale.z * (axes[2] ? multiplier : 1),
    );
  });
}

function registerTubeThickness(group: THREE.Group, mesh: THREE.Mesh, curve: THREE.Curve<THREE.Vector3>, tubularSegments: number, radialSegments: number) {
  const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const basePositions = Float32Array.from(positions.array as ArrayLike<number>);
  const centers = new Float32Array(basePositions.length);
  for (let ring = 0; ring <= tubularSegments; ring++) {
    const center = curve.getPointAt(ring / tubularSegments);
    for (let radial = 0; radial <= radialSegments; radial++) {
      const index = (ring * (radialSegments + 1) + radial) * 3;
      centers[index] = center.x;
      centers[index + 1] = center.y;
      centers[index + 2] = center.z;
    }
  }
  registerThicknessController(group, (multiplier) => {
    for (let index = 0; index < positions.count; index++) {
      const offset = index * 3;
      positions.setXYZ(
        index,
        centers[offset] + (basePositions[offset] - centers[offset]) * multiplier,
        centers[offset + 1] + (basePositions[offset + 1] - centers[offset + 1]) * multiplier,
        centers[offset + 2] + (basePositions[offset + 2] - centers[offset + 2]) * multiplier,
      );
    }
    positions.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

export function applyGeneratedAttachmentThickness(group: THREE.Group, multiplier: number) {
  const safeMultiplier = THREE.MathUtils.clamp(Number.isFinite(multiplier) ? multiplier : 1, 0.5, 1.5);
  thicknessControllers.get(group)?.forEach((controller) => controller(safeMultiplier));
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, segments = 10, thicknessGroup?: THREE.Group) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments, 1, false), clay());
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  if (thicknessGroup) registerScaleThickness(thicknessGroup, mesh, [1, 0, 1]);
  return mesh;
}

function addJoint(group: THREE.Group, point: THREE.Vector3, radius: number, thicknessGroup?: THREE.Group) {
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), clay());
  joint.position.copy(point);
  group.add(joint);
  if (thicknessGroup) registerScaleThickness(thicknessGroup, joint, [1, 1, 1]);
}

function addHandleLug(group: THREE.Group, y: number, depth = 0.24, height = 0.32, width = 0.27) {
  // Authored X becomes mounted +Z. Keeping the lug's minimum X at zero gives
  // every handle one predictable contact plane for deformation-aware seating.
  const lug = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), clay());
  lug.position.set(depth, y, 0);
  lug.scale.set(depth, height, width);
  group.add(lug);
  const basePositionX = lug.position.x;
  registerThicknessController(group, (multiplier) => {
    lug.position.x = basePositionX * multiplier;
    lug.scale.set(depth * multiplier, height * multiplier, width * multiplier);
  });
  return lug;
}

function orientHandleOutward(group: THREE.Group) {
  // Handle profiles are authored in X/Y for readability. Rotate that profile
  // into Y/Z so local +Y stays upright and the loop projects along local +Z.
  group.rotation.y = -Math.PI / 2;
  return group;
}

function buildBambooLoop() {
  const group = new THREE.Group();
  const points = [
    new THREE.Vector3(0.18, -1.38, 0), new THREE.Vector3(1.08, -1.18, 0),
    new THREE.Vector3(1.58, -0.48, 0), new THREE.Vector3(1.58, 0.48, 0),
    new THREE.Vector3(1.08, 1.18, 0), new THREE.Vector3(0.18, 1.38, 0),
  ];
  for (let index = 0; index < points.length - 1; index++) group.add(cylinderBetween(points[index], points[index + 1], 0.18, 10, group));
  points.slice(1, -1).forEach((point) => addJoint(group, point, 0.22, group));
  addHandleLug(group, -1.38, 0.18, 0.19, 0.19);
  addHandleLug(group, 1.38, 0.18, 0.19, 0.19);
  return orientHandleOutward(group);
}

function buildSquareBridge() {
  const group = new THREE.Group();
  const material = clay();
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.32, 0.42), material.clone());
  lower.position.set(0.95, -1.25, 0);
  const outer = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.8, 0.42), material.clone());
  outer.position.set(1.73, 0, 0);
  const upper = lower.clone(); upper.material = material.clone(); upper.position.y = 1.25;
  group.add(lower, outer, upper);
  registerScaleThickness(group, lower, [0, 1, 1]);
  registerScaleThickness(group, outer, [1, 0, 1]);
  registerScaleThickness(group, upper, [0, 1, 1]);
  addHandleLug(group, -1.25, 0.18, 0.19, 0.19);
  addHandleLug(group, 1.25, 0.18, 0.19, 0.19);
  return orientHandleOutward(group);
}

function buildTwistedRopeLoop() {
  const group = new THREE.Group();
  const centerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.18, -1.42, 0),
    new THREE.Vector3(0.86, -1.24, 0),
    new THREE.Vector3(1.48, -0.68, 0),
    new THREE.Vector3(1.68, 0, 0),
    new THREE.Vector3(1.48, 0.68, 0),
    new THREE.Vector3(0.86, 1.24, 0),
    new THREE.Vector3(0.18, 1.42, 0),
  ], false, 'centripetal');
  const tubularSegments = 72;
  const radialSegments = 8;
  const turns = 7;
  const strandOffset = 0.105;

  [0, Math.PI].forEach((phaseOffset) => {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= tubularSegments; index++) {
      const t = index / tubularSegments;
      const center = centerCurve.getPointAt(t);
      const tangent = centerCurve.getTangentAt(t).normalize();
      const inPlaneNormal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
      const phase = t * Math.PI * 2 * turns + phaseOffset;
      points.push(center
        .addScaledVector(inPlaneNormal, Math.cos(phase) * strandOffset)
        .add(new THREE.Vector3(0, 0, Math.sin(phase) * strandOffset)));
    }
    const strandCurve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const strand = new THREE.Mesh(
      new THREE.TubeGeometry(strandCurve, tubularSegments, 0.115, radialSegments, false),
      clay(),
    );
    group.add(strand);
    registerTubeThickness(group, strand, strandCurve, tubularSegments, radialSegments);
  });

  addHandleLug(group, -1.42, 0.19, 0.19, 0.2);
  addHandleLug(group, 1.42, 0.19, 0.19, 0.2);
  return orientHandleOutward(group);
}

function buildOrnateScrollLoop() {
  const group = new THREE.Group();
  const addTube = (curve: THREE.Curve<THREE.Vector3>, tubularSegments: number, radius = 0.15) => {
    const radialSegments = 8;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, curve instanceof THREE.CatmullRomCurve3 && curve.closed), clay());
    group.add(tube);
    registerTubeThickness(group, tube, curve, tubularSegments, radialSegments);
  };

  const ringPoints: THREE.Vector3[] = [];
  const ringCenter = new THREE.Vector3(1.03, -0.22, 0);
  for (let index = 0; index < 16; index++) {
    const angle = index / 16 * Math.PI * 2;
    ringPoints.push(new THREE.Vector3(
      ringCenter.x + Math.cos(angle) * 0.58,
      ringCenter.y + Math.sin(angle) * 0.58,
      0,
    ));
  }
  addTube(new THREE.CatmullRomCurve3(ringPoints, true, 'centripetal'), 64, 0.16);

  addTube(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.18, -1.18, 0),
    new THREE.Vector3(0.48, -1.05, 0),
    new THREE.Vector3(0.72, -0.78, 0),
  ], false, 'centripetal'), 24, 0.17);
  addTube(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.18, 0.58, 0),
    new THREE.Vector3(0.43, 0.48, 0),
    new THREE.Vector3(0.69, 0.28, 0),
  ], false, 'centripetal'), 24, 0.17);

  const flourish = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.18, 0.58, 0),
    new THREE.Vector3(0.55, 0.7, 0),
    new THREE.Vector3(1.13, 1.24, 0),
    new THREE.Vector3(1.08, 1.58, 0),
    new THREE.Vector3(0.8, 1.68, 0),
    new THREE.Vector3(0.67, 1.47, 0),
  ], false, 'centripetal');
  addTube(flourish, 48, 0.17);

  addHandleLug(group, -1.18, 0.19, 0.19, 0.2);
  addHandleLug(group, 0.58, 0.19, 0.19, 0.2);
  return orientHandleOutward(group);
}

function petalShape() {
  const shape = new THREE.Shape();
  const points: THREE.Vector2[] = [];
  for (let index = 0; index < 80; index++) {
    const angle = index / 80 * Math.PI * 2;
    const radius = 1.05 + 0.34 * Math.cos(angle * 5);
    points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  shape.setFromPoints(points);
  return shape;
}

function buildSampaguitaMedallion() {
  const group = new THREE.Group();
  const flower = new THREE.Mesh(new THREE.ExtrudeGeometry(petalShape(), { depth: 0.34, steps: 1, bevelEnabled: false }), clay());
  flower.position.z = 0.02;
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 10), clay());
  center.scale.z = 0.55; center.position.z = 0.42;
  group.add(flower, center);
  return group;
}

function buildFacetedDisc() {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.44, 12, 1, false), clay());
  disc.rotation.x = Math.PI / 2; disc.position.z = 0.22;
  const inset = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.18, 8), clay());
  inset.rotation.x = Math.PI / 2; inset.position.z = 0.52;
  group.add(disc, inset);
  return group;
}

function diamondShape(width: number, height: number) {
  const shape = new THREE.Shape();
  shape.moveTo(0, height / 2); shape.lineTo(width / 2, 0); shape.lineTo(0, -height / 2); shape.lineTo(-width / 2, 0); shape.closePath();
  return shape;
}

function buildBanigDiamondCrest() {
  const group = new THREE.Group();
  const offsets = [-0.72, 0, 0.72];
  offsets.forEach((x, index) => {
    const diamond = new THREE.Mesh(new THREE.ExtrudeGeometry(diamondShape(1.05, 1.55), { depth: 0.26 + index * 0.04, bevelEnabled: false }), clay());
    diamond.position.set(x, 0, 0.02 + index * 0.02);
    group.add(diamond);
  });
  return group;
}

function buildMinimalCollarBar() {
  const group = new THREE.Group();
  const left = new THREE.Vector3(-1.15, 0, 0.28);
  const right = new THREE.Vector3(1.15, 0, 0.28);
  group.add(cylinderBetween(left, right, 0.25, 14));
  addJoint(group, left, 0.25); addJoint(group, right, 0.25);
  const drop = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 12), clay());
  drop.position.set(0, -0.62, 0.3);
  group.add(drop);
  return group;
}

export const GENERATED_ATTACHMENT_RECIPES: GeneratedAttachmentRecipe[] = [
  { key: 'bamboo-loop', version: 1, name: 'Bamboo Loop', family: 'handle', style: 'filipino', description: 'A segmented side handle inspired by bamboo joints.', thumbnail: '/images/attachments/bamboo-loop.svg', envelope: { width: 1, height: 3.4, depth: 2.2, contactRadius: 0.3, triangleBudget: 7000 }, scaleRatio: 0.075, mountContactY: [-1.38, 1.38], build: buildBambooLoop },
  { key: 'square-bridge', version: 1, name: 'Square Bridge', family: 'handle', style: 'minimal', description: 'A clean angular bridge handle.', thumbnail: '/images/attachments/square-bridge.svg', envelope: { width: 0.8, height: 3.2, depth: 2.2, contactRadius: 0.35, triangleBudget: 1200 }, scaleRatio: 0.075, mountContactY: [-1.25, 1.25], build: buildSquareBridge },
  { key: 'twisted-rope-loop', version: 1, name: 'Twisted Rope Loop', family: 'handle', style: 'filipino', description: 'A sculpted double-strand loop inspired by hand-twisted ceramic rope handles.', thumbnail: '/images/attachments/twisted-rope-loop.svg', envelope: { width: 0.9, height: 3.5, depth: 2.2, contactRadius: 0.34, triangleBudget: 5000 }, scaleRatio: 0.075, mountContactY: [-1.42, 1.42], build: buildTwistedRopeLoop },
  { key: 'ornate-scroll-loop', version: 1, name: 'Ornate Scroll Loop', family: 'handle', style: 'filipino', description: 'A circular openwork handle crowned with a hand-sculpted curling flourish.', thumbnail: '/images/attachments/ornate-scroll-loop.svg', envelope: { width: 0.9, height: 3.2, depth: 2.1, contactRadius: 0.34, triangleBudget: 5000 }, scaleRatio: 0.075, mountContactY: [-1.18, 0.58], build: buildOrnateScrollLoop },
  { key: 'sampaguita-medallion', version: 1, name: 'Sampaguita Medallion', family: 'body', style: 'filipino', description: 'A raised five-petal floral medallion.', thumbnail: '/images/attachments/sampaguita-medallion.svg', envelope: { width: 2.9, height: 2.9, depth: 0.75, contactRadius: 0.55, triangleBudget: 5000 }, scaleRatio: 0.06, build: buildSampaguitaMedallion },
  { key: 'faceted-disc', version: 1, name: 'Faceted Disc', family: 'body', style: 'minimal', description: 'A low-poly circular body ornament.', thumbnail: '/images/attachments/faceted-disc.svg', envelope: { width: 3, height: 3, depth: 0.8, contactRadius: 0.6, triangleBudget: 1500 }, scaleRatio: 0.058, build: buildFacetedDisc },
  { key: 'banig-diamond-crest', version: 1, name: 'Banig Diamond Crest', family: 'neck', style: 'filipino', description: 'Layered diamonds inspired by woven banig patterns.', thumbnail: '/images/attachments/banig-diamond-crest.svg', envelope: { width: 2.6, height: 1.7, depth: 0.6, contactRadius: 0.45, triangleBudget: 1800 }, scaleRatio: 0.055, build: buildBanigDiamondCrest },
  { key: 'minimal-collar-bar', version: 1, name: 'Minimal Collar Bar', family: 'neck', style: 'minimal', description: 'A restrained horizontal neck accent with a central drop.', thumbnail: '/images/attachments/minimal-collar-bar.svg', envelope: { width: 2.9, height: 1.5, depth: 0.65, contactRadius: 0.4, triangleBudget: 3200 }, scaleRatio: 0.055, build: buildMinimalCollarBar },
];

export function getGeneratedAttachmentRecipe(key: string, version?: number) {
  return GENERATED_ATTACHMENT_RECIPES.find((recipe) => recipe.key === key && (version == null || recipe.version === version));
}

export function countRecipeTriangles(object: THREE.Object3D) {
  let triangles = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    triangles += child.geometry.index ? child.geometry.index.count / 3 : child.geometry.attributes.position.count / 3;
  });
  return triangles;
}

export function disposeGeneratedAttachment(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}
