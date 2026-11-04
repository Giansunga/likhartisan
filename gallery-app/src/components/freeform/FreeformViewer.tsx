import { Suspense, useRef, useMemo, useEffect, Component, type ReactNode, type RefObject } from 'react';
/* eslint-disable react-hooks/immutability -- R3F animation code intentionally mutates Three.js objects owned by the scene. */
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { PublicGLTFLoader } from '../../lib/publicModelLoader';
import ModelLoadSurface from '../ModelLoadSurface';
import * as THREE from 'three';
import { createPatternSvg, DEFAULT_DECORATION, type DecorationParams } from './decor';
import { getDecorationProjection } from './decorationProjection';
import { clonePatternGeometry, updateExteriorPatternMask } from './exteriorPatternMask';
import { type AttachmentPlacement, type AttachmentSelection, type GeneratedAttachmentSocket } from './attachments';
import {
  analyzeAttachmentSockets,
  attachmentPlacementKey,
  resolveAttachmentMount,
  resolveAttachmentPoint,
  prepareAttachmentSurface,
  getAttachmentSurfaceRevision,
  type AttachmentPlacementLimitMap,
} from './attachmentPlacement';
import { applyGeneratedAttachmentThickness, disposeGeneratedAttachment, getGeneratedAttachmentRecipe } from './generatedAttachmentCatalog';
import { applyFinishToMaterial, applyFinishToScene, disposeFinishedScene, ensurePhysicalMaterials, generateCylindricalUVs } from './finishMaterials';
import type { MaterialParams } from './materials';
import { inchesToCm } from '../../lib/measurements';
import NeutralStudioEnvironment from './NeutralStudioEnvironment';
import type { ShapeTargetProfile } from '../../lib/measurements';
import { getSectionAnchors, resolveShapeTargets } from './calibrateModel';
import { applyShapeGeometry, getShapeHeightScale, getShapeHeightPivot, getGeometrySnapshot, getBoundsFromSnapshots, cacheProfileCoefficients, type GeometrySnapshot, type ModelBounds, type ShapeParams } from './shapeGeometry';
import { attachmentDesignRevision, validateAttachmentDesign, type AttachmentAnalysis } from './attachmentValidation';
import { captureException } from '../../lib/sentry';

type OrbitControlsApi = { target?: THREE.Vector3; update?: () => void; reset?: () => void; saveState?: () => void };

class AttachmentErrorBoundary extends Component<{ children: ReactNode; onError?: () => void }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { captureException(error); this.props.onError?.(); }
  render() { return this.state.hasError ? null : this.props.children; }
}

function AttachmentModel({ attachment, placement, liveSocketsRef, baseScene, shapeKey, material, analysisRef, revision }: { attachment: AttachmentSelection; placement: AttachmentPlacement; liveSocketsRef: RefObject<GeneratedAttachmentSocket[]>; baseScene: THREE.Group; shapeKey: string; material: MaterialParams; analysisRef: RefObject<AttachmentAnalysis | null>; revision: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const placementKeyRef = useRef('');
  const recipe = getGeneratedAttachmentRecipe(attachment.recipeKey, attachment.recipeVersion);
  const attachmentScene = useMemo(() => recipe?.build() || new THREE.Group(), [recipe]);
  const materialFinish = material.finish;
  const materialColor = material.color;
  const thicknessMultiplier = placement.transform.thicknessMultiplier;

  useEffect(() => () => disposeGeneratedAttachment(attachmentScene), [attachmentScene]);

  useEffect(() => {
    applyGeneratedAttachmentThickness(attachmentScene, thicknessMultiplier);
  }, [attachmentScene, thicknessMultiplier]);

  useEffect(() => {
    applyFinishToScene(attachmentScene, { finish: materialFinish, color: materialColor });
  }, [attachmentScene, materialColor, materialFinish]);

  useFrame(() => {
    if (!groupRef.current) return;
    const surfaceRevision = getAttachmentSurfaceRevision(baseScene);
    const result = analysisRef.current?.placements[attachmentPlacementKey(attachment.id, placement.socket.id)];
    if (!surfaceRevision || !recipe || analysisRef.current?.status === 'error' || result?.status === 'invalid') {
      groupRef.current.visible = false;
      return;
    }
    const { socket: savedSocket } = placement;
    // Read-only request previews must use the same accepted fallback as the editor.
    const transform = result && analysisRef.current?.revision === revision ? result.transform : placement.transform;
    const currentSocket = liveSocketsRef.current?.find((candidate) => candidate.id === savedSocket.id);
    const socket = currentSocket ? { ...savedSocket, height: currentSocket.height, azimuth: currentSocket.azimuth } : savedSocket;
    const placementKey = `${surfaceRevision}|${shapeKey}|${socket.id}|${socket.height}|${socket.azimuth}|${transform.horizontalDegrees}|${transform.verticalRatio}|${transform.surfaceOffsetRatio}|${transform.twistDegrees}|${transform.scaleMultiplier}|${transform.thicknessMultiplier}|${recipe.key}|${recipe.version}`;
    if (placementKeyRef.current === placementKey && groupRef.current.visible) return;
    const mount = resolveAttachmentMount(baseScene, socket, recipe, transform);
    if (!mount) { groupRef.current.visible = false; return; }
    groupRef.current.visible = true;
    groupRef.current.position.copy(mount.position);
    groupRef.current.quaternion.copy(mount.quaternion);
    groupRef.current.scale.set(mount.scale, mount.verticalScale, mount.scale);
    placementKeyRef.current = placementKey;
  });

  return <group ref={groupRef} visible={false}><primitive object={attachmentScene} /></group>;
}

function AttachmentSocketMarker({ socket, baseScene, selected }: { socket: GeneratedAttachmentSocket; baseScene: THREE.Group; selected: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const resolvedKey = useRef('');
  useFrame(() => {
    if (!groupRef.current) return;
    const key = `${getAttachmentSurfaceRevision(baseScene)}|${socket.height}|${socket.azimuth}`;
    if (resolvedKey.current === key) return;
    const resolved = resolveAttachmentPoint(baseScene, socket.height, socket.azimuth);
    if (!resolved) { groupRef.current.visible = false; return; }
    groupRef.current.visible = true;
    groupRef.current.position.copy(resolved.position).addScaledVector(resolved.normal, resolved.maxDimension * 0.025);
    groupRef.current.scale.setScalar(Math.max(resolved.maxDimension * 0.025, 0.015));
    resolvedKey.current = key;
  });
  return <group ref={groupRef}>
    <mesh>
      <sphereGeometry args={[1, 18, 18]} />
      <meshStandardMaterial color={selected ? '#F59E0B' : '#9A4C10'} emissive={selected ? '#7C2D12' : '#311306'} emissiveIntensity={0.35} depthTest={false} />
    </mesh>
    <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
      <span className="freeform-attachment-socket-label" style={{ display: 'block', whiteSpace: 'nowrap', borderRadius: '999px', background: selected ? '#F59E0B' : '#fff', color: selected ? '#fff' : '#4B2E1F', padding: '3px 7px', fontSize: '10px', fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>{socket.name}</span>
    </Html>
  </group>;
}

export function FreeformScene({
  modelFile,
  shapeParams,
  materialParams,
  decorationParams = DEFAULT_DECORATION,
  attachmentParams = [],
  attachmentSockets = [],
  selectedSocketIds = [],
  onMorphDetected,
  modelId,
  onShapeTargets,
  onControlsReady,
  onAttachmentError,
  onSocketsChange,
  onAttachmentLimitsChange,
  pauseAttachmentAnalysis = false,
  onAttachmentAnalysis,
  analysisAttempt = 0,
  showAttachmentSockets = true,
  previewMode = false,
}: {
  modelFile: string;
  modelId?: string;
  onShapeTargets?: (profile: ShapeTargetProfile) => void;
  shapeParams: ShapeParams;
  materialParams: MaterialParams;
  decorationParams?: DecorationParams;
  attachmentParams?: AttachmentSelection[];
  attachmentSockets?: GeneratedAttachmentSocket[];
  selectedSocketIds?: string[];
  onMorphDetected: (has: boolean) => void;
  onControlsReady?: (controls: OrbitControlsApi | null, camera: THREE.Camera) => void;
  onAttachmentError?: (attachment: AttachmentSelection) => void;
  onSocketsChange?: (sockets: GeneratedAttachmentSocket[]) => void;
  onAttachmentLimitsChange?: (limits: AttachmentPlacementLimitMap) => void;
  pauseAttachmentAnalysis?: boolean;
  onAttachmentAnalysis?: (analysis: AttachmentAnalysis) => void;
  analysisAttempt?: number;
  showAttachmentSockets?: boolean;
  previewMode?: boolean;
}) {
  const gltf = useLoader(PublicGLTFLoader, modelFile);
  useEffect(() => {
    if (onShapeTargets) onShapeTargets(resolveShapeTargets(gltf.scene, modelId, modelFile));
  }, [gltf.scene, modelFile, modelId, onShapeTargets]);
  const { camera, controls, gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  const morphChecked = useRef(false);
  const analyzedShapeRef = useRef('');
  const analyzedPlacementRef = useRef('');
  const analysisRef = useRef<AttachmentAnalysis | null>(null);
  const acceptedShapeRef = useRef('');
  const liveSocketsRef = useRef<GeneratedAttachmentSocket[]>([]);
  const appliedShapeRef = useRef('');
  const preparedShapeRef = useRef('');
  const appliedAppearanceRef = useRef('');
  const geometrySnapshotsRef = useRef<Map<THREE.BufferGeometry, GeometrySnapshot>>(new Map());
  const modelBoundsRef = useRef<ModelBounds>({ minY: 0, rangeY: 1, centerX: 0, centerY: 0, centerZ: 0 });
  const sectionAnchorsRef = useRef({ body: 0.45, neck: 0.8, rim: 0.98 });

  // Keep the established Three.js geometry scale in centimeters while the
  // user-facing and persisted shape values are canonical inches.
  const geometryShapeParams = shapeParams.unit === 'in'
    ? {
      ...shapeParams,
      height: inchesToCm(shapeParams.height),
      bodyWidth: inchesToCm(shapeParams.bodyWidth),
      neckWidth: inchesToCm(shapeParams.neckWidth),
      rimSize: inchesToCm(shapeParams.rimSize),
    }
    : shapeParams;
  const designRevision = attachmentDesignRevision(modelFile, shapeParams, attachmentParams);

  const scene = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry = clonePatternGeometry(child.geometry);
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
    generateCylindricalUVs(clonedScene);

    return clonedScene;
  }, [gltf]);

  useEffect(() => () => disposeFinishedScene(scene), [scene]);

  const decorTexture = useMemo(() => {
    if (!decorationParams.patternId) return null;
    const patternColor = decorationParams.effect === 'engraved'
      ? new THREE.Color(decorationParams.color).multiplyScalar(0.55).getStyle()
      : decorationParams.color;
    const pixelScale = Math.min(8, gl.capabilities.maxTextureSize / 256);
    const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(createPatternSvg(decorationParams.patternId, patternColor, decorationParams.placement, 'transparent', pixelScale))}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
    return texture;
  }, [decorationParams.color, decorationParams.effect, decorationParams.patternId, decorationParams.placement, gl]);

  useEffect(() => () => decorTexture?.dispose(), [decorTexture]);

  // Prepare the shaped pot before attachment callbacks, including read-only
  // submitted designs that deliberately skip attachment analysis.
  useFrame(() => {
    if (!groupRef.current) return;

    if (!initialized.current) {
      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);

      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          const snapshot = getGeometrySnapshot(child, groupRef.current!);
          if (snapshot) geometrySnapshotsRef.current.set(child.geometry, snapshot);
        }
      });

      modelBoundsRef.current = getBoundsFromSnapshots(geometrySnapshotsRef.current.values());
      geometrySnapshotsRef.current.forEach((snapshot) => cacheProfileCoefficients(snapshot, modelBoundsRef.current));
      try { sectionAnchorsRef.current = getSectionAnchors(scene); } catch { /* Older meshes retain the established profile bands. */ }

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

      const orbitControls = controls as unknown as OrbitControlsApi | null;
      if (orbitControls?.target) {
        orbitControls.target.copy(target);
        orbitControls.update?.();
      }
      orbitControls?.saveState?.();

      initialized.current = true;
      onControlsReady?.(controls as unknown as OrbitControlsApi | null, camera);
    }

    if (!morphChecked.current) {
      let hasMorph = false;
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
          hasMorph = true;
        }
      });
      onMorphDetected(hasMorph);
      morphChecked.current = true;
    }

    const relativeBaseline = shapeParams.geometryMode === 'baseline' ? shapeParams.baseline : undefined;
    const shapeKey = `${geometryShapeParams.height}|${geometryShapeParams.bodyWidth}|${geometryShapeParams.neckWidth}|${geometryShapeParams.rimSize}|${geometryShapeParams.curvature}|${relativeBaseline ? Object.values(relativeBaseline).join('|') : 'legacy'}|${JSON.stringify(shapeParams.targetProfile)}`;
    const appearanceKey = `${materialParams.color}|${materialParams.finish}|${decorationParams.patternId}|${decorationParams.color}|${decorationParams.effect}|${decorationParams.placement}|${decorationParams.scale}|${decorTexture?.uuid || ''}`;
    const shapeChanged = appliedShapeRef.current !== shapeKey;
    const appearanceChanged = appliedAppearanceRef.current !== appearanceKey;
    const hScale = getShapeHeightScale(shapeParams);
    const { minY, rangeY } = modelBoundsRef.current;
    const centerY = getShapeHeightPivot(shapeParams, modelBoundsRef.current);
    const decorProjection = getDecorationProjection(
      { minY, rangeY, centerY },
      hScale,
      geometryShapeParams.bodyWidth,
      decorationParams.scale,
    );

    if (shapeChanged || appearanceChanged) scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mesh = child as THREE.Mesh;

      if (shapeChanged && mesh.geometry) {
        const snapshot = geometrySnapshotsRef.current.get(mesh.geometry);
        if (!snapshot) return;

        applyShapeGeometry(mesh.geometry, snapshot, modelBoundsRef.current, shapeParams, sectionAnchorsRef.current);
      }

      if ((appearanceChanged || shapeChanged) && mesh.material) {
        const materials = ensurePhysicalMaterials(mesh);
        materials.forEach((mat) => {
        if (appearanceChanged) applyFinishToMaterial(mat, materialParams);
        if ('decorOriginalSide' in mat.userData && mat.side !== mat.userData.decorOriginalSide) {
          mat.side = mat.userData.decorOriginalSide as THREE.Side;
          mat.needsUpdate = true;
        }
        // Project patterns from cylindrical object space rather than the model's UVs.
        // Uploaded pottery models often have inconsistent UV unwraps, which turns a
        // horizontal band into the diagonal streak shown in the editor.
        mat.userData.decorUniformValues = {
          map: decorTexture,
          enabled: decorTexture ? 1 : 0,
          repeat: decorProjection.repeat,
          minY: decorProjection.minY,
          height: decorProjection.height,
          engraved: decorationParams.effect === 'engraved' ? 1 : 0,
        };

        if (!mat.userData.decorShaderConfigured) {
          mat.onBeforeCompile = (shader) => {
            const values = mat.userData.decorUniformValues;
            shader.uniforms.decorMap = { value: values.map };
            shader.uniforms.decorEnabled = { value: values.enabled };
            shader.uniforms.decorRepeat = { value: values.repeat };
            shader.uniforms.decorMinY = { value: values.minY };
            shader.uniforms.decorHeight = { value: values.height };
            shader.uniforms.decorEngraved = { value: values.engraved };
            shader.vertexShader = `attribute float decorExterior;\nvarying float decorExteriorMask;\nvarying vec3 decorWorldPosition;\nvarying vec3 decorWorldNormal;\n${shader.vertexShader}`.replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\n  decorExteriorMask = decorExterior;\n  decorWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n  decorWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );'
            );
            shader.fragmentShader = `varying float decorExteriorMask;\nvarying vec3 decorWorldPosition;\nvarying vec3 decorWorldNormal;\nuniform sampler2D decorMap;\nuniform float decorEnabled;\nuniform float decorRepeat;\nuniform float decorMinY;\nuniform float decorHeight;\nuniform float decorEngraved;\n${shader.fragmentShader}`.replace(
              '#include <color_fragment>',
              `#include <color_fragment>
              float decorV = clamp( 1.0 - ( decorWorldPosition.y - decorMinY ) / max( decorHeight, 0.0001 ), 0.0, 1.0 );
              if ( decorEnabled > 0.5 && decorExteriorMask > 0.5 && decorV >= 0.03 && decorV <= 0.97 ) {
                float decorU = atan( decorWorldPosition.z, decorWorldPosition.x ) / 6.28318530718 + 0.5;
                vec4 decorSample = texture2D( decorMap, vec2( decorU * decorRepeat, decorV ) );
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
          shader.uniforms.decorRepeat.value = decorProjection.repeat;
          shader.uniforms.decorMinY.value = decorProjection.minY;
          shader.uniforms.decorHeight.value = decorProjection.height;
          shader.uniforms.decorEngraved.value = decorationParams.effect === 'engraved' ? 1 : 0;
        }
        });
      }
    });

    if (shapeChanged) {
      // Shape controls scale each horizontal section radially by a positive
      // factor, preserving which surface is first along every horizontal ray.
      updateExteriorPatternMask(scene, Boolean(appliedShapeRef.current));
      if (attachmentParams.length && pauseAttachmentAnalysis) {
        prepareAttachmentSurface(scene);
        preparedShapeRef.current = shapeKey;
      }
      appliedShapeRef.current = shapeKey;
    }
    if (appearanceChanged) appliedAppearanceRef.current = appearanceKey;

    const revision = designRevision;
    const needsSockets = Boolean(attachmentParams.length || onSocketsChange || onAttachmentLimitsChange);
    const analysisKey = `${revision}|${analysisAttempt}|${needsSockets}`;
    if (!pauseAttachmentAnalysis && analyzedPlacementRef.current !== analysisKey
      && (attachmentParams.length || onAttachmentAnalysis || onSocketsChange || onAttachmentLimitsChange)) {
      analyzedPlacementRef.current = analysisKey;
      try {
        if (needsSockets && preparedShapeRef.current !== shapeKey) {
          prepareAttachmentSurface(scene);
          preparedShapeRef.current = shapeKey;
        }
        if (needsSockets && analyzedShapeRef.current !== shapeKey) {
          liveSocketsRef.current = analyzeAttachmentSockets(scene);
          analyzedShapeRef.current = shapeKey;
        }
        const previous = acceptedShapeRef.current === shapeKey ? analysisRef.current?.attachments : undefined;
        const analysis = validateAttachmentDesign(scene, liveSocketsRef.current, attachmentParams, revision, previous);
        analysisRef.current = analysis;
        acceptedShapeRef.current = shapeKey;
        onSocketsChange?.(analysis.sockets);
        onAttachmentLimitsChange?.(analysis.limits);
        onAttachmentAnalysis?.(analysis);
      } catch (error) {
        captureException(error);
        const analysis: AttachmentAnalysis = { revision, status: 'error', sockets: [], attachments: attachmentParams,
          placements: {}, limits: {}, message: 'Attachment analysis failed. Your selections are retained. Please retry.' };
        analysisRef.current = analysis;
        onAttachmentAnalysis?.(analysis);
      }
    }

  }, -1);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
      {showAttachmentSockets && attachmentSockets.map((socket) => <AttachmentSocketMarker key={socket.id} socket={socket} baseScene={scene} selected={selectedSocketIds.includes(socket.id)} />)}
      {attachmentParams.flatMap((attachment) => attachment.placements.map((placement) => (
          <AttachmentErrorBoundary key={`${attachment.recipeKey}-${attachment.recipeVersion}-${placement.socket.id}`} onError={() => onAttachmentError?.(attachment)}>
          <AttachmentModel attachment={attachment} placement={placement} liveSocketsRef={liveSocketsRef} material={materialParams} baseScene={scene} analysisRef={analysisRef} revision={designRevision} shapeKey={`${geometryShapeParams.height}|${geometryShapeParams.bodyWidth}|${geometryShapeParams.neckWidth}|${geometryShapeParams.rimSize}|${geometryShapeParams.curvature}|${shapeParams.geometryMode || ''}|${Object.values(shapeParams.baseline || {}).join('|')}`} />
        </AttachmentErrorBoundary>
      )))}
    </group>
  );
}


export default function FreeformViewer({
  modelFile,
  fallbackSrc,
  fallbackAlt,
  shapeParams,
  materialParams,
  decorationParams = DEFAULT_DECORATION,
  attachmentParams = [],
  attachmentSockets = [],
  selectedSocketIds = [],
  onMorphDetected,
  modelId,
  onShapeTargets,
  onControlsReady,
  onAttachmentError,
  onSocketsChange,
  onAttachmentLimitsChange,
  pauseAttachmentAnalysis = false,
  onAttachmentAnalysis,
  analysisAttempt = 0,
  showAttachmentSockets = true,
  preview = false,
}: {
  modelFile: string;
  modelId?: string;
  onShapeTargets?: (profile: ShapeTargetProfile) => void;
  fallbackSrc?: string;
  fallbackAlt?: string;
  shapeParams: ShapeParams;
  materialParams: MaterialParams;
  decorationParams?: DecorationParams;
  attachmentParams?: AttachmentSelection[];
  attachmentSockets?: GeneratedAttachmentSocket[];
  selectedSocketIds?: string[];
  onMorphDetected: (has: boolean) => void;
  onControlsReady?: (controls: OrbitControlsApi | null, camera: THREE.Camera) => void;
  onAttachmentError?: (attachment: AttachmentSelection) => void;
  onSocketsChange?: (sockets: GeneratedAttachmentSocket[]) => void;
  onAttachmentLimitsChange?: (limits: AttachmentPlacementLimitMap) => void;
  pauseAttachmentAnalysis?: boolean;
  onAttachmentAnalysis?: (analysis: AttachmentAnalysis) => void;
  analysisAttempt?: number;
  showAttachmentSockets?: boolean;
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

  const previewBackground = preview
    ? 'radial-gradient(ellipse 70% 55% at 50% 58%, rgba(255,252,248,0.9) 0%, transparent 70%), linear-gradient(175deg, var(--bg-tertiary) 0%, var(--bg-secondary) 55%, #E8E0D8 100%)'
    : 'transparent';
  const renderDpr: [number, number] = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1100px)').matches
    ? [1, 1.5]
    : [1, 2];

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
      <ModelLoadSurface source={modelFile} fallbackSrc={fallbackSrc} fallbackAlt={fallbackAlt} showFallbackImage={false}>
        <Canvas
          key={modelFile}
          camera={{ position: [3, 1.5, 5], fov: preview ? 40 : 45 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
          style={{ width: '100%', height: '100%', display: 'block', position: 'relative', zIndex: 1 }}
          dpr={renderDpr}
        >

          <NeutralStudioEnvironment intensity={preview ? 0.95 : 0.82} />
          <ambientLight intensity={preview ? 0.65 : 0.45} color="#FFFFFF" />
          <directionalLight position={[5, 10, 5]} intensity={preview ? 1.15 : 1.35} color="#FFFFFF" />
          <directionalLight position={[-4, 6, -3]} intensity={0.42} color="#F2F6FF" />
          <directionalLight position={[0, 3, -8]} intensity={0.22} color="#FFFFFF" />
          <spotLight position={[0, 10, 0]} intensity={0.55} angle={0.35} penumbra={0.8} color="#FFFFFF" />

          <Suspense fallback={null}>
            <FreeformScene
              key={modelFile}
              modelFile={modelFile}
              modelId={modelId}
              onShapeTargets={onShapeTargets}
              shapeParams={shapeParams}
              materialParams={materialParams}
              decorationParams={decorationParams}
              attachmentParams={attachmentParams}
              attachmentSockets={attachmentSockets}
              selectedSocketIds={selectedSocketIds}
              onMorphDetected={onMorphDetected}
              onControlsReady={preview ? undefined : onControlsReady}
              onAttachmentError={onAttachmentError}
              onSocketsChange={onSocketsChange}
              onAttachmentLimitsChange={onAttachmentLimitsChange}
              pauseAttachmentAnalysis={pauseAttachmentAnalysis}
              onAttachmentAnalysis={onAttachmentAnalysis}
              analysisAttempt={analysisAttempt}
              showAttachmentSockets={showAttachmentSockets}
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
      </ModelLoadSurface>
    </div>
  );
}
