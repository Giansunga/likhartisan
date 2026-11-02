import * as THREE from 'three';
import { type AttachmentSelection, type GeneratedAttachmentSocket } from './attachments';
import { getGeneratedAttachmentRecipe } from './generatedAttachmentCatalog';
import { attachmentPlacementKey, attachmentPlacementsCollide, validateAttachmentTransform,
  type AttachmentPlacementLimitMap, type AttachmentTransformResult } from './attachmentPlacement';

export type AttachmentAnalysis = {
  revision: string;
  status: 'ready' | 'error';
  sockets: GeneratedAttachmentSocket[];
  attachments: AttachmentSelection[];
  placements: Record<string, AttachmentTransformResult>;
  limits: AttachmentPlacementLimitMap;
  message: string;
  maxDimensionToHeight?: number;
};

export function attachmentDesignRevision(modelFile: string, shape: unknown, attachments: AttachmentSelection[]) {
  return JSON.stringify([modelFile, shape, attachments]);
}

/** Validate a complete proposal, so linked handles never commit one side alone. */
export function validateAttachmentDesign(scene: THREE.Object3D, sockets: GeneratedAttachmentSocket[],
  attachments: AttachmentSelection[], revision: string, previous?: AttachmentSelection[]): AttachmentAnalysis {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const socketsById = new Map(sockets.map(socket => [socket.id, socket]));
  const placements: AttachmentAnalysis['placements'] = {};
  const limits: AttachmentPlacementLimitMap = {};
  const instances = attachments.flatMap(selection => selection.placements.map(placement => ({
    selection, placement, socket: socketsById.get(placement.socket.id),
    recipe: getGeneratedAttachmentRecipe(selection.recipeKey, selection.recipeVersion),
  })));
  for (const instance of instances) {
    const { selection, placement, socket, recipe } = instance;
    const key = attachmentPlacementKey(selection.id, placement.socket.id);
    const result = socket && recipe ? validateAttachmentTransform(scene, recipe, socket, placement.transform,
      (candidate, knownBox) => instances.every(other => other === instance || !other.socket || !other.recipe
        || !attachmentPlacementsCollide(scene, { socket, recipe, transform: candidate },
          { socket: other.socket, recipe: other.recipe, transform: other.placement.transform }, knownBox)), box)
      : { status: 'invalid' as const, transform: placement.transform, limits: null,
        reason: !recipe ? 'This saved attachment recipe is unavailable. Remove it or choose another attachment.'
          : 'This shape has no compatible socket. Change the shape or remove this attachment.' };
    placements[key] = result;
    limits[key] = result.limits;
  }
  const signature = (values: AttachmentSelection[]) => JSON.stringify(values.map(selection => [selection.id, selection.placements.map(p => p.socket.id)]));
  if (previous && signature(previous) === signature(attachments)
    && Object.values(placements).some(result => result.status !== 'valid')) {
    const accepted = validateAttachmentDesign(scene, sockets, previous, revision);
    if (Object.values(accepted.placements).every(result => result.status === 'valid')) {
      return { ...accepted, message: 'That adjustment is unsafe. The last safe placement was kept.' };
    }
  }
  // Recheck the complete adjusted proposal to prevent independent fallbacks from
  // colliding with one another. Never silently remove an invalid placement.
  const next = attachments.map(selection => ({ ...selection, placements: selection.placements.map(placement => {
    const result = placements[attachmentPlacementKey(selection.id, placement.socket.id)];
    const socket = socketsById.get(placement.socket.id);
    return { socket: socket ? { id: socket.id, name: socket.name, family: socket.family, height: socket.height,
      azimuth: socket.azimuth, pairGroup: socket.pairGroup } : placement.socket,
      transform: result.status === 'invalid' ? placement.transform : result.transform };
  }) }));
  const adjustedInstances = next.flatMap(selection => selection.placements.map(placement => ({ selection, placement,
    socket: socketsById.get(placement.socket.id), recipe: getGeneratedAttachmentRecipe(selection.recipeKey, selection.recipeVersion) })));
  for (let i = 0; i < adjustedInstances.length; i++) {
    const first = adjustedInstances[i];
    for (let j = i + 1; j < adjustedInstances.length; j++) {
      const second = adjustedInstances[j];
      if (!first.socket || !second.socket || !first.recipe || !second.recipe) continue;
      if (attachmentPlacementsCollide(scene, { socket: first.socket, recipe: first.recipe, transform: first.placement.transform },
        { socket: second.socket, recipe: second.recipe, transform: second.placement.transform }, box)) {
        for (const item of [first, second]) {
          const key = attachmentPlacementKey(item.selection.id, item.placement.socket.id);
          placements[key] = { ...placements[key], status: 'invalid', reason: 'Attachments overlap. Adjust or remove one of them.' };
        }
      }
    }
  }
  const size = box.getSize(new THREE.Vector3());
  return { revision, status: 'ready', sockets, attachments: next, placements, limits,
    maxDimensionToHeight: size.y > 0 ? Math.max(size.x, size.y, size.z) / size.y : 1,
    message: Object.values(placements).some(result => result.status === 'adjusted') ? 'An attachment was adjusted to a safe placement.' : '' };
}
