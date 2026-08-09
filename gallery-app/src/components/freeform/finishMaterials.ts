import * as THREE from 'three';
import { getFinishDefinition, type FinishDefinition, type KnownFinishId, type MaterialParams } from './materials';

export type FinishTextureSet = { normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture };

const TEXTURE_SIZE = 64;
const textureCache = new Map<KnownFinishId, FinishTextureSet>();

function seededNoise(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function makeHeightField(definition: FinishDefinition) {
  const random = seededNoise(Array.from(definition.id).reduce((seed, char) => Math.imul(seed ^ char.charCodeAt(0), 16777619), 2166136261));
  const values = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const index = y * TEXTURE_SIZE + x;
      const fineNoise = random() * 2 - 1;
      const waveX = Math.sin((x / TEXTURE_SIZE) * Math.PI * 8 + y * 0.13);
      const waveY = Math.sin((y / TEXTURE_SIZE) * Math.PI * 5 + x * 0.07);
      switch (definition.textureStyle) {
        case 'clay': values[index] = fineNoise * 0.7 + waveX * 0.18 + waveY * 0.12; break;
        case 'fine': values[index] = fineNoise * 0.32 + waveX * 0.04; break;
        case 'glaze': values[index] = fineNoise * 0.08 + waveY * 0.035; break;
        case 'orange-peel': values[index] = fineNoise * 0.42 + Math.sin((x + y) * 0.55) * 0.14; break;
        case 'brush': values[index] = fineNoise * 0.18 + Math.sin(y * 0.72 + Math.sin(x * 0.18)) * 0.55; break;
      }
    }
  }
  return values;
}

function makeTexture(data: Uint8Array, repeat: number) {
  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createFinishTextureSet(definition: FinishDefinition): FinishTextureSet {
  const heights = makeHeightField(definition);
  const normalData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const roughnessData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const read = (x: number, y: number) => heights[((y + TEXTURE_SIZE) % TEXTURE_SIZE) * TEXTURE_SIZE + ((x + TEXTURE_SIZE) % TEXTURE_SIZE)];

  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const pixel = (y * TEXTURE_SIZE + x) * 4;
      const dx = read(x + 1, y) - read(x - 1, y);
      const dy = read(x, y + 1) - read(x, y - 1);
      const normal = new THREE.Vector3(-dx, -dy, 2).normalize();
      normalData[pixel] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normalData[pixel + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normalData[pixel + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      normalData[pixel + 3] = 255;
      const variation = THREE.MathUtils.clamp(heights[y * TEXTURE_SIZE + x] * definition.roughnessVariation, -0.2, 0.2);
      const roughness = Math.round(THREE.MathUtils.clamp(definition.roughness + variation, 0.04, 1) * 255);
      roughnessData[pixel] = roughness;
      roughnessData[pixel + 1] = roughness;
      roughnessData[pixel + 2] = roughness;
      roughnessData[pixel + 3] = 255;
    }
  }

  return {
    normalMap: makeTexture(normalData, definition.textureRepeat),
    roughnessMap: makeTexture(roughnessData, definition.textureRepeat),
  };
}

export function getFinishTextureSet(finish: unknown): FinishTextureSet {
  const definition = getFinishDefinition(finish);
  const cached = textureCache.get(definition.id);
  if (cached) return cached;
  const textures = createFinishTextureSet(definition);
  textureCache.set(definition.id, textures);
  return textures;
}

function copyMaterialRenderingProperties(source: THREE.Material, target: THREE.MeshPhysicalMaterial) {
  target.name = source.name;
  target.side = source.side;
  target.shadowSide = source.shadowSide;
  target.opacity = source.opacity;
  target.transparent = source.transparent;
  target.alphaTest = source.alphaTest;
  target.depthTest = source.depthTest;
  target.depthWrite = source.depthWrite;
  target.colorWrite = source.colorWrite;
  target.blending = source.blending;
  target.blendSrc = source.blendSrc;
  target.blendDst = source.blendDst;
  target.blendEquation = source.blendEquation;
  target.polygonOffset = source.polygonOffset;
  target.polygonOffsetFactor = source.polygonOffsetFactor;
  target.polygonOffsetUnits = source.polygonOffsetUnits;
  target.visible = source.visible;
  target.toneMapped = source.toneMapped;
  target.userData = { ...source.userData };
  if (source instanceof THREE.MeshStandardMaterial) {
    target.flatShading = source.flatShading;
    target.vertexColors = source.vertexColors;
  }
}

export function ensurePhysicalMaterial(source: THREE.Material): THREE.MeshPhysicalMaterial {
  if (source instanceof THREE.MeshPhysicalMaterial) return source;
  const material = new THREE.MeshPhysicalMaterial();
  copyMaterialRenderingProperties(source, material);
  return material;
}

export function ensurePhysicalMaterials(mesh: THREE.Mesh): THREE.MeshPhysicalMaterial[] {
  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const materials = sourceMaterials.map(ensurePhysicalMaterial);
  sourceMaterials.forEach((source, index) => {
    if (source !== materials[index]) source.dispose();
  });
  mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
  return materials;
}

export function applyFinishToMaterial(material: THREE.MeshPhysicalMaterial, params: MaterialParams) {
  const definition = getFinishDefinition(params.finish);
  const textures = getFinishTextureSet(definition.id);
  const previousFinish = material.userData.finishId;
  material.color.set(params.color);
  material.map = null;
  material.normalMap = textures.normalMap;
  material.normalScale.setScalar(definition.normalScale);
  material.roughness = definition.roughness;
  material.roughnessMap = textures.roughnessMap;
  material.metalness = definition.metalness;
  material.metalnessMap = null;
  material.clearcoat = definition.clearcoat;
  material.clearcoatRoughness = definition.clearcoatRoughness;
  material.envMapIntensity = definition.id === 'glazed' ? 1.25 : 0.85;
  material.specularIntensity = definition.id === 'raw_clay' ? 0.55 : 1;
  material.userData.finishId = definition.id;
  if (previousFinish !== definition.id) material.needsUpdate = true;
  return material;
}

export function applyFinishToMesh(mesh: THREE.Mesh, params: MaterialParams) {
  return ensurePhysicalMaterials(mesh).map((material) => applyFinishToMaterial(material, params));
}

export function applyFinishToScene(scene: THREE.Object3D, params: MaterialParams) {
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) applyFinishToMesh(child, params);
  });
}

export function generateCylindricalUVs(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(box.max.y - box.min.y, 0.0001);
  const vertex = new THREE.Vector3();

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.attributes.position;
    if (!position) return;
    const uvs = new Float32Array(position.count * 2);
    for (let index = 0; index < position.count; index++) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      uvs[index * 2] = THREE.MathUtils.euclideanModulo(Math.atan2(vertex.z - center.z, vertex.x - center.x) / (Math.PI * 2) + 0.5, 1);
      uvs[index * 2 + 1] = THREE.MathUtils.clamp((vertex.y - box.min.y) / height, 0, 1);
    }
    child.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  });
}

export function disposeFinishTextureCache() {
  textureCache.forEach(({ normalMap, roughnessMap }) => {
    normalMap.dispose();
    roughnessMap.dispose();
  });
  textureCache.clear();
}

export function disposeFinishedScene(scene: THREE.Object3D) {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}
