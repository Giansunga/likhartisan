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
  onFit,
}: {
  url: string;
  rotate: boolean;
  onFit: (fit: ViewerFit) => void;
}) {
  const { scene } = useGLTF(url);
  const rotationRef = useRef<THREE.Group>(null);

  const productScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

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
      <mesh rotation-x={-Math.PI / 2} position-y={layout.floorY} receiveShadow>
        <circleGeometry args={[layout.floorRadius, 128]} />
        <meshStandardMaterial color="#ededed" roughness={1} metalness={0} side={THREE.FrontSide} />
      </mesh>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color="#ededed" roughness={1} metalness={0} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function createSoftShadowTexture(size = 96): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const normalizedX = (x / (size - 1) - 0.5) * 2;
      const normalizedY = (y / (size - 1) - 0.5) * 2;
      const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
      const alpha = Math.round(255 * Math.pow(Math.max(0, 1 - distance), 2.15));
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function SoftGroundShadow({ fit }: { fit: ViewerFit }) {
  const texture = useMemo(() => createSoftShadowTexture(), []);
  const floorY = createStudioLayout(fit.scale).floorY;
  const width = Math.max(fit.footprint[0] * 1.65, fit.scale * 0.55);
  const depth = Math.max(fit.footprint[1] * 1.2, fit.scale * 0.32);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh
      name="product-soft-shadow"
      position={[fit.footprint[0] * 0.24, floorY + fit.scale * 0.0015, 0]}
      rotation={[-Math.PI / 2, 0, -0.1]}
      scale={[width, depth, 1]}
      renderOrder={1}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        color="#3b3430"
        opacity={0.44}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function StudioLighting({ fit, enabled, mobile }: { fit: ViewerFit; enabled: boolean; mobile: boolean }) {
  const scale = fit.scale;
  const shadowMapSize = mobile ? 512 : 1024;
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
      <NeutralStudioEnvironment intensity={enabled ? 0.3 : 0.4} />
      <ambientLight intensity={enabled ? 0.16 : 0.28} color="#ffffff" />
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
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={scale * 0.1}
        shadow-camera-far={scale * 12}
        shadow-radius={4}
        shadow-bias={-0.00015}
        shadow-normalBias={scale * 0.001}
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
        shadows="percentage"
        dpr={mobile ? [1, 1.5] : [1, 2]}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={[studioEnabled ? '#ededed' : '#f5f0eb']} />
        <CameraRig fit={fit} />
        <StudioLighting fit={fit} enabled={studioEnabled} mobile={mobile} />

        {studioEnabled ? (
          <>
            <StudioCyclorama scale={fit.scale} />
            <SoftGroundShadow fit={fit} />
          </>
        ) : null}

        <Suspense fallback={null}>
          <ProductModel
            url={url}
            rotate={!reduceMotion && !interacting}
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
