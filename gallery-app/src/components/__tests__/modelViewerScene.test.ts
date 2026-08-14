import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  MODEL_VIEWER_STUDIO_STORAGE_KEY,
  createCycloramaGeometry,
  createStudioLightRig,
  createStudioLayout,
  createViewerFit,
  readStudioPreference,
  writeStudioPreference,
} from '../modelViewerScene';

describe('model viewer scene layout', () => {
  it('centers an off-axis model and places its base on the floor', () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(4, -3, -8),
      new THREE.Vector3(10, 17, -2),
    );

    const fit = createViewerFit(bounds);

    expect(fit.translation).toEqual([-7, 3, 5]);
    expect(fit.footprint).toEqual([6, 6]);
    expect(bounds.min.y + fit.translation[1]).toBe(0);
    expect((bounds.min.x + bounds.max.x) / 2 + fit.translation[0]).toBe(0);
    expect((bounds.min.z + bounds.max.z) / 2 + fit.translation[2]).toBe(0);
    expect(fit.scale).toBe(20);
    expect(fit.minDistance).toBeLessThan(fit.distance);
    expect(fit.maxDistance).toBeGreaterThan(fit.distance);
  });

  it.each([
    ['tall', new THREE.Vector3(1, 8, 1), 8],
    ['wide', new THREE.Vector3(12, 2, 3), 12],
    ['shallow', new THREE.Vector3(3, 5, 0.02), 5],
  ])('scales the studio from a %s product', (_, size, expectedScale) => {
    const fit = createViewerFit(new THREE.Box3(new THREE.Vector3(), size));
    const studio = createStudioLayout(fit.scale);

    expect(fit.scale).toBe(expectedScale);
    expect(studio.floorRadius).toBe(expectedScale * 6);
    expect(studio.curveRadius).toBe(expectedScale * 1.1);
    expect(studio.wallHeight).toBe(expectedScale * 14);
    expect(studio.floorY).toBeLessThan(0);
  });

  it('builds a seamless 360-degree floor, curved horizon, and back wall', () => {
    const layout = createStudioLayout(2);
    const radialSegments = 24;
    const geometry = createCycloramaGeometry(layout, 8, radialSegments);

    const outerRadius = layout.floorRadius + layout.curveRadius;
    expect(geometry.parameters.segments).toBe(radialSegments);
    expect(geometry.getAttribute('normal').count).toBe(geometry.getAttribute('position').count);
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-outerRadius);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(outerRadius);
    expect(geometry.boundingBox?.min.z).toBeCloseTo(-outerRadius);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(outerRadius);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(layout.floorY);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(layout.floorY + layout.wallHeight);

    geometry.dispose();
  });

  it('scales the Blender-style area and point light rig with the product', () => {
    const rig = createStudioLightRig(2);

    expect(rig.areaPosition).toEqual([-7.6, 5.8, 5.6]);
    expect(rig.areaWidth).toBe(9);
    expect(rig.areaHeight).toBe(11);
    expect(rig.areaIntensity).toBe(4.8);
    expect(rig.pointPosition).toEqual([-3, 6.8, 3.8]);
    expect(rig.pointIntensity).toBe(28);
    expect(rig.pointDistance).toBe(24);
    expect(rig.target).toEqual([0, 0.96, 0]);
  });

  it('defaults safely and reads and writes the persistent preference', () => {
    expect(readStudioPreference(undefined)).toBe(true);
    expect(readStudioPreference({ getItem: () => null })).toBe(true);
    expect(readStudioPreference({ getItem: () => 'off' })).toBe(false);

    const setItem = vi.fn();
    writeStudioPreference({ setItem }, false);
    expect(setItem).toHaveBeenCalledWith(MODEL_VIEWER_STUDIO_STORAGE_KEY, 'off');
    writeStudioPreference({ setItem }, true);
    expect(setItem).toHaveBeenLastCalledWith(MODEL_VIEWER_STUDIO_STORAGE_KEY, 'on');
  });
});
