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
  build: () => THREE.Group;
};

const clay = () => new THREE.MeshStandardMaterial({ color: '#C4A882', roughness: 0.85, metalness: 0 });

function thumbnailSvg(label: string, motif: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120"><rect width="160" height="120" rx="18" fill="#F4EDE3"/><g fill="none" stroke="#91470D" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${motif}</g><text x="80" y="108" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#5D3216">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, segments = 10) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments, 1, false), clay());
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function addJoint(group: THREE.Group, point: THREE.Vector3, radius: number) {
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), clay());
  joint.position.copy(point);
  group.add(joint);
}

function orientHandleOutward(group: THREE.Group, contactTangentOffset: number, contactDepth: number) {
  // Handle profiles are authored in X/Y for readability. Rotate that profile
  // into Y/Z so local +Y stays upright and the loop projects along local +Z.
  group.rotation.y = -Math.PI / 2;
  group.position.set(contactTangentOffset, 0, contactDepth);
  return group;
}

function buildBambooLoop() {
  const group = new THREE.Group();
  const points = [
    new THREE.Vector3(0, -1.45, 0.2), new THREE.Vector3(1.15, -1.2, 0.5),
    new THREE.Vector3(1.65, -0.45, 0.7), new THREE.Vector3(1.65, 0.45, 0.7),
    new THREE.Vector3(1.15, 1.2, 0.5), new THREE.Vector3(0, 1.45, 0.2),
  ];
  for (let index = 0; index < points.length - 1; index++) group.add(cylinderBetween(points[index], points[index + 1], 0.18, 10));
  points.forEach((point) => addJoint(group, point, 0.22));
  group.add(cylinderBetween(new THREE.Vector3(0, -1.55, 0.16), new THREE.Vector3(0, 1.55, 0.16), 0.16, 10));
  return orientHandleOutward(group, 0.2, 0.22);
}

function buildSquareBridge() {
  const group = new THREE.Group();
  const material = clay();
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3, 0.3), material.clone());
  back.position.set(0, 0, 0.15);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.32, 0.42), material.clone());
  lower.position.set(0.9, -1.25, 0.42);
  const outer = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.8, 0.42), material.clone());
  outer.position.set(1.75, 0, 0.42);
  const upper = lower.clone(); upper.material = material.clone(); upper.position.y = 1.25;
  group.add(back, lower, outer, upper);
  return orientHandleOutward(group, 0.15, 0.17);
}

function buildRoundLoopHandle() {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1.3, 0.18),
    new THREE.Vector3(0.78, -1.24, 0.4),
    new THREE.Vector3(1.48, -0.72, 0.61),
    new THREE.Vector3(1.7, 0, 0.66),
    new THREE.Vector3(1.48, 0.72, 0.61),
    new THREE.Vector3(0.78, 1.24, 0.4),
    new THREE.Vector3(0, 1.3, 0.18),
  ], false, 'centripetal');
  const loop = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.17, 10, false), clay());
  group.add(loop);

  for (const y of [-1.3, 1.3]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 10), clay());
    pad.position.set(0, y, 0.18);
    pad.scale.set(1, 1.1, 0.78);
    group.add(pad);
  }
  return orientHandleOutward(group, 0.18, 0.23);
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
  { key: 'bamboo-loop', version: 1, name: 'Bamboo Loop', family: 'handle', style: 'filipino', description: 'A segmented side handle inspired by bamboo joints.', thumbnail: thumbnailSvg('Bamboo Loop', '<path d="M48 82V38c45 0 62 12 62 22S93 82 48 82"/><path d="M72 43v34M94 49v22"/>'), envelope: { width: 1, height: 3.4, depth: 2.2, contactRadius: 0.3, triangleBudget: 7000 }, scaleRatio: 0.075, build: buildBambooLoop },
  { key: 'square-bridge', version: 1, name: 'Square Bridge', family: 'handle', style: 'minimal', description: 'A clean angular bridge handle.', thumbnail: thumbnailSvg('Square Bridge', '<path d="M48 84V36h58v48H48"/><path d="M48 48h42v24H48"/>'), envelope: { width: 0.8, height: 3.2, depth: 2.2, contactRadius: 0.35, triangleBudget: 1200 }, scaleRatio: 0.075, build: buildSquareBridge },
  { key: 'round-loop-handle', version: 1, name: 'Round Loop Handle', family: 'handle', style: 'minimal', description: 'A smooth minimal D-loop with two rounded mounting contacts.', thumbnail: thumbnailSvg('Round Loop', '<path d="M50 82V38c39 0 61 9 61 22S89 82 50 82"/><circle cx="50" cy="38" r="7"/><circle cx="50" cy="82" r="7"/>'), envelope: { width: 0.9, height: 3.2, depth: 2.2, contactRadius: 0.32, triangleBudget: 3000 }, scaleRatio: 0.075, build: buildRoundLoopHandle },
  { key: 'sampaguita-medallion', version: 1, name: 'Sampaguita Medallion', family: 'body', style: 'filipino', description: 'A raised five-petal floral medallion.', thumbnail: thumbnailSvg('Sampaguita', '<path d="M80 30c8 12 13 19 25 10-1 14 1 22 16 22-13 8-18 14-8 26-14-3-22-2-26 12-5-13-11-18-24-10 3-14 1-22-14-24 13-7 18-13 9-25 14 2 21 0 22-11z"/>'), envelope: { width: 2.9, height: 2.9, depth: 0.75, contactRadius: 0.55, triangleBudget: 5000 }, scaleRatio: 0.06, build: buildSampaguitaMedallion },
  { key: 'faceted-disc', version: 1, name: 'Faceted Disc', family: 'body', style: 'minimal', description: 'A low-poly circular body ornament.', thumbnail: thumbnailSvg('Faceted Disc', '<path d="M80 28l28 12 12 28-12 20-28 8-28-8-12-20 12-28z"/><path d="M80 45l18 9 5 20-23 10-23-10 5-20z"/>'), envelope: { width: 3, height: 3, depth: 0.8, contactRadius: 0.6, triangleBudget: 1500 }, scaleRatio: 0.058, build: buildFacetedDisc },
  { key: 'banig-diamond-crest', version: 1, name: 'Banig Diamond Crest', family: 'neck', style: 'filipino', description: 'Layered diamonds inspired by woven banig patterns.', thumbnail: thumbnailSvg('Banig Crest', '<path d="M48 62l16-24 16 24-16 24zM72 62l16-24 16 24-16 24zM96 62l16-24 16 24-16 24z"/>'), envelope: { width: 2.6, height: 1.7, depth: 0.6, contactRadius: 0.45, triangleBudget: 1800 }, scaleRatio: 0.055, build: buildBanigDiamondCrest },
  { key: 'minimal-collar-bar', version: 1, name: 'Minimal Collar Bar', family: 'neck', style: 'minimal', description: 'A restrained horizontal neck accent with a central drop.', thumbnail: thumbnailSvg('Collar Bar', '<path d="M48 55h64M80 55v28"/><circle cx="48" cy="55" r="7"/><circle cx="112" cy="55" r="7"/>'), envelope: { width: 2.9, height: 1.5, depth: 0.65, contactRadius: 0.4, triangleBudget: 3200 }, scaleRatio: 0.055, build: buildMinimalCollarBar },
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
