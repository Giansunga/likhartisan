// Optional verification against the locally cached catalog; does not fetch or edit models.
import fs from 'node:fs';
import { expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyShapeGeometry, cacheProfileCoefficients, getBoundsFromSnapshots, getGeometrySnapshot } from '../src/components/freeform/shapeGeometry';
import { getSectionAnchors, measureModelScene } from '../src/components/freeform/calibrateModel';
import { analyzeAttachmentSockets, prepareAttachmentSurface, validateAttachmentTransform } from '../src/components/freeform/attachmentPlacement';
import { GENERATED_ATTACHMENT_RECIPES } from '../src/components/freeform/generatedAttachmentCatalog';
import { getDefaultAttachmentTransform } from '../src/components/freeform/attachments';
import { clonePatternGeometry } from '../src/components/freeform/exteriorPatternMask';
import { shapeFromModelBase } from '../src/lib/measurements';

const directory = 'output/pattern-check';
const available = fs.existsSync(`${directory}/catalog.json`);
it.skipIf(!available)('verifies shapes, every recipe, and control timings on representative cached models', async () => {
  const catalog = JSON.parse(fs.readFileSync(`${directory}/catalog.json`, 'utf8')) as Array<{ id: string; name: string }>;
  const names = ['Bottle Teracotta Vase', 'Rounded Garden Planter', 'Tall Cylinder Planter', 'Mini Terracotta Bowl',
    'Large Tapered Square Planter', 'Wave Pot', 'Banded Terracotta Vase'];
  const report = [];
  for (const model of catalog.filter(model => names.includes(model.name))) {
    const bytes = fs.readFileSync(`${directory}/${model.id}.glb`);
    const length = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
    json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + length).toString('base64')}`;
    delete json.materials; delete json.textures; delete json.images;
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    const { scene } = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
    const snapshots = new Map<THREE.BufferGeometry, NonNullable<ReturnType<typeof getGeometrySnapshot>>>();
    scene.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry = clonePatternGeometry(child.geometry);
      snapshots.set(child.geometry, getGeometrySnapshot(child, scene)!);
    });
    const bounds = getBoundsFromSnapshots(snapshots.values());
    snapshots.forEach(snapshot => cacheProfileCoefficients(snapshot, bounds));
    const sections = getSectionAnchors(scene);
    const base = shapeFromModelBase(measureModelScene(scene));
    const cases = [base];
    for (const key of ['height', 'bodyWidth', 'neckWidth', 'rimSize', 'curvature'] as const) {
      for (const factor of [.5, 1.5]) cases.push({ ...base, [key]: key === 'curvature' ? (factor === .5 ? 0 : 100) : base[key] * factor });
    }
    cases.push({ ...base, height: base.height * 1.5, bodyWidth: base.bodyWidth * .5, neckWidth: base.neckWidth * 1.5, rimSize: base.rimSize * .5, curvature: 100 });
    const timings: number[] = [];
    let checks = 0, valid = 0, invalid = 0;
    for (const shape of cases) {
      snapshots.forEach((snapshot, geometry) => applyShapeGeometry(geometry, snapshot, bounds, shape, sections));
      snapshots.forEach((_, geometry) => expect((geometry.getAttribute('position').array as Float32Array).every(Number.isFinite)).toBe(true));
      prepareAttachmentSurface(scene);
      const sockets = analyzeAttachmentSockets(scene);
      for (const recipe of GENERATED_ATTACHMENT_RECIPES) {
        const socket = sockets.find(socket => socket.family === recipe.family);
        if (!socket) { invalid++; continue; }
        const start = performance.now();
        const result = validateAttachmentTransform(scene, recipe, socket, getDefaultAttachmentTransform(recipe.family));
        timings.push(performance.now() - start);
        checks++;
        if (result.status === 'invalid') invalid++; else valid++;
        expect(result.reason || result.status === 'valid').toBeTruthy();
        if (result.limits) {
          for (const range of Object.values(result.limits)) expect(range.min).toBeLessThanOrEqual(range.max);
        }
      }
    }
    // Reset must be byte-for-byte identical after the entire edit sequence.
    snapshots.forEach((snapshot, geometry) => {
      applyShapeGeometry(geometry, snapshot, bounds, base, sections);
      const current = geometry.getAttribute('position').array;
      expect(Buffer.from(current.buffer, current.byteOffset, current.byteLength).equals(Buffer.from(snapshot.localPositions.buffer))).toBe(true);
      const normal = geometry.getAttribute('normal').array;
      expect(Buffer.from(normal.buffer, normal.byteOffset, normal.byteLength).equals(Buffer.from(snapshot.localNormals!.buffer))).toBe(true);
    });
    timings.sort((a, b) => a - b);
    report.push({ model: model.name, bytes: bytes.length, shapeCases: cases.length, recipes: GENERATED_ATTACHMENT_RECIPES.length,
      checks, valid, invalid, controlMedianMs: timings[Math.floor(timings.length * .5)], controlP95Ms: timings[Math.floor(timings.length * .95)] });
    console.log('Verified', model.name);
    fs.mkdirSync('output/freeform-repair', { recursive: true });
    fs.writeFileSync('output/freeform-repair/catalog-verification.json', JSON.stringify(report, null, 2));
    scene.traverse(child => { if (child instanceof THREE.Mesh) child.geometry.dispose(); });
  }
  fs.mkdirSync('output/freeform-repair', { recursive: true });
  fs.writeFileSync('output/freeform-repair/catalog-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}, 180000);
