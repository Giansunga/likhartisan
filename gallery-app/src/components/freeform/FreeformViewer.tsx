import { Suspense, useRef, useMemo, Component, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

class ModelErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const FINISH_PROPS: Record<string, { roughness: number; metalness: number }> = {
  raw_clay: { roughness: 0.9, metalness: 0.0 },
  matte: { roughness: 0.7, metalness: 0.0 },
  ceramic: { roughness: 0.4, metalness: 0.1 },
  glazed: { roughness: 0.15, metalness: 0.2 },
  metallic: { roughness: 0.3, metalness: 0.8 },
};

type ShapeParams = { height: number; bodyWidth: number; neckWidth: number; rimSize: number; curvature: number };
type MaterialParams = { finish: string; color: string };

type GeometrySnapshot = { rootPositions: Float32Array; rootToLocal: THREE.Matrix4 };
type ModelBounds = { minY: number; rangeY: number; centerX: number; centerY: number; centerZ: number };

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normalizeParam(value: number, midpoint: number): number {
  return THREE.MathUtils.clamp((value - midpoint) / midpoint, -1, 1);
}

function controlScale(value: number, midpoint: number, shrink = 0.45, grow = 0.45): number {
  const normalized = normalizeParam(value, midpoint);
  return 1 + (normalized < 0 ? normalized * shrink : normalized * grow);
}

function getGeometrySnapshot(mesh: THREE.Mesh, root: THREE.Group): GeometrySnapshot | null {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  if (!position) return null;

  root.updateWorldMatrix(true, true);
  mesh.updateWorldMatrix(true, false);

  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const localToRoot = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
  const rootToLocal = new THREE.Matrix4().multiplyMatrices(
    new THREE.Matrix4().copy(mesh.matrixWorld).invert(),
    root.matrixWorld
  );

  const localPositions = position.array.slice() as Float32Array;
  const rootPositions = new Float32Array(localPositions.length);
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.set(localPositions[i * 3], localPositions[i * 3 + 1], localPositions[i * 3 + 2]);
    vertex.applyMatrix4(localToRoot);
    rootPositions[i * 3] = vertex.x;
    rootPositions[i * 3 + 1] = vertex.y;
    rootPositions[i * 3 + 2] = vertex.z;
  }

  return { rootPositions, rootToLocal };
}

function getBoundsFromSnapshots(snapshots: Iterable<GeometrySnapshot>): ModelBounds {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const snapshot of snapshots) {
    for (let i = 0; i < snapshot.rootPositions.length; i += 3) {
      const x = snapshot.rootPositions[i];
      const y = snapshot.rootPositions[i + 1];
      const z = snapshot.rootPositions[i + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }

  return {
    minY,
    rangeY: maxY - minY || 1,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

function getProfileScale(t: number, shapeParams: ShapeParams): number {
  const bodyScale = controlScale(shapeParams.bodyWidth, 20);
  const neckScale = controlScale(shapeParams.neckWidth, 15, 0.4, 0.4);
  const rimScale = controlScale(shapeParams.rimSize, 12, 0.35, 0.55);
  const curvature = normalizeParam(shapeParams.curvature, 50);

  const baseWeight = 1 - smoothstep(0.06, 0.24, t);
  const bodyWeight = smoothstep(0.12, 0.36, t) * (1 - smoothstep(0.56, 0.76, t));
  const shoulderWeight = smoothstep(0.48, 0.7, t) * (1 - smoothstep(0.7, 0.88, t));
  const neckWeight = smoothstep(0.58, 0.78, t) * (1 - smoothstep(0.84, 0.96, t));
  const rimWeight = smoothstep(0.82, 1.0, t);
  const bellyCurve = Math.sin(t * Math.PI) * 0.16 * curvature;
  const shoulderCurve = shoulderWeight * -0.08 * curvature;

  const targetScale =
    baseWeight * Math.max(0.72, bodyScale * 0.78) +
    bodyWeight * bodyScale +
    shoulderWeight * ((bodyScale + neckScale) / 2) +
    neckWeight * neckScale +
    rimWeight * rimScale;
  const weightSum = baseWeight + bodyWeight + shoulderWeight + neckWeight + rimWeight;
  const blendedScale = weightSum > 0 ? targetScale / weightSum : 1;

  return THREE.MathUtils.clamp(blendedScale + bellyCurve + shoulderCurve, 0.25, 1.8);
}

function Scene({
  modelFile,
  shapeParams,
  materialParams,
  onMorphDetected,
  onControlsReady,
  previewMode = false,
}: {
  modelFile: string;
  shapeParams: ShapeParams;
  materialParams: MaterialParams;
  onMorphDetected: (has: boolean) => void;
  onControlsReady?: (controls: any, camera: THREE.Camera) => void;
  previewMode?: boolean;
}) {
  const gltf = useLoader(GLTFLoader, modelFile);
  const { camera, controls } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  const morphChecked = useRef(false);
  const geometrySnapshotsRef = useRef<Map<THREE.BufferGeometry, GeometrySnapshot>>(new Map());
  const modelBoundsRef = useRef<ModelBounds>({ minY: 0, rangeY: 1, centerX: 0, centerY: 0, centerZ: 0 });

  const scene = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry = child.geometry.clone();
        if (Array.isArray(child.material)) {
          child.material = child.material.map((mat) => mat.clone());
        } else {
          child.material = child.material.clone();
        }
      }
    });

    clonedScene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    clonedScene.position.sub(center);
    clonedScene.updateMatrixWorld(true);

    return clonedScene;
  }, [gltf]);

  const materialColor = useMemo(() => new THREE.Color(materialParams.color), [materialParams.color]);
  const finishProps = FINISH_PROPS[materialParams.finish] || FINISH_PROPS.raw_clay;

  useFrame(() => {
    if (!groupRef.current) return;

    if (!initialized.current) {
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const size = new THREE.Vector3();
      box.getSize(size);

      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          const snapshot = getGeometrySnapshot(child, groupRef.current!);
          if (snapshot) geometrySnapshotsRef.current.set(child.geometry, snapshot);
        }
      });

      modelBoundsRef.current = getBoundsFromSnapshots(geometrySnapshotsRef.current.values());

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
      const distMult = previewMode ? 1.5 : 1.9;
      const dist = (maxDim / (2 * Math.tan(fov / 2))) * distMult;
      const target = new THREE.Vector3(0, 0, 0);

      camera.position.set(
        target.x + dist * (previewMode ? 0.32 : 0.45),
        target.y + dist * (previewMode ? 0.06 : 0.22),
        target.z + dist
      );
      (camera as THREE.PerspectiveCamera).near = 0.01;
      (camera as THREE.PerspectiveCamera).far = dist * 100;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      camera.lookAt(target);

      const orbitControls = controls as any;
      if (orbitControls?.target) {
        orbitControls.target.copy(target);
        orbitControls.update?.();
      }

      initialized.current = true;
      onControlsReady?.(controls, camera);
    }

    if (!morphChecked.current) {
      let hasMorph = false;
      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
          hasMorph = true;
        }
      });
      onMorphDetected(hasMorph);
      morphChecked.current = true;
    }

    const hScale = THREE.MathUtils.clamp(shapeParams.height / 25, 0.35, 1.8);
    const { minY, rangeY, centerX, centerY, centerZ } = modelBoundsRef.current;
    const rootVertex = new THREE.Vector3();
    const localVertex = new THREE.Vector3();

    groupRef.current.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mesh = child as THREE.Mesh;

      if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences.fill(0);
      }

      if (mesh.geometry) {
        const snapshot = geometrySnapshotsRef.current.get(mesh.geometry);
        if (!snapshot) return;

        const pos = mesh.geometry.attributes.position;
        const arr = pos.array as Float32Array;
        const count = pos.count;
        const { rootPositions, rootToLocal } = snapshot;

        for (let i = 0; i < count; i++) {
          const ox = rootPositions[i * 3];
          const oy = rootPositions[i * 3 + 1];
          const oz = rootPositions[i * 3 + 2];

          const t = Math.max(0, Math.min(1, (oy - minY) / rangeY));
          const scaleXZ = getProfileScale(t, shapeParams);

          rootVertex.set(
            centerX + (ox - centerX) * scaleXZ,
            centerY + (oy - centerY) * hScale,
            centerZ + (oz - centerZ) * scaleXZ
          );
          localVertex.copy(rootVertex).applyMatrix4(rootToLocal);

          arr[i * 3] = localVertex.x;
          arr[i * 3 + 1] = localVertex.y;
          arr[i * 3 + 2] = localVertex.z;
        }

        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
      }

      if (mesh.material) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.copy(materialColor);
        mat.map = null;
        mat.roughness = finishProps.roughness;
        mat.metalness = finishProps.metalness;
        mat.needsUpdate = true;
      }
    });
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

export default function FreeformViewer({
  modelFile,
  shapeParams,
  materialParams,
  onMorphDetected,
  onControlsReady,
  preview = false,
}: {
  modelFile: string;
  shapeParams: ShapeParams;
  materialParams: MaterialParams;
  onMorphDetected: (has: boolean) => void;
  onControlsReady?: (controls: any, camera: THREE.Camera) => void;
  preview?: boolean;
}) {
  if (!modelFile) {
    return (
      <div className="freeform-viewer-inner" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" style={{ width: '64px', height: '64px' }}>
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Select a model to get started</p>
      </div>
    );
  }

  const errorFallback = (
    <div className="freeform-viewer-inner" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="1.5" style={{ width: '48px', height: '48px' }}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Failed to load model</p>
    </div>
  );

  const previewBackground = preview
    ? 'radial-gradient(ellipse 70% 55% at 50% 58%, rgba(255,252,248,0.9) 0%, transparent 70%), linear-gradient(175deg, var(--bg-tertiary) 0%, var(--bg-secondary) 55%, #E8E0D8 100%)'
    : 'transparent';

  return (
    <div
      className="freeform-viewer-inner"
      style={{
        width: '100%',
        height: preview ? '100%' : '100%',
        minHeight: preview ? 360 : undefined,
        position: 'relative',
        background: previewBackground,
        overflow: 'hidden',
      }}
    >
      <ModelErrorBoundary fallback={errorFallback}>
        <Canvas
          key={modelFile}
          camera={{ position: [3, 1.5, 5], fov: preview ? 42 : 45 }}
          gl={{ antialias: true, alpha: !preview, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
          style={{ width: '100%', height: '100%', display: 'block' }}
          dpr={[1, 2]}
        >
          {!preview && <color attach="background" args={['#F5F0EA']} />}

          <ambientLight intensity={preview ? 1 : 0.5} />
          <directionalLight position={[5, 10, 5]} intensity={preview ? 1.2 : 1.8} color="#FFF5EB" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <directionalLight position={[-4, 6, -3]} intensity={0.5} color="#FFE8D0" />
          <directionalLight position={[0, 3, -8]} intensity={0.3} color="#F0E0D0" />
          <spotLight position={[0, 10, 0]} intensity={1.0} angle={0.35} penumbra={0.8} color="#FFF8F0" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
          <spotLight position={[-5, 6, 5]} intensity={0.3} angle={0.5} penumbra={1} color="#FFE8D6" />

          <Suspense fallback={null}>
            <Scene
              key={modelFile}
              modelFile={modelFile}
              shapeParams={shapeParams}
              materialParams={materialParams}
              onMorphDetected={onMorphDetected}
              onControlsReady={preview ? undefined : onControlsReady}
              previewMode={preview}
            />

            {!preview && (
              <mesh rotation-x={-Math.PI / 2} position={[0, -0.51, 0]} receiveShadow>
                <circleGeometry args={[2.2, 64]} />
                <meshStandardMaterial color="#E8DDD0" roughness={0.95} metalness={0} transparent opacity={0.6} />
              </mesh>
            )}

            <ContactShadows
              position={[0, preview ? -0.35 : -0.5, 0]}
              opacity={preview ? 0.28 : 0.5}
              scale={preview ? 6 : 10}
              blur={preview ? 2.5 : 3}
              far={4}
              color="#3A2A1F"
            />
          </Suspense>

          <OrbitControls
            makeDefault
            target={[0, 0, 0]}
            enablePan={false}
            enableZoom={!preview}
            autoRotate={preview}
            autoRotateSpeed={preview ? 1.2 : 0}
          />
        </Canvas>
      </ModelErrorBoundary>
    </div>
  );
}
