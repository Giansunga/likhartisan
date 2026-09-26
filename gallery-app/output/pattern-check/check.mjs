import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { updateExteriorPatternMask, clonePatternGeometry } from '../../src/components/freeform/exteriorPatternMask.ts';
globalThis.ProgressEvent = class { constructor(type, event) { Object.assign(this, { type }, event); } };
const models = JSON.parse(await fs.readFile(new URL('./catalog.json', import.meta.url)));
const results = [];
for (const model of models) {
  const bytes = await fs.readFile(new URL(`./${model.id}.glb`, import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  json.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString('base64')}`;
  delete json.materials; delete json.textures; delete json.images;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  gltf.scene.traverse((child) => { if (child.isMesh) child.geometry = clonePatternGeometry(child.geometry); });
  const started = performance.now();
  updateExteriorPatternMask(gltf.scene);
  let total = 0, marked = 0, partial = 0;
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    const mask = child.geometry.getAttribute('decorExterior');
    for (let i = 0; i < mask.count; i += 3) {
      total++;
      marked += mask.getX(i);
      if (mask.getX(i) !== mask.getX(i + 1) || mask.getX(i) !== mask.getX(i + 2)) partial++;
    }
  });
  const result = {name:model.name, triangles:total, exterior:marked, partial, ms:Math.round(performance.now()-started)};
  console.log(JSON.stringify(result));
  results.push(result);
}
await fs.writeFile(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2));
if (results.some(r => r.exterior === 0 || r.partial !== 0)) process.exitCode = 1;
