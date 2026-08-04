import * as THREE from 'three';
import type { GeneratedAttachmentRecipe } from './generatedAttachmentCatalog';
import {
  DEFAULT_ATTACHMENT_TRANSFORM,
  type AttachmentFamily,
  type AttachmentPlacementTransform,
  type AttachmentSocketSnapshot,
  type GeneratedAttachmentSocket,
} from './attachments';

const HEIGHT_BANDS = 32;
const AZIMUTH_SAMPLES = 16;

export type TransformRange = { min: number; max: number; step: number };
export type AttachmentTransformLimits = {
  horizontalDegrees: TransformRange;
  verticalRatio: TransformRange;
  surfaceOffsetRatio: TransformRange;
  twistDegrees: TransformRange;
  scaleMultiplier: TransformRange;
};

export type AttachmentPlacementLimitMap = Record<string, AttachmentTransformLimits | null>;

export function attachmentPlacementKey(selectionId: string, socketId: string) {
  return `${selectionId}:${socketId}`;
}

const FAMILY_BANDS: Record<AttachmentFamily, { min: number; max: number; horizontal: number; vertical: number }> = {
  handle: { min: 0.18, max: 0.78, horizontal: 35, vertical: 0.18 },
  body: { min: 0.18, max: 0.78, horizontal: 35, vertical: 0.18 },
  neck: { min: 0.68, max: 0.95, horizontal: 25, vertical: 0.1 },
};

function clamp(value: number, range: TransformRange) {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, range.min, range.max);
}

export function getAttachmentRay(box: THREE.Box3, normalizedHeight: number, azimuthDegrees: number) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radians = THREE.MathUtils.degToRad(azimuthDegrees);
  const outward = new THREE.Vector3(Math.sin(radians), 0, Math.cos(radians)).normalize();
  const y = box.min.y + size.y * THREE.MathUtils.clamp(normalizedHeight, 0, 1);
  const radialSize = Math.max(size.x, size.z);
  return {
    size, center, outward, y, radialSize,
    maxDimension: Math.max(size.x, size.y, size.z),
    origin: new THREE.Vector3(center.x + outward.x * radialSize * 1.5, y, center.z + outward.z * radialSize * 1.5),
    direction: outward.clone().negate(),
  };
}

function resolveFromBox(scene: THREE.Object3D, box: THREE.Box3, normalizedHeight: number, azimuthDegrees: number) {
  const ray = getAttachmentRay(box, normalizedHeight, azimuthDegrees);
  const raycaster = new THREE.Raycaster(ray.origin, ray.direction, 0, ray.radialSize * 3);
  const hit = raycaster.intersectObject(scene, true).find((candidate) => candidate.object.visible);
  if (!hit) return null;
  let normal = ray.outward.clone();
  if (hit.face) {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    if (normal.dot(ray.outward) < 0) normal.negate();
  }
  const radialDistance = new THREE.Vector2(hit.point.x - ray.center.x, hit.point.z - ray.center.z).length();
  return { position: hit.point.clone(), normal, maxDimension: ray.maxDimension, radialDistance, box };
}

export function resolveAttachmentPoint(scene: THREE.Object3D, normalizedHeight: number, azimuthDegrees: number, knownBox?: THREE.Box3) {
  if (!knownBox) scene.updateMatrixWorld(true);
  const box = knownBox || new THREE.Box3().setFromObject(scene);
  return box.isEmpty() ? null : resolveFromBox(scene, box, normalizedHeight, azimuthDegrees);
}

type RingSample = { height: number; radius: number; coverage: number };

export function sampleRadialProfile(scene: THREE.Object3D, knownBox?: THREE.Box3): RingSample[] {
  scene.updateMatrixWorld(true);
  const box = knownBox || new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return [];
  const samples: RingSample[] = [];
  for (let band = 0; band < HEIGHT_BANDS; band++) {
    const height = (band + 0.5) / HEIGHT_BANDS;
    let hits = 0;
    let radius = 0;
    for (let azimuthIndex = 0; azimuthIndex < AZIMUTH_SAMPLES; azimuthIndex++) {
      const resolved = resolveFromBox(scene, box, height, azimuthIndex / AZIMUTH_SAMPLES * 360 - 180);
      if (!resolved) continue;
      hits += 1;
      radius += resolved.radialDistance;
    }
    if (hits) samples.push({ height, radius: radius / hits, coverage: hits / AZIMUTH_SAMPLES });
  }
  return samples;
}

function makeSocket(scene: THREE.Object3D, box: THREE.Box3, id: string, name: string, family: GeneratedAttachmentSocket['family'], height: number, azimuth: number, pairGroup: string | null, widthLimit: number, heightLimit: number) {
  const resolved = resolveFromBox(scene, box, height, azimuth);
  if (!resolved || Math.abs(resolved.normal.y) > 0.72 || resolved.radialDistance <= 0) return null;
  const radiusRatio = resolved.radialDistance / resolved.maxDimension;
  return {
    id, name, family, height, azimuth, pairGroup,
    maxWidthRatio: Math.min(widthLimit, Math.max(0.08, radiusRatio * 0.75)),
    maxHeightRatio: heightLimit,
  } satisfies GeneratedAttachmentSocket;
}

export function analyzeAttachmentSockets(scene: THREE.Object3D): GeneratedAttachmentSocket[] {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return [];
  const profile = sampleRadialProfile(scene, box).filter((sample) => sample.coverage >= 0.75);
  if (!profile.length) return [];
  const bodyCandidates = profile.filter((sample) => sample.height >= 0.25 && sample.height <= 0.7);
  if (!bodyCandidates.length) return [];
  const body = bodyCandidates.reduce((widest, sample) => sample.radius > widest.radius ? sample : widest);
  const neckCandidates = profile.filter((sample) => sample.height >= 0.7 && sample.height <= 0.92 && sample.radius <= body.radius * 0.9);
  const neck = neckCandidates.length ? neckCandidates.reduce((narrowest, sample) => sample.radius < narrowest.radius ? sample : narrowest) : null;
  const sockets: Array<GeneratedAttachmentSocket | null> = [
    makeSocket(scene, box, 'auto-handle-left', 'Left', 'handle', body.height, -90, 'auto-handle-pair', 0.27, 0.27),
    makeSocket(scene, box, 'auto-handle-right', 'Right', 'handle', body.height, 90, 'auto-handle-pair', 0.27, 0.27),
    makeSocket(scene, box, 'auto-body-front', 'Front', 'body', body.height, 0, null, 0.24, 0.24),
    makeSocket(scene, box, 'auto-body-back', 'Back', 'body', body.height, 180, null, 0.24, 0.24),
  ];
  if (neck) {
    sockets.push(
      makeSocket(scene, box, 'auto-neck-front', 'Front', 'neck', neck.height, 0, null, 0.18, 0.17),
      makeSocket(scene, box, 'auto-neck-back', 'Back', 'neck', neck.height, 180, null, 0.18, 0.17),
    );
  }
  const resolvedSockets = sockets.filter((socket): socket is GeneratedAttachmentSocket => Boolean(socket));
  const handleSockets = resolvedSockets.filter((socket) => socket.family === 'handle');
  if (handleSockets.length !== 2) handleSockets.forEach((socket) => { socket.pairGroup = null; });
  return resolvedSockets;
}

export function getSocketTransformLimits(recipe: GeneratedAttachmentRecipe, socket: GeneratedAttachmentSocket): AttachmentTransformLimits | null {
  const band = FAMILY_BANDS[socket.family];
  const minimumScale = 0.5;
  const widthCapacity = socket.maxWidthRatio / Math.max(recipe.envelope.width * recipe.scaleRatio, 0.0001);
  const heightCapacity = socket.maxHeightRatio / Math.max(recipe.envelope.height * recipe.scaleRatio, 0.0001);
  const maximumScale = Math.min(1.5, widthCapacity, heightCapacity);
  if (maximumScale < minimumScale) return null;
  const clearanceFactor = THREE.MathUtils.clamp(Math.min(widthCapacity, heightCapacity) / 1.5, 0.35, 1);
  const verticalMin = Math.max(-band.vertical * clearanceFactor, band.min - socket.height);
  const verticalMax = Math.min(band.vertical * clearanceFactor, band.max - socket.height);
  const horizontal = band.horizontal * clearanceFactor;
  return {
    horizontalDegrees: { min: -horizontal, max: horizontal, step: 1 },
    verticalRatio: { min: verticalMin, max: verticalMax, step: 0.005 },
    surfaceOffsetRatio: { min: 0.002, max: 0.08, step: 0.002 },
    twistDegrees: { min: -180, max: 180, step: 1 },
    scaleMultiplier: { min: minimumScale, max: maximumScale, step: 0.05 },
  };
}

export function clampAttachmentTransform(transform: AttachmentPlacementTransform, limits: AttachmentTransformLimits): AttachmentPlacementTransform {
  return {
    horizontalDegrees: clamp(transform.horizontalDegrees, limits.horizontalDegrees),
    verticalRatio: clamp(transform.verticalRatio, limits.verticalRatio),
    surfaceOffsetRatio: clamp(transform.surfaceOffsetRatio, limits.surfaceOffsetRatio),
    twistDegrees: clamp(transform.twistDegrees, limits.twistDegrees),
    scaleMultiplier: clamp(transform.scaleMultiplier, limits.scaleMultiplier),
  };
}

export function resolveAttachmentPlacement(scene: THREE.Object3D, socket: AttachmentSocketSnapshot, transform: AttachmentPlacementTransform, knownBox?: THREE.Box3) {
  const band = FAMILY_BANDS[socket.family];
  const height = THREE.MathUtils.clamp(socket.height + transform.verticalRatio, band.min, band.max);
  const azimuth = THREE.MathUtils.euclideanModulo(socket.azimuth + transform.horizontalDegrees + 180, 360) - 180;
  const resolved = resolveAttachmentPoint(scene, height, azimuth, knownBox);
  if (!resolved || Math.abs(resolved.normal.y) > 0.72) return null;
  return { ...resolved, height, azimuth };
}

export function isAttachmentPlacementSafe(scene: THREE.Object3D, socket: GeneratedAttachmentSocket, recipe: GeneratedAttachmentRecipe, transform: AttachmentPlacementTransform, knownBox?: THREE.Box3) {
  const limits = getSocketTransformLimits(recipe, socket);
  if (!limits) return false;
  const clamped = clampAttachmentTransform(transform, limits);
  const resolved = resolveAttachmentPlacement(scene, socket, clamped, knownBox);
  if (!resolved) return false;

  const boxSize = resolved.box.getSize(new THREE.Vector3());
  const twist = THREE.MathUtils.degToRad(clamped.twistDegrees);
  const rawWidth = recipe.envelope.width * recipe.scaleRatio * clamped.scaleMultiplier * resolved.maxDimension;
  const rawHeight = recipe.envelope.height * recipe.scaleRatio * clamped.scaleMultiplier * resolved.maxDimension;
  const scaledWidth = Math.abs(rawWidth * Math.cos(twist)) + Math.abs(rawHeight * Math.sin(twist));
  const scaledHeight = Math.abs(rawHeight * Math.cos(twist)) + Math.abs(rawWidth * Math.sin(twist));
  const angularHalfWidth = THREE.MathUtils.radToDeg((scaledWidth * 0.5) / Math.max(resolved.radialDistance, 0.0001));
  const heightHalfRatio = scaledHeight * 0.5 / Math.max(boxSize.y, 0.0001);
  const edgeCoordinates = [
    [resolved.height, resolved.azimuth - angularHalfWidth],
    [resolved.height, resolved.azimuth + angularHalfWidth],
    [resolved.height - heightHalfRatio, resolved.azimuth],
    [resolved.height + heightHalfRatio, resolved.azimuth],
  ] as const;
  return edgeCoordinates.every(([height, azimuth]) => {
    const edge = resolveAttachmentPoint(scene, height, azimuth, resolved.box);
    return edge && Math.abs(edge.normal.y) <= 0.78 && edge.normal.dot(resolved.normal) >= 0.45;
  });
}

export function attachmentPlacementsCollide(
  scene: THREE.Object3D,
  first: { socket: AttachmentSocketSnapshot; recipe: GeneratedAttachmentRecipe; transform: AttachmentPlacementTransform },
  second: { socket: AttachmentSocketSnapshot; recipe: GeneratedAttachmentRecipe; transform: AttachmentPlacementTransform },
  knownBox?: THREE.Box3,
) {
  const firstResolved = resolveAttachmentPlacement(scene, first.socket, first.transform, knownBox);
  const secondResolved = resolveAttachmentPlacement(scene, second.socket, second.transform, firstResolved?.box || knownBox);
  if (!firstResolved || !secondResolved) return true;
  const firstMount = getAttachmentMountTransform(firstResolved.normal, firstResolved.maxDimension, first.recipe, first.transform);
  const secondMount = getAttachmentMountTransform(secondResolved.normal, secondResolved.maxDimension, second.recipe, second.transform);
  const firstCenter = firstResolved.position.clone().add(firstMount.offset);
  const secondCenter = secondResolved.position.clone().add(secondMount.offset);
  const firstRadius = Math.hypot(first.recipe.envelope.width, first.recipe.envelope.height, first.recipe.envelope.depth) * firstMount.scale * 0.42;
  const secondRadius = Math.hypot(second.recipe.envelope.width, second.recipe.envelope.height, second.recipe.envelope.depth) * secondMount.scale * 0.42;
  return firstCenter.distanceTo(secondCenter) < firstRadius + secondRadius;
}

export function probeContinuousSafeRange(currentValue: number, hardRange: TransformRange, isSafe: (candidate: number) => boolean): TransformRange {
  const current = THREE.MathUtils.clamp(currentValue, hardRange.min, hardRange.max);
  if (!isSafe(current)) return { ...hardRange, min: current, max: current };

  function probe(limit: number) {
    if (limit === current) return current;
    const steps = 5;
    let lastSafe = current;
    let firstUnsafe: number | null = null;
    for (let index = 1; index <= steps; index++) {
      const candidate = THREE.MathUtils.lerp(current, limit, index / steps);
      if (!isSafe(candidate)) { firstUnsafe = candidate; break; }
      lastSafe = candidate;
    }
    if (firstUnsafe === null) return limit;
    let safe = lastSafe;
    let unsafe = firstUnsafe;
    for (let index = 0; index < 5; index++) {
      const midpoint = (safe + unsafe) / 2;
      if (isSafe(midpoint)) safe = midpoint;
      else unsafe = midpoint;
    }
    return safe;
  }

  return { ...hardRange, min: probe(hardRange.min), max: probe(hardRange.max) };
}

export function getLiveAttachmentTransformLimits(
  scene: THREE.Object3D,
  recipe: GeneratedAttachmentRecipe,
  socket: GeneratedAttachmentSocket,
  transform: AttachmentPlacementTransform,
  extraSafetyCheck: (candidate: AttachmentPlacementTransform, box: THREE.Box3) => boolean = () => true,
  knownBox?: THREE.Box3,
) {
  const hardLimits = getSocketTransformLimits(recipe, socket);
  if (!hardLimits) return null;
  if (!knownBox) scene.updateMatrixWorld(true);
  const box = knownBox || new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return null;
  let current = clampAttachmentTransform(transform, hardLimits);
  const isSafe = (candidate: AttachmentPlacementTransform) => isAttachmentPlacementSafe(scene, socket, recipe, candidate, box) && extraSafetyCheck(candidate, box);
  if (!isSafe(current)) {
    const fallbackCandidates = [
      clampAttachmentTransform({ ...DEFAULT_ATTACHMENT_TRANSFORM, scaleMultiplier: current.scaleMultiplier }, hardLimits),
      clampAttachmentTransform({ ...DEFAULT_ATTACHMENT_TRANSFORM, scaleMultiplier: hardLimits.scaleMultiplier.min }, hardLimits),
    ];
    const fallback = fallbackCandidates.find(isSafe);
    if (!fallback) return null;
    current = fallback;
    return Object.fromEntries((Object.keys(hardLimits) as Array<keyof AttachmentPlacementTransform>).map((key) => [
      key,
      { ...hardLimits[key], min: current[key], max: current[key] },
    ])) as AttachmentTransformLimits;
  }
  // The socket analyzer already derives conservative, deformation-aware ranges.
  // Validate only the value the shopper actually chose here; eagerly probing every
  // unused slider position makes a paired attachment perform hundreds of raycasts.
  return hardLimits;
}

export function getAttachmentMountTransform(normal: THREE.Vector3, maxDimension: number, recipe: GeneratedAttachmentRecipe, transform: AttachmentPlacementTransform = DEFAULT_ATTACHMENT_TRANSFORM) {
  const outward = normal.clone().normalize();
  const localUp = new THREE.Vector3(0, 1, 0);
  const tangentUp = localUp.clone().addScaledVector(outward, -localUp.dot(outward));
  if (tangentUp.lengthSq() < 0.000001) tangentUp.set(0, 0, 1);
  tangentUp.normalize();
  const tangentRight = new THREE.Vector3().crossVectors(tangentUp, outward).normalize();
  tangentUp.crossVectors(outward, tangentRight).normalize();
  const surfaceQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangentRight, tangentUp, outward));
  const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(transform.twistDegrees));
  return {
    offset: outward.clone().multiplyScalar(maxDimension * transform.surfaceOffsetRatio),
    quaternion: surfaceQuaternion.multiply(twist),
    scale: maxDimension * recipe.scaleRatio * transform.scaleMultiplier,
  };
}
