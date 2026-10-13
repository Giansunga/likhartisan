import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
/* eslint-disable react-hooks/immutability -- R3F camera and cloned Three.js scene objects are intentionally configured in place. */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useMediaQuery } from '../hooks/useMediaQuery';
import NeutralStudioEnvironment from './freeform/NeutralStudioEnvironment';
import {
  MODEL_ROTATION_SPEED,
  createCycloramaGeometry,
  createStudioLightRig,
  createStudioLayout,
  createViewerFit,
  readStudioPreference,
  writeStudioPreference,
  type ViewerFit,
} from './modelViewerScene';

const CAMERA_FOV = 45;
const DEFAULT_FIT = createViewerFit(new THREE.Box3());

function ProductModel({
  url,
  rotate,
  shadowsEnabled,
  onFit,
}: {
  url: string;
  rotate: boolean;
  shadowsEnabled: boolean;
  onFit: (fit: ViewerFit) => void;
}) {
  const { scene } = useGLTF(url);
  const rotationRef = useRef<THREE.Group>(null);

  const productScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    return clone;
  }, [scene]);

  useEffect(() => {
    productScene.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = shadowsEnabled;
        child.receiveShadow = shadowsEnabled;
      }
    });
  }, [productScene, shadowsEnabled]);

  const fit = useMemo(() => {
    productScene.updateMatrixWorld(true);
    return createViewerFit(new THREE.Box3().setFromObject(productScene), CAMERA_FOV);
  }, [productScene]);

  useEffect(() => {
    onFit(fit);
  }, [fit, onFit]);

  useFrame((_, delta) => {
    if (rotate && rotationRef.current) {
      rotationRef.current.rotation.y += MODEL_ROTATION_SPEED * Math.min(delta, 0.1);
    }
  });

  return (
    <group ref={rotationRef} name="rotating-product">
      <group position={fit.translation}>
        <primitive object={productScene} />
      </group>
    </group>
  );
}

function CameraRig({ fit }: { fit: ViewerFit }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(fit.distance * 0.42, fit.target[1] + fit.distance * 0.28, fit.distance);
    camera.near = Math.max(fit.scale * 0.005, 0.001);
    camera.far = Math.max(fit.distance * 20, fit.scale * 12);
    camera.lookAt(...fit.target);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.updateProjectionMatrix();
    }
  }, [camera, fit]);

  return null;
}

function StudioCyclorama({ scale }: { scale: number }) {
  const layout = useMemo(() => createStudioLayout(scale), [scale]);
  const geometry = useMemo(() => createCycloramaGeometry(layout), [layout]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group name="product-studio-cyclorama">
      <mesh rotation-x={-Math.PI / 2} position-y={layout.floorY} receiveShadow={false}>
        <circleGeometry args={[layout.floorRadius, 128]} />
        <meshStandardMaterial color="#ededed" roughness={1} metalness={0} side={THREE.FrontSide} />
      </mesh>
      <mesh geometry={geometry} receiveShadow={false}>
        <meshStandardMaterial color="#ededed" roughness={1} metalness={0} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function StudioLighting({ fit, enabled }: { fit: ViewerFit; enabled: boolean }) {
  const scale = fit.scale;
  const rig = useMemo(() => createStudioLightRig(scale), [scale]);
  const areaLightRef = useRef<THREE.RectAreaLight>(null);

  useEffect(() => {
    const light = areaLightRef.current;
    if (light && typeof light.lookAt === 'function') {
      light.lookAt(...rig.target);
    }
  }, [rig]);

  return (
    <>
      <NeutralStudioEnvironment intensity={enabled ? 0.32 : 0.36} />
      <ambientLight intensity={enabled ? 0.2 : 0.24} color="#ffffff" />
      <rectAreaLight
        ref={areaLightRef}
        position={rig.areaPosition}
        width={rig.areaWidth}
        height={rig.areaHeight}
        intensity={rig.areaIntensity}
        color="#fffdf9"
      />
      <pointLight
        position={rig.pointPosition}
        intensity={rig.pointIntensity}
        distance={rig.pointDistance}
        decay={2}
        color="#ffffff"
      />
    </>
  );
}

export default function ModelViewer({ url }: { url: string }) {
  const [studioEnabled, setStudioEnabled] = useState(() => readStudioPreference(globalThis.localStorage));
  const [fit, setFit] = useState<ViewerFit>(DEFAULT_FIT);
  const [interacting, setInteracting] = useState(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const mobile = useMediaQuery('(max-width: 768px)');
  const handleFit = useCallback((nextFit: ViewerFit) => setFit(nextFit), []);

  const toggleStudio = () => {
    setStudioEnabled((current) => {
      const next = !current;
      writeStudioPreference(globalThis.localStorage, next);
      return next;
    });
  };

  return (
    <div className={`model-viewer-shell${studioEnabled ? ' model-viewer-shell--studio' : ''}`}>
      <button
        type="button"
        className="model-viewer-studio-toggle"
        aria-pressed={studioEnabled}
        aria-label={studioEnabled ? 'Disable studio background' : 'Enable studio background'}
        title={studioEnabled ? 'Use flat background' : 'Use studio background'}
        onClick={toggleStudio}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 17.5 12 21l8-3.5M4 12l8 3.5 8-3.5M12 3 4 6.5l8 3.5 8-3.5L12 3Z" />
        </svg>
        <span>Studio</span>
      </button>

      <Canvas
        key={url}
        camera={{ position: [3, 2, 5], fov: CAMERA_FOV }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
        shadows={false}
        dpr={mobile ? [1, 1.5] : [1, 2]}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={[studioEnabled ? '#ededed' : '#f5f0eb']} />
        <CameraRig fit={fit} />
        <StudioLighting fit={fit} enabled={studioEnabled} />

        {studioEnabled ? (
          <>
            <StudioCyclorama scale={fit.scale} />
          </>
        ) : null}

        <Suspense fallback={null}>
          <ProductModel
            url={url}
            rotate={!reduceMotion && !interacting}
            shadowsEnabled={false}
            onFit={handleFit}
          />
        </Suspense>

        <OrbitControls
          target={fit.target}
          enablePan={false}
          enableZoom
          enableRotate
          enableDamping
          autoRotate={false}
          minDistance={fit.minDistance}
          maxDistance={fit.maxDistance}
          minPolarAngle={0.01}
          maxPolarAngle={Math.PI - 0.01}
          onStart={() => setInteracting(true)}
          onEnd={() => setInteracting(false)}
        />
      </Canvas>
    </div>
  );
}
