import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
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

type SurfaceEntry = { mesh: THREE.Mesh; tree: MeshBVH; inverse: THREE.Matrix4 };
const attachmentSurfaces = new WeakMap<THREE.Object3D, { entries: SurfaceEntry[]; box: THREE.Box3; revision: number }>();
const geometryTrees = new WeakMap<THREE.BufferGeometry, MeshBVH>();

/** Rebuild/refit only after geometry changes; placement queries reuse this index. */
export function prepareAttachmentSurface(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const entries: SurfaceEntry[] = [];
  scene.traverse(child => {
    if (!(child instanceof THREE.Mesh) || !child.geometry.attributes.position) return;
    let tree = geometryTrees.get(child.geometry);
    if (!tree) {
      // BVH indexing must not reorder the renderer's face masks or shape snapshots.
      const indexed = new THREE.BufferGeometry();
      indexed.setAttribute('position', child.geometry.getAttribute('position'));
      if (child.geometry.index) indexed.setIndex(child.geometry.index.clone());
      indexed.groups = child.geometry.groups.map((group: { start: number; count: number; materialIndex?: number }) => ({ ...group }));
      tree = new MeshBVH(indexed, { maxLeafTris: 8 });
      geometryTrees.set(child.geometry, tree);
    } else tree.refit();
    entries.push({ mesh: child, tree, inverse: child.matrixWorld.clone().invert() });
  });
  const revision = (attachmentSurfaces.get(scene)?.revision || 0) + 1;
  attachmentSurfaces.set(scene, { entries, box: new THREE.Box3().setFromObject(scene), revision });
}

export function getAttachmentSurfaceRevision(scene: THREE.Object3D) {
  return attachmentSurfaces.get(scene)?.revision || 0;
}

function indexedSurfaceHit(scene: THREE.Object3D, origin: THREE.Vector3, direction: THREE.Vector3, far: number) {
  const surface = attachmentSurfaces.get(scene);
  if (!surface) return new THREE.Raycaster(origin, direction, 0, far).intersectObject(scene, true).find(hit => hit.object.visible);
  const localRay = new THREE.Ray();
  let closest: THREE.Intersection | undefined;
  for (const { mesh, tree, inverse } of surface.entries) {
    if (!mesh.visible) continue;
    localRay.set(origin, direction).applyMatrix4(inverse);
    const hit = tree.raycastFirst(localRay, mesh.material);
    if (!hit) continue;
    hit.point.applyMatrix4(mesh.matrixWorld);
    hit.distance = hit.point.distanceTo(origin);
    hit.object = mesh;
    if (hit.distance <= far && (!closest || hit.distance < closest.distance)) closest = hit;
  }
  return closest;
}

export type TransformRange = { min: number; max: number; step: number };
export type AttachmentTransformLimits = {
  horizontalDegrees: TransformRange;
  verticalRatio: TransformRange;
  surfaceOffsetRatio: TransformRange;
  twistDegrees: TransformRange;
  scaleMultiplier: TransformRange;
  thicknessMultiplier: TransformRange;
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
  const hit = indexedSurfaceHit(scene, ray.origin, ray.direction, ray.radialSize * 3);
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
  const prepared = attachmentSurfaces.get(scene);
  if (!knownBox && !prepared) scene.updateMatrixWorld(true);
  const box = knownBox || prepared?.box || new THREE.Box3().setFromObject(scene);
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
    surfaceOffsetRatio: { min: 0.002, max: recipe.family === 'handle' ? 0.04 : 0.08, step: 0.002 },
    twistDegrees: { min: -180, max: 180, step: 1 },
    scaleMultiplier: { min: minimumScale, max: maximumScale, step: 0.05 },
    thicknessMultiplier: recipe.family === 'handle'
      ? { min: 0.5, max: 1.5, step: 0.05 }
      : { min: 1, max: 1, step: 0.05 },
  };
}

export function clampAttachmentTransform(transform: AttachmentPlacementTransform, limits: AttachmentTransformLimits): AttachmentPlacementTransform {
  return {
    horizontalDegrees: clamp(transform.horizontalDegrees, limits.horizontalDegrees),
    verticalRatio: clamp(transform.verticalRatio, limits.verticalRatio),
    surfaceOffsetRatio: clamp(transform.surfaceOffsetRatio, limits.surfaceOffsetRatio),
    twistDegrees: clamp(transform.twistDegrees, limits.twistDegrees),
    scaleMultiplier: clamp(transform.scaleMultiplier, limits.scaleMultiplier),
    thicknessMultiplier: clamp(transform.thicknessMultiplier, limits.thicknessMultiplier),
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

export function resolveAttachmentMount(
  scene: THREE.Object3D,
  socket: AttachmentSocketSnapshot,
  recipe: GeneratedAttachmentRecipe,
  transform: AttachmentPlacementTransform = DEFAULT_ATTACHMENT_TRANSFORM,
  knownBox?: THREE.Box3,
) {
  const resolved = resolveAttachmentPlacement(scene, socket, transform, knownBox);
  if (!resolved) return null;
  const baseMount = getAttachmentMountTransform(resolved.normal, resolved.maxDimension, recipe, transform);
  const fallback = {
    ...resolved,
    position: resolved.position.clone().add(baseMount.offset),
    quaternion: baseMount.quaternion,
    scale: baseMount.scale,
    verticalScale: baseMount.scale,
    seatCorrection: 0,
  };
  if (recipe.family !== 'handle' || !recipe.mountContactY) return fallback;

  const boxHeight = resolved.box.getSize(new THREE.Vector3()).y;
  const [lowerContactY, upperContactY] = recipe.mountContactY;
  const contactSpan = upperContactY - lowerContactY;
  if (boxHeight <= 0 || contactSpan <= 0) return fallback;

  // A handle has two physical lugs, while a curved pot has a different radius
  // at each lug height. Fit the handle to both live surface points so neither
  // end floats when the source model or the shape controls change.
  const lower = resolveAttachmentPoint(
    scene,
    resolved.height + lowerContactY * baseMount.scale / boxHeight,
    resolved.azimuth,
    resolved.box,
  );
  const upper = resolveAttachmentPoint(
    scene,
    resolved.height + upperContactY * baseMount.scale / boxHeight,
    resolved.azimuth,
    resolved.box,
  );
  if (!lower || !upper) return fallback;

  const contactDirection = upper.position.clone().sub(lower.position);
  const contactDistance = contactDirection.length();
  if (contactDistance < 0.000001) return fallback;
  const tangentUp = contactDirection.multiplyScalar(1 / contactDistance);
  const outward = lower.normal.clone().add(upper.normal).add(resolved.normal).normalize();
  outward.addScaledVector(tangentUp, -outward.dot(tangentUp));
  if (outward.lengthSq() < 0.000001) return fallback;
  outward.normalize();
  const tangentRight = new THREE.Vector3().crossVectors(tangentUp, outward).normalize();
  tangentUp.crossVectors(outward, tangentRight).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangentRight, tangentUp, outward));
  const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(transform.twistDegrees));
  quaternion.multiply(twist);

  const offsetDistance = baseMount.offset.dot(resolved.normal);
  const position = lower.position.clone().add(upper.position).multiplyScalar(0.5).addScaledVector(outward, offsetDistance);
  // A saved transform can predate the live limits. Seat its rotated contact
  // points against the shaped pot instead of letting either lug hover.
  const contactHalfSpan = recipe.envelope.contactRadius * baseMount.scale * 0.12;
  const boxCenter = resolved.box.getCenter(new THREE.Vector3());
  const verticalScale = THREE.MathUtils.clamp(contactDistance / contactSpan, baseMount.scale * 0.85, baseMount.scale * 1.25);
  let seatCorrection = 0;
  for (let iteration = 0; iteration < 3; iteration++) {
    let requiredCorrection = 0;
    for (const contactY of recipe.mountContactY) {
      const contact = new THREE.Vector3(0, contactY * verticalScale, 0).applyQuaternion(quaternion).add(position);
      const contactHeight = (contact.y - resolved.box.min.y) / boxHeight;
      const contactAzimuth = THREE.MathUtils.radToDeg(Math.atan2(contact.x - boxCenter.x, contact.z - boxCenter.z));
      const surface = resolveAttachmentPoint(scene, contactHeight, contactAzimuth, resolved.box);
      if (!surface) continue;
      const gap = contact.clone().sub(surface.position).dot(surface.normal) - contactHalfSpan;
      requiredCorrection = Math.max(requiredCorrection, gap / Math.max(0.4, surface.normal.dot(outward)));
    }
    if (requiredCorrection <= 0.00001) break;
    position.addScaledVector(outward, -requiredCorrection);
    seatCorrection += requiredCorrection;
  }
  return {
    ...resolved,
    position,
    quaternion,
    scale: baseMount.scale,
    verticalScale,
    seatCorrection,
  };
}

export function isAttachmentPlacementSafe(scene: THREE.Object3D, socket: GeneratedAttachmentSocket, recipe: GeneratedAttachmentRecipe, transform: AttachmentPlacementTransform, knownBox?: THREE.Box3) {
  const limits = getSocketTransformLimits(recipe, socket);
  if (!limits) return false;
  const clamped = clampAttachmentTransform(transform, limits);
  const resolved = resolveAttachmentPlacement(scene, socket, clamped, knownBox);
  if (!resolved) return false;

  const boxSize = resolved.box.getSize(new THREE.Vector3());
  const twist = THREE.MathUtils.degToRad(clamped.twistDegrees);
  const thicknessSafetyFactor = Math.max(1, clamped.thicknessMultiplier);
  const rawWidth = recipe.envelope.width * recipe.scaleRatio * clamped.scaleMultiplier * thicknessSafetyFactor * resolved.maxDimension;
  const rawHeight = recipe.envelope.height * recipe.scaleRatio * clamped.scaleMultiplier * thicknessSafetyFactor * resolved.maxDimension;
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
  const edgesSafe = edgeCoordinates.every(([height, azimuth]) => {
    const edge = resolveAttachmentPoint(scene, height, azimuth, resolved.box);
    return edge && Math.abs(edge.normal.y) <= 0.78 && edge.normal.dot(resolved.normal) >= 0.45;
  });
  if (!edgesSafe || recipe.family !== 'handle' || !recipe.mountContactY) return edgesSafe;
  const mount = resolveAttachmentMount(scene, socket, recipe, clamped, resolved.box);
  if (!mount) return false;
  if (mount.seatCorrection > recipe.envelope.contactRadius * mount.scale * 0.08) return false;
  const boxCenter = resolved.box.getCenter(new THREE.Vector3());
  return recipe.mountContactY.every((contactY) => {
    const contact = new THREE.Vector3(0, contactY * mount.verticalScale, 0).applyQuaternion(mount.quaternion).add(mount.position);
    const height = (contact.y - resolved.box.min.y) / boxSize.y;
    const azimuth = THREE.MathUtils.radToDeg(Math.atan2(contact.x - boxCenter.x, contact.z - boxCenter.z));
    const surface = resolveAttachmentPoint(scene, height, azimuth, resolved.box);
    if (!surface) return false;
    const gap = contact.clone().sub(surface.position).dot(surface.normal);
    return gap <= recipe.envelope.contactRadius * mount.scale * 0.18
      && gap >= -recipe.envelope.contactRadius * mount.scale * 1.5;
  });
}

export function attachmentPlacementsCollide(
  scene: THREE.Object3D,
  first: { socket: AttachmentSocketSnapshot; recipe: GeneratedAttachmentRecipe; transform: AttachmentPlacementTransform },
  second: { socket: AttachmentSocketSnapshot; recipe: GeneratedAttachmentRecipe; transform: AttachmentPlacementTransform },
  knownBox?: THREE.Box3,
) {
  const firstMount = resolveAttachmentMount(scene, first.socket, first.recipe, first.transform, knownBox);
  const secondMount = resolveAttachmentMount(scene, second.socket, second.recipe, second.transform, firstMount?.box || knownBox);
  if (!firstMount || !secondMount) return true;
  const firstCenter = firstMount.position;
  const secondCenter = secondMount.position;
  const firstThickness = Math.max(1, first.transform.thicknessMultiplier);
  const secondThickness = Math.max(1, second.transform.thicknessMultiplier);
  const firstRadius = Math.hypot(first.recipe.envelope.width * firstMount.scale * firstThickness, first.recipe.envelope.height * firstMount.verticalScale * firstThickness, first.recipe.envelope.depth * firstMount.scale * firstThickness) * 0.42;
  const secondRadius = Math.hypot(second.recipe.envelope.width * secondMount.scale * secondThickness, second.recipe.envelope.height * secondMount.verticalScale * secondThickness, second.recipe.envelope.depth * secondMount.scale * secondThickness) * 0.42;
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
      clampAttachmentTransform({ ...DEFAULT_ATTACHMENT_TRANSFORM, scaleMultiplier: current.scaleMultiplier, thicknessMultiplier: current.thicknessMultiplier }, hardLimits),
      clampAttachmentTransform({ ...DEFAULT_ATTACHMENT_TRANSFORM, scaleMultiplier: hardLimits.scaleMultiplier.min }, hardLimits),
    ];
    const fallback = fallbackCandidates.find(isSafe);
    if (!fallback) return null;
    current = fallback;
  }
  // The socket analyzer already derives conservative, deformation-aware ranges.
  // Validate only the value the shopper actually chose here; eagerly probing every
  // unused slider position makes a paired attachment perform hundreds of raycasts.
  if (recipe.family !== 'handle') return hardLimits;
  return {
    ...hardLimits,
    surfaceOffsetRatio: probeContinuousSafeRange(current.surfaceOffsetRatio, hardLimits.surfaceOffsetRatio,
      (value) => isSafe({ ...current, surfaceOffsetRatio: value })),
    twistDegrees: probeContinuousSafeRange(current.twistDegrees, hardLimits.twistDegrees,
      (value) => isSafe({ ...current, twistDegrees: value })),
  };
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
  // Handle recipes expose a local Z=0 contact plane with broad clay lugs. Seat
  // that plane slightly below the live surface so the lugs read as joined clay
  // instead of hovering, while retaining the shopper's outward-offset control.
  const seatingInsetRatio = recipe.family === 'handle'
    ? Math.min(recipe.envelope.contactRadius * recipe.scaleRatio * transform.scaleMultiplier * 0.4, 0.014)
    : 0;
  return {
    offset: outward.clone().multiplyScalar(maxDimension * (transform.surfaceOffsetRatio - seatingInsetRatio)),
    quaternion: surfaceQuaternion.multiply(twist),
    scale: maxDimension * recipe.scaleRatio * transform.scaleMultiplier,
  };
}
