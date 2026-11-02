import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { analyzeAttachmentSockets, attachmentPlacementKey, isAttachmentPlacementSafe, prepareAttachmentSurface, validateAttachmentTransform } from '../attachmentPlacement';
import { attachmentDesignRevision, validateAttachmentDesign } from '../attachmentValidation';
import { createAttachmentSelection, normalizeAttachmentSelections } from '../attachments';
import { GENERATED_ATTACHMENT_RECIPES } from '../generatedAttachmentCatalog';

function setup() {
  const scene = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 48, 20), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  prepareAttachmentSurface(scene);
  const sockets = analyzeAttachmentSockets(scene);
  const recipe = GENERATED_ATTACHMENT_RECIPES.find(r => r.key === 'bamboo-loop')!;
  const selection = createAttachmentSelection({ recipe, shopId: null, priceAdjustment: 100, productionDaysAdjustment: 1 }, sockets.filter(s => s.family === 'handle'));
  return { scene, sockets, recipe, selection };
}

describe('shared attachment validation', () => {
  it.each([.5, 1, 1.5])('seats handles using the actual %s thickness', thicknessMultiplier => {
    const { scene, sockets, recipe, selection } = setup();
    const socket = sockets.find(s => s.family === 'handle')!;
    const transform = { ...selection.placements[0].transform, thicknessMultiplier };
    const result = validateAttachmentTransform(scene, recipe, socket, transform);
    expect(result.status).not.toBe('invalid');
    expect(result.transform.thicknessMultiplier).toBe(thicknessMultiplier);
    expect(isAttachmentPlacementSafe(scene, socket, recipe, result.transform)).toBe(true);
  });
  it('returns and commits the actual safe fallback instead of only its limits', () => {
    const { scene, sockets, recipe, selection } = setup();
    const socket = sockets.find(s => s.id === selection.placements[0].socket.id)!;
    const input = { ...selection.placements[0].transform, surfaceOffsetRatio: 0.04, twistDegrees: 160 };
    const result = validateAttachmentTransform(scene, recipe, socket, input);
    expect(result.status).toBe('adjusted');
    expect(result.transform).not.toEqual(input);
    expect(isAttachmentPlacementSafe(scene, socket, recipe, result.transform)).toBe(true);
    selection.placements[0].transform = input;
    const analysis = validateAttachmentDesign(scene, sockets, [selection], 'r1');
    expect(analysis.attachments[0].placements[0].transform).toEqual(result.transform);
  });

  it('rejects an unsafe linked proposal as a complete transaction', () => {
    const { scene, sockets, selection } = setup();
    const accepted = validateAttachmentDesign(scene, sockets, [selection], 'before');
    expect(Object.values(accepted.placements).every(p => p.status !== 'invalid')).toBe(true);
    const proposed = accepted.attachments.map(s => ({ ...s, placements: s.placements.map((p, index) => ({ ...p,
      transform: { ...p.transform, twistDegrees: index ? -160 : 160, surfaceOffsetRatio: 0.04 },
    })) }));
    const result = validateAttachmentDesign(scene, sockets, proposed, 'after', accepted.attachments);
    expect(result.attachments).toEqual(accepted.attachments);
    expect(result.message).toMatch(/last safe/);
  });

  it('retains placements when the current shape loses every compatible socket', () => {
    const { scene, selection } = setup();
    const result = validateAttachmentDesign(scene, [], [selection], 'no-sockets');
    expect(result.attachments).toEqual([selection]);
    for (const placement of selection.placements) {
      expect(result.placements[attachmentPlacementKey(selection.id, placement.socket.id)]).toMatchObject({ status: 'invalid', limits: null });
    }
  });

  it('retains unavailable recipes and isolates overlapping placements', () => {
    const { scene, sockets, selection } = setup();
    const unavailable = { ...selection, id: 'old', recipeVersion: 99 };
    const result = validateAttachmentDesign(scene, sockets, [unavailable], 'old');
    expect(result.attachments).toEqual([unavailable]);
    expect(Object.values(result.placements).every(p => p.status === 'invalid' && p.reason.includes('recipe'))).toBe(true);
    const duplicated = { ...selection, id: 'duplicate' };
    const overlap = validateAttachmentDesign(scene, sockets, [selection, duplicated], 'overlap');
    expect(overlap.attachments).toHaveLength(2);
    expect(Object.values(overlap.placements).every(p => p.status === 'invalid')).toBe(true);
  });

  it('round trips accepted transforms and changes revisions for socket or shape edits', () => {
    const { scene, sockets, selection } = setup();
    const result = validateAttachmentDesign(scene, sockets, [selection], 'saved');
    expect(normalizeAttachmentSelections(JSON.parse(JSON.stringify(result.attachments)))).toEqual(result.attachments);
    const revision = attachmentDesignRevision('/model.glb', { height: 10 }, result.attachments);
    expect(attachmentDesignRevision('/model.glb', { height: 11 }, result.attachments)).not.toBe(revision);
    expect(attachmentDesignRevision('/other.glb', { height: 10 }, result.attachments)).not.toBe(revision);
  });
});
