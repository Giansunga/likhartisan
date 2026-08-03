import { Suspense, useRef, useMemo, Component, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { createPatternSvg, DEFAULT_DECORATION, type DecorationParams } from './decor';
import { type AttachmentParams } from './attachments';

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
  // How much each control deviates from its default (0 at default, range -1 to +1)
  const bodyDelta = normalizeParam(shapeParams.bodyWidth, 20);
  const neckDelta = normalizeParam(shapeParams.neckWidth, 15);
  const rimDelta = normalizeParam(shapeParams.rimSize, 12);
  const curvature = normalizeParam(shapeParams.curvature, 50);

  // Region influence weights (how much each region affects this height t)
  const baseInfluence = 1 - smoothstep(0.06, 0.3, t);
  const bodyInfluence = smoothstep(0.1, 0.35, t) * (1 - smoothstep(0.55, 0.75, t));
  const shoulderInfluence = smoothstep(0.5, 0.7, t) * (1 - smoothstep(0.7, 0.88, t));
  const neckInfluence = smoothstep(0.6, 0.8, t) * (1 - smoothstep(0.85, 0.96, t));
  const rimInfluence = smoothstep(0.82, 1.0, t);

  // Each region contributes a scale offset proportional to its control's deviation
  const strength = 0.45;
  let scaleOffset = 0;
  scaleOffset += baseInfluence * bodyDelta * strength * 0.7;
  scaleOffset += bodyInfluence * bodyDelta * strength;
  scaleOffset += shoulderInfluence * ((bodyDelta + neckDelta) / 2) * strength;
  scaleOffset += neckInfluence * neckDelta * strength;
  scaleOffset += rimInfluence * rimDelta * strength;

  // Curvature adds a belly bulge
  const bellyCurve = Math.sin(t * Math.PI) * 0.16 * curvature;
  const shoulderCurve = shoulderInfluence * -0.08 * curvature;

  return THREE.MathUtils.clamp(1 + scaleOffset + bellyCurve + shoulderCurve, 0.25, 1.8);
}

function AttachmentModel({ attachment, baseScene, materialParams }: { attachment: AttachmentParams; baseScene: THREE.Group; materialParams: MaterialParams }) {
  const gltf = useLoader(GLTFLoader, attachment.fileUrl);
  const groupRef = useRef<THREE.Group>(null);
  const attachmentScene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry = child.geometry.clone();
        child.material = Array.isArray(child.material) ? child.material.map((material) => material.clone()) : child.material.clone();
      }
    });
    return clone;
  }, [gltf]);
  const color = useMemo(() => new THREE.Color(materialParams.color), [materialParams.color]);
  const finish = FINISH_PROPS[materialParams.finish] || FINISH_PROPS.raw_clay;

  useFrame(() => {
    if (!groupRef.current) return;
    const box = new THREE.Box3().setFromObject(baseScene);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const sideVectors: Record<AttachmentParams['anchorSide'], THREE.Vector3> = {
      front: new THREE.Vector3(0, 0, 1), back: new THREE.Vector3(0, 0, -1), left: new THREE.Vector3(-1, 0, 0), right: new THREE.Vector3(1, 0, 0), top: new THREE.Vector3(0, 1, 0), bottom: new THREE.Vector3(0, -1, 0),
    };
    const vector = sideVectors[attachment.anchorSide] || sideVectors.right;
    const radialSize = Math.max(size.x, size.z) / 2;
    groupRef.current.position.set(
      center.x + vector.x * radialSize,
      attachment.anchorSide === 'top' ? box.max.y : attachment.anchorSide === 'bottom' ? box.min.y : box.min.y + size.y * attachment.anchorHeight,
      center.z + vector.z * radialSize,
    );
    groupRef.current.rotation.set(0, Math.atan2(vector.x, vector.z) + THREE.MathUtils.degToRad(attachment.rotation), 0);
    const modelScale = Math.max(size.x, size.y, size.z) / 22;
    groupRef.current.scale.setScalar(modelScale * attachment.scale);
    groupRef.current.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return;
        material.color.copy(color);
        material.roughness = finish.roughness;
        material.metalness = finish.metalness;
      });
    });
  });

  return <group ref={groupRef}><primitive object={attachmentScene} /></group>;
}

function Scene({
  modelFile,
  shapeParams,
  materialParams,
  decorationParams = DEFAULT_DECORATION,
  attachmentParams = [],
  onMorphDetected,
  onControlsReady,
  previewMode = false,
}: {
  modelFile: string;
  shapeParams: ShapeParams;
  materialParams: MaterialParams;
  decorationParams?: DecorationParams;
  attachmentParams?: AttachmentParams[];
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
  const decorTexture = useMemo(() => {
    if (!decorationParams.patternId) return null;
    const patternColor = decorationParams.effect === 'engraved'
      ? new THREE.Color(decorationParams.color).multiplyScalar(0.55).getStyle()
      : decorationParams.color;
    const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(createPatternSvg(decorationParams.patternId, patternColor, decorationParams.placement))}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }, [decorationParams.color, decorationParams.effect, decorationParams.patternId, decorationParams.placement]);

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
      const distMult = previewMode ? 2.2 : 1.9;
      const dist = (maxDim / (2 * Math.tan(fov / 2))) * distMult;
      const target = new THREE.Vector3(0, 0, 0);

      camera.position.set(
        target.x + dist * (previewMode ? 0.25 : 0.45),
        target.y + dist * (previewMode ? 0.15 : 0.22),
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
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        mat.color.copy(materialColor);
        if ('decorOriginalSide' in mat.userData && mat.side !== mat.userData.decorOriginalSide) {
          mat.side = mat.userData.decorOriginalSide as THREE.Side;
          mat.needsUpdate = true;
        }
        if (mat.map) {
          mat.map = null;
          mat.needsUpdate = true;
        }
        mat.roughness = finishProps.roughness;
        mat.metalness = finishProps.metalness;

        // Project patterns from cylindrical object space rather than the model's UVs.
        // Uploaded pottery models often have inconsistent UV unwraps, which turns a
        // horizontal band into the diagonal streak shown in the editor.
        if (!mat.userData.decorShaderConfigured) {
          mat.onBeforeCompile = (shader) => {
            shader.uniforms.decorMap = { value: null };
            shader.uniforms.decorEnabled = { value: 0 };
            shader.uniforms.decorRepeat = { value: 4 };
            shader.uniforms.decorMinY = { value: 0 };
            shader.uniforms.decorHeight = { value: 1 };
            shader.uniforms.decorEngraved = { value: 0 };
            shader.vertexShader = `varying vec3 decorWorldPosition;\nvarying vec3 decorWorldNormal;\n${shader.vertexShader}`.replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\n  decorWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n  decorWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );'
            );
            shader.fragmentShader = `varying vec3 decorWorldPosition;\nvarying vec3 decorWorldNormal;\nuniform sampler2D decorMap;\nuniform float decorEnabled;\nuniform float decorRepeat;\nuniform float decorMinY;\nuniform float decorHeight;\nuniform float decorEngraved;\n${shader.fragmentShader}`.replace(
              '#include <color_fragment>',
              `#include <color_fragment>
              vec2 decorRadialDirection = normalize( decorWorldPosition.xz );
              float decorOutwardness = dot( normalize( decorWorldNormal.xz ), decorRadialDirection );
              float decorV = clamp( 1.0 - ( decorWorldPosition.y - decorMinY ) / max( decorHeight, 0.0001 ), 0.0, 1.0 );
              if ( decorEnabled > 0.5 && decorOutwardness > 0.12 && decorV >= 0.03 ) {
                float decorU = atan( decorWorldPosition.z, decorWorldPosition.x ) / 6.28318530718 + 0.5;
                vec4 decorSample = texture2D( decorMap, vec2( fract( decorU * decorRepeat ), decorV ) );
                vec3 decorColor = decorSample.rgb;
                if ( decorEngraved > 0.5 ) decorColor = mix( diffuseColor.rgb * 0.42, decorColor, 0.18 );
                diffuseColor.rgb = mix( diffuseColor.rgb, decorColor, decorSample.a );
              }`
            );
            mat.userData.decorShader = shader;
          };
          mat.userData.decorShaderConfigured = true;
          mat.needsUpdate = true;
        }

        if (mat.userData.decorShader) {
          const shader = mat.userData.decorShader;
          shader.uniforms.decorMap.value = decorTexture;
          shader.uniforms.decorEnabled.value = decorTexture ? 1 : 0;
          shader.uniforms.decorRepeat.value = 4 / decorationParams.scale;
          shader.uniforms.decorMinY.value = minY;
          shader.uniforms.decorHeight.value = rangeY;
          shader.uniforms.decorEngraved.value = decorationParams.effect === 'engraved' ? 1 : 0;
        }
        });
      }
    });
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
      {attachmentParams.map((attachment) => <AttachmentModel key={attachment.id} attachment={attachment} baseScene={scene} materialParams={materialParams} />)}
    </group>
  );
}


export default function FreeformViewer({
  modelFile,
  shapeParams,
  materialParams,
  decorationParams = DEFAULT_DECORATION,
  attachmentParams = [],
  onMorphDetected,
  onControlsReady,
  preview = false,
}: {
  modelFile: string;
  shapeParams: ShapeParams;
  materialParams: MaterialParams;
  decorationParams?: DecorationParams;
  attachmentParams?: AttachmentParams[];
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
        background: preview ? previewBackground : '#F5F0EA',
        overflow: 'hidden',
      }}
    >
      {!preview && (
        <div
          style={{
            position: 'absolute',
            bottom: '8%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '45%',
            height: '18%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(180,168,152,0.35) 0%, rgba(180,168,152,0.12) 40%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}
      <ModelErrorBoundary fallback={errorFallback}>
        <Canvas
          key={modelFile}
          camera={{ position: [3, 1.5, 5], fov: preview ? 40 : 45 }}
          gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
          style={{ width: '100%', height: '100%', display: 'block', position: 'relative', zIndex: 1 }}
          dpr={[1, 2]}
        >

          <ambientLight intensity={preview ? 1 : 0.5} />
          <directionalLight position={[5, 10, 5]} intensity={preview ? 1.2 : 1.8} color="#FFF5EB" />
          <directionalLight position={[-4, 6, -3]} intensity={0.5} color="#FFE8D0" />
          <directionalLight position={[0, 3, -8]} intensity={0.3} color="#F0E0D0" />
          <spotLight position={[0, 10, 0]} intensity={1.0} angle={0.35} penumbra={0.8} color="#FFF8F0" />
          <spotLight position={[-5, 6, 5]} intensity={0.3} angle={0.5} penumbra={1} color="#FFE8D6" />

          <Suspense fallback={null}>
            <Scene
              key={modelFile}
              modelFile={modelFile}
              shapeParams={shapeParams}
              materialParams={materialParams}
              decorationParams={decorationParams}
              attachmentParams={attachmentParams}
              onMorphDetected={onMorphDetected}
              onControlsReady={preview ? undefined : onControlsReady}
              previewMode={preview}
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
