import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyGeneratedAttachmentThickness, countRecipeTriangles, disposeGeneratedAttachment, GENERATED_ATTACHMENT_RECIPES } from '../generatedAttachmentCatalog';

describe('generated attachment catalog', () => {
  it('contains the seven stable, unique versioned recipes', () => {
    expect(GENERATED_ATTACHMENT_RECIPES).toHaveLength(7);
    expect(new Set(GENERATED_ATTACHMENT_RECIPES.map((recipe) => `${recipe.key}@${recipe.version}`)).size).toBe(7);
  });

  it('defines the Round Loop Handle mounting contract', () => {
    const recipe = GENERATED_ATTACHMENT_RECIPES.find((candidate) => candidate.key === 'round-loop-handle');
    expect(recipe).toMatchObject({
      version: 1,
      name: 'Round Loop Handle',
      family: 'handle',
      style: 'minimal',
      scaleRatio: 0.075,
      envelope: { width: 0.9, height: 3.2, depth: 2.2, contactRadius: 0.32, triangleBudget: 3000 },
    });
    const object = recipe!.build();
    expect(object.children.some((child) => child instanceof THREE.Mesh && child.geometry.type === 'TubeGeometry')).toBe(true);
    disposeGeneratedAttachment(object);
  });

  it.each(GENERATED_ATTACHMENT_RECIPES.filter((recipe) => recipe.family === 'handle'))('$name stands upright and projects outward from its contact plane', (recipe) => {
    const object = recipe.build();
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    expect(box.min.z).toBeGreaterThanOrEqual(-0.03);
    expect(box.min.z).toBeLessThanOrEqual(0.03);
    expect(size.y).toBeGreaterThan(size.x);
    expect(size.y).toBeGreaterThan(size.z);
    expect(size.z).toBeGreaterThan(size.x);
    const contactMeshes = object.children.filter((child) => child instanceof THREE.Mesh && child.geometry.type === 'SphereGeometry' && new THREE.Box3().setFromObject(child).min.z <= 0.001);
    expect(contactMeshes.length).toBeGreaterThanOrEqual(2);
    contactMeshes.forEach((contact) => {
      const contactSize = new THREE.Box3().setFromObject(contact).getSize(new THREE.Vector3());
      expect(Math.max(contactSize.x, contactSize.y, contactSize.z)).toBeLessThanOrEqual(0.4);
    });
    disposeGeneratedAttachment(object);
  });

  it.each(GENERATED_ATTACHMENT_RECIPES.filter((recipe) => recipe.family === 'handle'))('$name changes cross-section without rebuilding or moving its authored parts', (recipe) => {
    const object = recipe.build();
    object.updateMatrixWorld(true);
    const geometries: THREE.BufferGeometry[] = [];
    const childVerticalPositions: number[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      geometries.push(child.geometry);
      childVerticalPositions.push(child.position.y);
    });

    applyGeneratedAttachmentThickness(object, 0.5);
    object.updateMatrixWorld(true);
    const thinBox = new THREE.Box3().setFromObject(object);
    applyGeneratedAttachmentThickness(object, 1.5);
    object.updateMatrixWorld(true);
    const thickBox = new THREE.Box3().setFromObject(object);

    const currentGeometries: THREE.BufferGeometry[] = [];
    const currentVerticalPositions: number[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      currentGeometries.push(child.geometry);
      currentVerticalPositions.push(child.position.y);
    });
    expect(currentGeometries).toEqual(geometries);
    expect(currentVerticalPositions).toEqual(childVerticalPositions);
    expect(thickBox.getSize(new THREE.Vector3()).x).toBeGreaterThan(thinBox.getSize(new THREE.Vector3()).x);
    expect(thinBox.min.z).toBeGreaterThanOrEqual(-0.03);
    expect(thickBox.min.z).toBeGreaterThanOrEqual(-0.03);
    disposeGeneratedAttachment(object);
  });

  it.each(GENERATED_ATTACHMENT_RECIPES)('$name builds deterministic, finite geometry within its budget', (recipe) => {
    const first = recipe.build();
    const second = recipe.build();
    const firstBox = new THREE.Box3().setFromObject(first);
    const secondBox = new THREE.Box3().setFromObject(second);
    const firstSize = firstBox.getSize(new THREE.Vector3());
    const secondSize = secondBox.getSize(new THREE.Vector3());
    expect(firstSize.toArray()).toEqual(secondSize.toArray());
    expect(firstSize.x).toBeLessThanOrEqual(recipe.envelope.width + 0.05);
    expect(firstSize.y).toBeLessThanOrEqual(recipe.envelope.height + 0.05);
    expect(firstSize.z).toBeLessThanOrEqual(recipe.envelope.depth + 0.05);
    expect(firstBox.min.z).toBeGreaterThanOrEqual(-0.03);
    expect(countRecipeTriangles(first)).toBeLessThanOrEqual(recipe.envelope.triangleBudget);
    first.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const positions = child.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        expect(Number.isFinite(positions.getX(index))).toBe(true);
        expect(Number.isFinite(positions.getY(index))).toBe(true);
        expect(Number.isFinite(positions.getZ(index))).toBe(true);
      }
      expect(child.geometry.getAttribute('normal')).toBeDefined();
    });
    disposeGeneratedAttachment(first);
    disposeGeneratedAttachment(second);
  });
});
