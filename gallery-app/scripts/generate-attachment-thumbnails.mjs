import { mkdir, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { GENERATED_ATTACHMENT_RECIPES, disposeGeneratedAttachment } from '../src/components/freeform/generatedAttachmentCatalog.ts';

globalThis.document = new JSDOM('').window.document;

const output = new URL('../public/images/attachments/', import.meta.url);
await mkdir(output, { recursive: true });

for (const recipe of GENERATED_ATTACHMENT_RECIPES) {
  const object = recipe.build();
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z) * 0.75;
  const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0.1, 100);
  camera.position.copy(center).add(recipe.family === 'handle'
    ? new THREE.Vector3(8, 1.3, 2)
    : new THREE.Vector3(1.2, 1.1, 7));
  camera.lookAt(center);

  const scene = new THREE.Scene();
  scene.add(object);
  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2);
  keyLight.position.set(-3, 5, 8);
  scene.add(keyLight);

  const renderer = new SVGRenderer();
  renderer.setSize(160, 160);
  renderer.setPrecision(1);
  renderer.render(scene, camera);
  const shapes = renderer.domElement.innerHTML;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-80 -80 160 160" width="160" height="160"><defs><linearGradient id="paper" x2="0" y2="1"><stop stop-color="#fbf7f1"/><stop offset="1" stop-color="#efe2d3"/></linearGradient></defs><rect x="-80" y="-80" width="160" height="160" rx="14" fill="url(#paper)"/><ellipse cx="0" cy="61" rx="36" ry="6" fill="#5d3216" opacity=".1"/>${shapes}</svg>`;
  await writeFile(new URL(`${recipe.key}.svg`, output), svg);
  disposeGeneratedAttachment(object);
}
