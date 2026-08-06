import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { toast } from 'sonner';
import { exportSceneToGLB, downloadGLB } from '../../services/exportService';

type ShapeParams = { height: number; bodyWidth: number; neckWidth: number; rimSize: number; curvature: number };
type MaterialParams = { finish: string; color: string };

const FINISH_PROPS: Record<string, { roughness: number; metalness: number }> = {
  raw_clay: { roughness: 0.9, metalness: 0.0 },
  matte: { roughness: 0.7, metalness: 0.0 },
  ceramic: { roughness: 0.4, metalness: 0.1 },
  glazed: { roughness: 0.15, metalness: 0.2 },
  metallic: { roughness: 0.3, metalness: 0.8 },
  acrylic_paint: { roughness: 0.45, metalness: 0.0 },
  water_paint: { roughness: 0.62, metalness: 0.0 },
};

const liveScenes = new Map<string, THREE.Group>();

function PreviewScene({
  modelFile,
  materialParams,
}: {
  modelFile: string;
  shapeParams: ShapeParams;
  materialParams: MaterialParams;
}) {
  const gltf = useLoader(GLTFLoader, modelFile);
  const groupRef = useRef<THREE.Group>(null);
  const initialized = useRef(false);

  const materialColor = useMemo(() => new THREE.Color(materialParams.color), [materialParams.color]);
  const finish = FINISH_PROPS[materialParams.finish] || FINISH_PROPS.raw_clay;

  useEffect(() => {
    if (groupRef.current) {
      liveScenes.set(modelFile, groupRef.current);
    }
    return () => { liveScenes.delete(modelFile); };
  }, [modelFile]);

  const clone = useMemo(() => {
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

  useFrame(() => {
    if (!groupRef.current) return;
    if (!initialized.current) {
      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const box = new THREE.Box3().setFromObject(groupRef.current!);
          const size = new THREE.Vector3();
          box.getSize(size);
        }
      });
      initialized.current = true;
    }

    groupRef.current.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        mat.color.copy(materialColor);
        mat.roughness = finish.roughness;
        mat.metalness = finish.metalness;
        if (mat.map) { mat.map = null; mat.needsUpdate = true; }
        mat.needsUpdate = true;
      });
    });
  });

  return (
    <group ref={groupRef}>
      <primitive object={clone} />
    </group>
  );
}

export { liveScenes };

export default function PreviewModal({
  open,
  onClose,
  modelFile,
  modelName,
  shapeParams,
  materialParams,
  onSaveDesign,
}: {
  open: boolean;
  onClose: () => void;
  modelFile: string;
  modelName: string;
  shapeParams: ShapeParams;
  materialParams: MaterialParams;
  onSaveDesign: () => void;
}) {
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || !modelFile) return null;

  async function handleExportGLB() {
    const group = liveScenes.get(modelFile);
    if (!group) {
      toast.error('Scene not ready. Please wait and try again.');
      return;
    }
    setExporting(true);
    try {
      const buffer = await exportSceneToGLB(group, shapeParams, materialParams);
      if (!buffer) {
        toast.error('Export failed. Please try again.');
        return;
      }
      const filename = (modelName || 'likhartisan-design').replace(/\s+/g, '-').toLowerCase();
      downloadGLB(buffer, filename);
      toast.success('GLB file downloaded.');
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  function handleCaptureScreenshot() {
    const canvas = document.querySelector('.preview-viewer canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `likhartisan-preview-${Date.now()}.png`;
    link.href = url;
    link.click();
  }

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-header">
          <div>
            <h2 className="preview-title">{modelName || 'Your Design'}</h2>
            <span className="preview-subtitle">Preview &amp; Download</span>
          </div>
          <button onClick={onClose} className="preview-close-btn" aria-label="Close preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '20px', height: '20px' }}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="preview-viewer">
          <Canvas
            key={modelFile}
            camera={{ position: [3, 1.5, 5], fov: 40 }}
            gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
            style={{ width: '100%', height: '100%', display: 'block' }}
            dpr={[1, 2]}
          >
            <ambientLight intensity={1.2} />
            <directionalLight position={[5, 10, 5]} intensity={1.4} color="#FFF5EB" />
            <directionalLight position={[-4, 6, -3]} intensity={0.6} color="#FFE8D0" />
            <spotLight position={[0, 10, 0]} intensity={1.2} angle={0.35} penumbra={0.8} color="#FFF8F0" />
            <Suspense fallback={null}>
              <PreviewScene modelFile={modelFile} shapeParams={shapeParams} materialParams={materialParams} />
            </Suspense>
            <OrbitControls
              makeDefault
              target={[0, 0, 0]}
              enablePan={false}
              enableZoom={false}
              autoRotate
              autoRotateSpeed={1.5}
            />
          </Canvas>
        </div>

        <div className="preview-actions">
          <button onClick={handleCaptureScreenshot} className="preview-action-btn preview-action-secondary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: '18px', height: '18px' }}>
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a5 5 0 100-10 5 5 0 000 10z" />
            </svg>
            Save PNG
          </button>
          <button onClick={handleExportGLB} disabled={exporting} className="preview-action-btn preview-action-secondary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: '18px', height: '18px' }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            {exporting ? 'Exporting...' : 'Download GLB'}
          </button>
          <button onClick={onSaveDesign} className="preview-action-btn preview-action-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: '18px', height: '18px' }}>
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
            </svg>
            Save to Cloud
          </button>
        </div>
      </div>
    </div>
  );
}