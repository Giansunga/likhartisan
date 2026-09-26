import { it, expect } from 'vitest';
import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { analyzeAttachmentSockets, prepareAttachmentSurface, getLiveAttachmentTransformLimits, resolveAttachmentMount } from '../../src/components/freeform/attachmentPlacement';
import { GENERATED_ATTACHMENT_RECIPES } from '../../src/components/freeform/generatedAttachmentCatalog';
import { DEFAULT_ATTACHMENT_TRANSFORM } from '../../src/components/freeform/attachments';
import { clonePatternGeometry } from '../../src/components/freeform/exteriorPatternMask';
it('benchmarks Wave Pot attachment controls', async () => {
  const models = JSON.parse(fs.readFileSync('output/pattern-check/catalog.json', 'utf8'));
  const model = models.find((m: {name:string}) => m.name === 'Wave Pot');
  const bytes = fs.readFileSync(`output/pattern-check/${model.id}.glb`);
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + length).toString('base64')}`;
  delete json.materials; delete json.textures; delete json.images;
  for (const mesh of json.meshes) for (const p of mesh.primitives) delete p.material;
  const { scene } = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  scene.traverse((mesh: any) => { if(mesh.isMesh) mesh.geometry=clonePatternGeometry(mesh.geometry); });
  let start = performance.now();
  const original = analyzeAttachmentSockets(scene);
  const before = performance.now() - start;
  start = performance.now(); prepareAttachmentSurface(scene); const prepare = performance.now()-start;
  start = performance.now(); const accelerated = analyzeAttachmentSockets(scene); const after=performance.now()-start;
  expect(accelerated).toEqual(original);
  const recipe=GENERATED_ATTACHMENT_RECIPES.find(r=>r.family==='handle')!;
  const socket=accelerated.find(s=>s.family==='handle')!;
  const times: number[]=[];
  for(let i=0;i<30;i++) {
    const transform={...DEFAULT_ATTACHMENT_TRANSFORM,horizontalDegrees:i-15};
    start=performance.now();
    resolveAttachmentMount(scene,socket,recipe,transform);
    getLiveAttachmentTransformLimits(scene,recipe,socket,transform);
    times.push(performance.now()-start);
  }
  times.sort((a,b)=>a-b);
  const result={beforeMs:Math.round(before),prepareMs:Math.round(prepare),afterMs:Math.round(after),controlMedianMs:times[15],controlP95Ms:times[28]};
  console.log(JSON.stringify(result));
  fs.writeFileSync('output/pattern-check/attachment-performance.json',JSON.stringify(result,null,2));
},60000);
