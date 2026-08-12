import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  analyzeAttachmentSockets,
  attachmentPlacementsCollide,
  clampAttachmentTransform,
  getAttachmentMountTransform,
  getAttachmentRay,
  getSocketTransformLimits,
  getLiveAttachmentTransformLimits,
  isAttachmentPlacementSafe,
  probeContinuousSafeRange,
  resolveAttachmentMount,
  resolveAttachmentPlacement,
  resolveAttachmentPoint,
} from '../attachmentPlacement';
import { DEFAULT_ATTACHMENT_TRANSFORM } from '../attachments';
import { GENERATED_ATTACHMENT_RECIPES } from '../generatedAttachmentCatalog';

function cylinder() {
  return new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 32, 20, false), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

function narrowNeckVase() {
  const profile = [
    new THREE.Vector2(1.7, -3), new THREE.Vector2(2.2, -1.5), new THREE.Vector2(2.4, 0),
    new THREE.Vector2(2, 1.1), new THREE.Vector2(1.05, 1.8), new THREE.Vector2(0.9, 2.7), new THREE.Vector2(1.1, 3),
  ];
  return new THREE.Mesh(new THREE.LatheGeometry(profile, 48), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

function roundedVase() {
  const profile = [
    new THREE.Vector2(1.25, -3), new THREE.Vector2(2.05, -2.1), new THREE.Vector2(2.65, -0.5),
    new THREE.Vector2(2.7, 0), new THREE.Vector2(2.45, 1.1), new THREE.Vector2(1.55, 2.5), new THREE.Vector2(1.3, 3),
  ];
  return new THREE.Mesh(new THREE.LatheGeometry(profile, 64), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

describe('automatic attachment socket placement', () => {
  it('builds rays from normalized height and azimuth', () => {
    const ray = getAttachmentRay(new THREE.Box3(new THREE.Vector3(-1, -5, -1), new THREE.Vector3(1, 5, 1)), 0.8, 90);
    expect(ray.y).toBeCloseTo(3);
    expect(ray.outward.x).toBeCloseTo(1);
    expect(ray.direction.x).toBeCloseTo(-1);
  });

  it('raycasts normalized coordinates onto the current surface', () => {
    const resolved = resolveAttachmentPoint(cylinder(), 0.5, 0);
    expect(resolved).not.toBeNull();
    expect(resolved!.position.z).toBeCloseTo(2, 1);
    expect(resolved!.normal.z).toBeGreaterThan(0.9);
  });

  it('creates paired handles and body sockets but hides neck sockets on a cylinder', () => {
    const sockets = analyzeAttachmentSockets(cylinder());
    expect(sockets.filter((socket) => socket.family === 'handle')).toHaveLength(2);
    expect(new Set(sockets.filter((socket) => socket.family === 'handle').map((socket) => socket.pairGroup)).size).toBe(1);
    expect(sockets.filter((socket) => socket.family === 'body')).toHaveLength(2);
    expect(sockets.filter((socket) => socket.family === 'neck')).toHaveLength(0);
  });

  it('detects front and back neck sockets on a narrow-neck vessel', () => {
    expect(analyzeAttachmentSockets(narrowNeckVase()).filter((socket) => socket.family === 'neck')).toHaveLength(2);
  });

  it('moves adjusted coordinates along the surface and clamps unsafe values', () => {
    const scene = cylinder();
    const socket = analyzeAttachmentSockets(scene).find((candidate) => candidate.family === 'body')!;
    const recipe = GENERATED_ATTACHMENT_RECIPES.find((candidate) => candidate.family === 'body')!;
    const limits = getSocketTransformLimits(recipe, socket)!;
    const clamped = clampAttachmentTransform({ horizontalDegrees: 100, verticalRatio: -2, surfaceOffsetRatio: 1, twistDegrees: 300, scaleMultiplier: 5, thicknessMultiplier: 5 }, limits);
    expect(clamped.horizontalDegrees).toBe(limits.horizontalDegrees.max);
    expect(clamped.verticalRatio).toBe(limits.verticalRatio.min);
    expect(clamped.surfaceOffsetRatio).toBe(0.08);
    expect(clamped.twistDegrees).toBe(180);
    expect(clamped.scaleMultiplier).toBe(limits.scaleMultiplier.max);
    expect(clamped.thicknessMultiplier).toBe(1);
    const resolved = resolveAttachmentPlacement(scene, socket, { ...DEFAULT_ATTACHMENT_TRANSFORM, horizontalDegrees: 20, verticalRatio: 0.05 });
    expect(resolved?.azimuth).toBeCloseTo(socket.azimuth + 20);
    expect(resolved?.height).toBeCloseTo(socket.height + 0.05);
    expect(isAttachmentPlacementSafe(scene, socket, recipe, DEFAULT_ATTACHMENT_TRANSFORM)).toBe(true);
    expect(getLiveAttachmentTransformLimits(scene, recipe, socket, DEFAULT_ATTACHMENT_TRANSFORM)).not.toBeNull();
  });

  it('finds the continuous safe slider boundary and rejects overlapping envelopes', () => {
    const range = probeContinuousSafeRange(0, { min: -10, max: 10, step: 1 }, (candidate) => Math.abs(candidate) <= 4.2);
    expect(range.min).toBeCloseTo(-4.2, 1);
    expect(range.max).toBeCloseTo(4.2, 1);

    const scene = cylinder();
    const sockets = analyzeAttachmentSockets(scene).filter((socket) => socket.family === 'body');
    const recipe = GENERATED_ATTACHMENT_RECIPES.find((candidate) => candidate.family === 'body')!;
    expect(attachmentPlacementsCollide(scene,
      { socket: sockets[0], recipe, transform: DEFAULT_ATTACHMENT_TRANSFORM },
      { socket: sockets[0], recipe, transform: DEFAULT_ATTACHMENT_TRANSFORM },
    )).toBe(true);
    expect(attachmentPlacementsCollide(scene,
      { socket: sockets[0], recipe, transform: DEFAULT_ATTACHMENT_TRANSFORM },
      { socket: sockets[1], recipe, transform: DEFAULT_ATTACHMENT_TRANSFORM },
    )).toBe(false);
  });

  it('reuses one mesh bounds scan for an entire live validation pass', () => {
    const scene = cylinder();
    const socket = analyzeAttachmentSockets(scene).find((candidate) => candidate.family === 'body')!;
    const recipe = GENERATED_ATTACHMENT_RECIPES.find((candidate) => candidate.family === 'body')!;
    const boundsSpy = vi.spyOn(THREE.Box3.prototype, 'setFromObject');
    try {
      expect(getLiveAttachmentTransformLimits(scene, recipe, socket, DEFAULT_ATTACHMENT_TRANSFORM)).not.toBeNull();
      expect(boundsSpy).toHaveBeenCalledTimes(1);
    } finally {
      boundsSpy.mockRestore();
    }
  });

  it('aligns local +Z, seats handle contacts, then applies depth, twist, and scale', () => {
    const normal = new THREE.Vector3(1, 0.2, 0).normalize();
    const recipe = GENERATED_ATTACHMENT_RECIPES[0];
    const placement = { ...DEFAULT_ATTACHMENT_TRANSFORM, surfaceOffsetRatio: 0.02, twistDegrees: 45, scaleMultiplier: 1.25 };
    const transform = getAttachmentMountTransform(normal, 11, recipe, placement);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(transform.quaternion).angleTo(normal)).toBeLessThan(0.00001);
    const expectedInset = Math.min(recipe.envelope.contactRadius * recipe.scaleRatio * placement.scaleMultiplier * 0.4, 0.014);
    expect(transform.offset.dot(normal)).toBeCloseTo(11 * (placement.surfaceOffsetRatio - expectedInset));
    expect(transform.scale).toBeCloseTo(11 * recipe.scaleRatio * 1.25);
  });

  it('slightly embeds default handle lugs but leaves body ornaments outside the surface', () => {
    const handle = GENERATED_ATTACHMENT_RECIPES.find((recipe) => recipe.family === 'handle')!;
    const body = GENERATED_ATTACHMENT_RECIPES.find((recipe) => recipe.family === 'body')!;
    const normal = new THREE.Vector3(0, 0, 1);

    for (const maxDimension of [6, 10, 18]) {
      expect(getAttachmentMountTransform(normal, maxDimension, handle).offset.dot(normal)).toBeLessThan(0);
    }
    expect(getAttachmentMountTransform(normal, 10, body).offset.dot(normal)).toBeCloseTo(0.06);
  });

  it('fits both handle contacts to a rounded live surface', () => {
    const scene = roundedVase();
    const socket = analyzeAttachmentSockets(scene).find((candidate) => candidate.family === 'handle')!;
    const recipe = GENERATED_ATTACHMENT_RECIPES.find((candidate) => candidate.key === 'round-loop-handle')!;
    const centerPlacement = resolveAttachmentPlacement(scene, socket, DEFAULT_ATTACHMENT_TRANSFORM)!;
    const mount = resolveAttachmentMount(scene, socket, recipe, DEFAULT_ATTACHMENT_TRANSFORM)!;
    const centerRadius = new THREE.Vector2(centerPlacement.position.x, centerPlacement.position.z).length();
    const fittedRadius = new THREE.Vector2(mount.position.x, mount.position.z).length();

    expect(fittedRadius).toBeLessThan(centerRadius);
    expect(mount.verticalScale).toBeGreaterThanOrEqual(mount.scale * 0.85);
    expect(mount.verticalScale).toBeLessThanOrEqual(mount.scale * 1.25);

    const boxHeight = mount.box.getSize(new THREE.Vector3()).y;
    for (const contactY of recipe.mountContactY!) {
      const surface = resolveAttachmentPoint(scene, mount.height + contactY * mount.scale / boxHeight, mount.azimuth, mount.box)!;
      const contact = new THREE.Vector3(0, contactY * mount.verticalScale, 0)
        .applyQuaternion(mount.quaternion)
        .add(mount.position);
      expect(contact.distanceTo(surface.position)).toBeLessThan(recipe.envelope.contactRadius * mount.scale);
    }
  });

  it.each(GENERATED_ATTACHMENT_RECIPES.filter((recipe) => recipe.family === 'handle'))('mounts $name upright and outward on left and right sockets at safe scales', (recipe) => {
    const scene = cylinder();
    const sockets = analyzeAttachmentSockets(scene).filter((socket) => socket.family === 'handle');
    expect(sockets).toHaveLength(2);
    for (const socket of sockets) {
      const limits = getSocketTransformLimits(recipe, socket);
      expect(limits).not.toBeNull();
      for (const scaleMultiplier of [limits!.scaleMultiplier.min, 1, limits!.scaleMultiplier.max]) {
        const placement = { ...DEFAULT_ATTACHMENT_TRANSFORM, scaleMultiplier };
        const resolved = resolveAttachmentPlacement(scene, socket, placement);
        expect(resolved).not.toBeNull();
        const mount = getAttachmentMountTransform(resolved!.normal, resolved!.maxDimension, recipe, placement);
        expect(new THREE.Vector3(0, 0, 1).applyQuaternion(mount.quaternion).angleTo(resolved!.normal)).toBeLessThan(0.00001);
      }
    }
  });
});
