import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createServer } from 'vite';

// Input: catalog.json and the exact file_url GLB for each row, named <id>.glb.
const [, , input, output] = process.argv;
if (!input || !output) throw new Error('Usage: node scripts/audit-freeform-shapes.mjs <asset-directory> <report-directory>');
await fs.mkdir(output, { recursive: true });
globalThis.ProgressEvent ??= class { constructor(type, event) { Object.assign(this, { type }, event); } };
const vite = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' });

async function loadGeometry(file) {
  const bytes = await fs.readFile(file);
  const size = bytes.readUInt32LE(12);
  const data = JSON.parse(bytes.subarray(20, 20 + size).toString());
  data.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + size).toString('base64');
  delete data.materials;
  delete data.textures;
  delete data.images;
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(data), '')).scene;
}

function sampleSections(meshes, bounds, heights) {
  const planes = heights.map((t) => bounds.minY + bounds.rangeY * t);
  const result = heights.map(() => []);
  for (const entry of meshes) {
    const { mesh, snapshot } = entry;
    const indices = mesh.geometry.getIndex();
    const positions = snapshot.rootPositions;
    const count = indices?.count ?? positions.length / 3;
    for (let i = 0; i < count; i += 3) {
      const triangle = [0, 1, 2].map((offset) => indices?.getX(i + offset) ?? i + offset);
      for (let edge = 0; edge < 3; edge++) {
        const a = triangle[edge];
        const b = triangle[(edge + 1) % 3];
        const ay = positions[a * 3 + 1];
        const by = positions[b * 3 + 1];
        for (let j = 0; j < planes.length; j++) {
          const y = planes[j];
          if (y < Math.min(ay, by) || y > Math.max(ay, by)) continue;
          result[j].push([entry, a, b, ay === by ? 0 : (y - ay) / (by - ay)]);
        }
      }
    }
  }
  return result;
}

function measureSections(samples) {
  return samples.map((edges) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, y = 0;
    const points = [];
    for (const [entry, a, b, blend] of edges) {
      const { deformed: p } = entry;
      const x = THREE.MathUtils.lerp(p[a * 3], p[b * 3], blend);
      y = THREE.MathUtils.lerp(p[a * 3 + 1], p[b * 3 + 1], blend);
      const z = THREE.MathUtils.lerp(p[a * 3 + 2], p[b * 3 + 2], blend);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      points.push([x, z]);
    }
    return points.length ? { minX, maxX, y, width: Math.max(maxX - minX, maxZ - minZ), points } : null;
  });
}

try {
  const { resolveShapeTargets } = await vite.ssrLoadModule('/src/components/freeform/calibrateModel.ts');
  const { applyShapeGeometry, getGeometrySnapshot, getBoundsFromSnapshots, cacheProfileCoefficients } =
    await vite.ssrLoadModule('/src/components/freeform/shapeGeometry.ts');
  const { shapeFromModelBase, normalizeShapeParams, hasShapeTarget, DEFAULT_SHAPE_PARAMS_IN } =
    await vite.ssrLoadModule('/src/lib/measurements.ts');
  const { modelBaseFromRow } = await vite.ssrLoadModule('/src/components/freeform/modelEstimate.ts');
  const models = JSON.parse(await fs.readFile(path.join(input, 'catalog.json'), 'utf8'));
  const results = [];
  const controls = ['height', 'bodyWidth', 'neckWidth', 'rimSize', 'curvature'];
  const legacySections = { body: 0.45, neck: 0.8, rim: 0.98 };
  for (const model of models) {
    const row = { name: model.name, asset: model.file_url.split('/').at(-1), selectable: Boolean(modelBaseFromRow(model)), cases: [] };
    try {
      const scene = await loadGeometry(path.join(input, model.id + '.glb'));
      const profile = resolveShapeTargets(scene, model.id, model.file_url);
      row.profile = profile;
      const baseline = shapeFromModelBase(modelBaseFromRow(model) ?? DEFAULT_SHAPE_PARAMS_IN);
      const neutral = { ...baseline, targetProfile: profile };
      if (JSON.stringify(normalizeShapeParams(neutral).targetProfile) !== JSON.stringify(profile)) {
        // Optional empty fields can be normalized away, but no targets may be lost.
        if (!normalizeShapeParams(neutral).targetProfile) throw Error('Detected target profile failed snapshot validation');
      }
      const meshes = [];
      scene.traverse((mesh) => {
        if (mesh.isMesh) meshes.push({ mesh, snapshot: getGeometrySnapshot(mesh, scene) });
      });
      const bounds = getBoundsFromSnapshots(meshes.map(({ snapshot }) => snapshot));
      for (const entry of meshes) {
        cacheProfileCoefficients(entry.snapshot, bounds);
        entry.toRoot = entry.snapshot.rootToLocal.clone().invert();
      }
      const active = controls.filter((key) => hasShapeTarget(profile, key));
      row.disabled = controls.filter((key) => !active.includes(key));
      if (row.disabled.length) throw Error('Missing shape targets: ' + row.disabled.join(', '));
      const targets = { foot: profile.foot, bodyWidth: profile.body, neckWidth: profile.neck, rimSize: profile.rim };
      const measuredKeys = Object.keys(targets).filter((key) => targets[key] !== null);
      const slices = Array.from({ length: 55 }, (_, i) => profile.base + (profile.top - profile.base) * i / 54);
      const samples = sampleSections(meshes, bounds, [
        ...measuredKeys.map((key) => targets[key]), ...profile.curve.map(([, peak]) => peak), ...slices,
      ]);
      const variants = [['neutral', neutral]];
      const endpoints = (key) => profile.limits?.[key] ?? (key === 'curvature' ? [0, 100] : [0.5, 1.5]);
      const setEndpoint = (shape, key, endpoint) => {
        const value = endpoints(key)[endpoint];
        shape[key] = key === 'curvature' ? value : baseline[key] * value;
      };
      for (const key of active) for (const endpoint of [0, 1]) {
        const shape = { ...neutral };
        setEndpoint(shape, key, endpoint);
        variants.push([key + (endpoint ? ' max' : ' min'), shape]);
      }
      for (const [label, choose] of [
        ['all min', () => 0], ['all max', () => 1],
        ['alternating A', (i) => i % 2], ['alternating B', (i) => 1 - i % 2],
      ]) {
        const shape = { ...neutral };
        active.forEach((key, i) => setEndpoint(shape, key, choose(i)));
        variants.push([label, shape]);
      }
      let original;
      const views = [];
      const point = new THREE.Vector3();
      for (const [label, shape] of variants) {
        let support = Infinity;
        let top = -Infinity;
        for (const entry of meshes) {
          applyShapeGeometry(entry.mesh.geometry, entry.snapshot, bounds, shape, legacySections);
          const position = entry.mesh.geometry.getAttribute('position');
          entry.deformed ??= new Float32Array(position.count * 3);
          for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(entry.toRoot).toArray(entry.deformed, i * 3);
            const sourceT = (entry.snapshot.rootPositions[i * 3 + 1] - bounds.minY) / bounds.rangeY;
            if (Math.abs(sourceT - profile.base) < 1e-5) support = Math.min(support, point.y);
            if (Math.abs(sourceT - profile.top) < 1e-5) top = Math.max(top, point.y);
          }
          if (entry.deformed.some((n) => !Number.isFinite(n))) throw Error('Nonfinite geometry in ' + label);
        }
        const measured = measureSections(samples);
        const height = top - support;
        original ??= { measured, height, support };
        const failures = [];
        const check = (key, actual, expected, tolerance) => {
          if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance * expected) {
            failures.push({ key, actual, expected, tolerance });
          }
        };
        for (const [i, key] of measuredKeys.entries()) {
          const target = key === 'foot' ? 1 : shape[key] / baseline[key];
          check(key, measured[i]?.width / original.measured[i]?.width, target, target === 1 ? 0.01 : 0.05);
          if (key === 'rimSize' && measured[i] && original.measured[i]) {
            const opening = ({ points, minX, maxX }) => {
              let minZ = Infinity;
              let maxZ = -Infinity;
              for (const [, z] of points) { minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
              const cx = (minX + maxX) / 2;
              const cz = (minZ + maxZ) / 2;
              return points.reduce((min, [x, z]) => Math.min(min, Math.hypot(x - cx, z - cz)), Infinity);
            };
            check('rim opening', opening(measured[i]) / opening(original.measured[i]), target, target === 1 ? 0.01 : 0.05);
          }
        }
        const heightRatio = shape.height / baseline.height;
        if (active.includes('height')) {
          check('height', height / original.height, heightRatio, heightRatio === 1 ? 0.01 : 0.05);
          if (Math.abs(support - original.support) > original.height * 0.01) failures.push({ key: 'grounding' });
        }
        // At a curve peak the neutral width controls are held steady. Validate
        // the intended straightening correction or rounding directly.
        if (label.startsWith('curvature')) profile.curve.forEach(([, , , correction], i) => {
          const index = measuredKeys.length + i;
          const amount = (shape.curvature - 50) / 50;
          const expected = 1 + (amount < 0 ? -amount * correction : amount * 0.12);
          check('curvature ' + (i + 1), measured[index]?.width / original.measured[index]?.width, expected, 0.05);
        });
        row.cases.push({ label, failures });
        const rimIndex = measuredKeys.indexOf('rimSize');
        views.push({
          label,
          side: measured.slice(measuredKeys.length + profile.curve.length).filter(Boolean)
            .map(({ minX, maxX, y }) => [(minX - bounds.centerX) / bounds.rangeY, (maxX - bounds.centerX) / bounds.rangeY, (y - bounds.minY) / bounds.rangeY]),
          rim: rimIndex < 0 ? [] : measured[rimIndex]?.points.filter((_, i) => i % 4 === 0)
            .map(([x, z]) => [(x - bounds.centerX) / bounds.rangeY, (z - bounds.centerZ) / bounds.rangeY]),
        });
      }
      await fs.writeFile(path.join(output, model.id + '-views.json'), JSON.stringify(views));
      const failCount = row.cases.filter(({ failures }) => failures.length).length;
      console.log(model.name, failCount ? `${failCount} failed cases` : 'PASS', row.disabled.length ? `disabled: ${row.disabled.join(', ')}` : '');
    } catch (error) {
      row.error = String(error);
      console.error(model.name, row.error);
    }
    results.push(row);
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  if (results.some((row) => row.error || row.cases.some(({ failures }) => failures.length))) process.exitCode = 1;
} finally {
  await vite.close();
}
