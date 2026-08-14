import * as THREE from 'three';

export const MODEL_VIEWER_STUDIO_STORAGE_KEY = 'likhartisan:model-viewer-studio:v1';
export const MODEL_ROTATION_SPEED = (Math.PI * 2) / 50;

export interface ViewerFit {
  translation: [number, number, number];
  target: [number, number, number];
  footprint: [number, number];
  distance: number;
  minDistance: number;
  maxDistance: number;
  scale: number;
}

export interface StudioLayout {
  floorRadius: number;
  curveRadius: number;
  wallHeight: number;
  floorY: number;
}

export interface StudioLightRig {
  target: [number, number, number];
  areaPosition: [number, number, number];
  areaWidth: number;
  areaHeight: number;
  areaIntensity: number;
  pointPosition: [number, number, number];
  pointIntensity: number;
  pointDistance: number;
}

const MIN_SCENE_SCALE = 0.001;

export function createViewerFit(bounds: THREE.Box3, fovDegrees = 45): ViewerFit {
  if (bounds.isEmpty()) {
    return {
      translation: [0, 0, 0],
      target: [0, 0.5, 0],
      footprint: [1, 1],
      distance: 4,
      minDistance: 2.4,
      maxDistance: 8.8,
      scale: 1,
    };
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = Math.max(size.x, size.y, size.z, MIN_SCENE_SCALE);
  const fovRadians = THREE.MathUtils.degToRad(fovDegrees);
  const distance = (scale / (2 * Math.tan(fovRadians / 2))) * 1.9;

  return {
    translation: [-center.x, -bounds.min.y, -center.z],
    target: [0, Math.max(size.y * 0.46, scale * 0.2), 0],
    footprint: [Math.max(size.x, MIN_SCENE_SCALE), Math.max(size.z, MIN_SCENE_SCALE)],
    distance,
    minDistance: distance * 0.62,
    maxDistance: distance * 2.2,
    scale,
  };
}

export function createStudioLayout(scale: number): StudioLayout {
  const safeScale = Math.max(scale, MIN_SCENE_SCALE);
  return {
    floorRadius: safeScale * 6,
    curveRadius: safeScale * 1.1,
    wallHeight: safeScale * 14,
    floorY: -Math.max(safeScale * 0.002, 0.0001),
  };
}

export function createStudioLightRig(scale: number): StudioLightRig {
  const safeScale = Math.max(scale, MIN_SCENE_SCALE);
  return {
    target: [0, safeScale * 0.48, 0],
    areaPosition: [-safeScale * 3.8, safeScale * 2.9, safeScale * 2.8],
    areaWidth: safeScale * 4.5,
    areaHeight: safeScale * 5.5,
    areaIntensity: 4.8,
    pointPosition: [-safeScale * 1.5, safeScale * 3.4, safeScale * 1.9],
    pointIntensity: 7 * safeScale * safeScale,
    pointDistance: safeScale * 12,
  };
}

export function createCycloramaGeometry(
  layout: StudioLayout,
  curveSegments = 24,
  radialSegments = 96,
): THREE.LatheGeometry {
  const curveSegmentCount = Math.max(2, Math.floor(curveSegments));
  const radialSegmentCount = Math.max(12, Math.floor(radialSegments));
  const profile = [
    new THREE.Vector2(layout.floorRadius, layout.floorY),
  ];

  for (let index = 1; index <= curveSegmentCount; index += 1) {
    const angle = (index / curveSegmentCount) * (Math.PI / 2);
    profile.push(new THREE.Vector2(
      layout.floorRadius + layout.curveRadius * Math.sin(angle),
      layout.floorY + layout.curveRadius * (1 - Math.cos(angle)),
    ));
  }

  profile.push(new THREE.Vector2(
    layout.floorRadius + layout.curveRadius,
    layout.floorY + layout.wallHeight,
  ));

  const geometry = new THREE.LatheGeometry(profile, radialSegmentCount, 0, Math.PI * 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function readStudioPreference(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(MODEL_VIEWER_STUDIO_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeStudioPreference(storage: Pick<Storage, 'setItem'> | undefined, enabled: boolean): void {
  if (!storage) return;
  try {
    storage.setItem(MODEL_VIEWER_STUDIO_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory state still works.
  }
}
