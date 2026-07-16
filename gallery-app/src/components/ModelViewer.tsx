import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';

function FittedScene({ url, onCenter }: { url: string; onCenter: (c: THREE.Vector3) => void }) {
  const { scene } = useGLTF(url);
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [fitted, setFitted] = useState(false);
  const boxRef = useRef(new THREE.Box3());
  const sizeRef = useRef(new THREE.Vector3());
  const centerRef = useRef(new THREE.Vector3());

  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.computeVertexNormals();
      }
    });
  }, [scene]);

  useFrame(() => {
    if (groupRef.current && !fitted) {
      boxRef.current.setFromObject(groupRef.current);
      boxRef.current.getSize(sizeRef.current);
      boxRef.current.getCenter(centerRef.current);

      const maxDim = Math.max(sizeRef.current.x, sizeRef.current.y, sizeRef.current.z);
      const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
      const dist = (maxDim / (2 * Math.tan(fov / 2))) * 2;

      camera.position.set(
        centerRef.current.x + dist * 0.6,
        centerRef.current.y + dist * 0.4,
        centerRef.current.z + dist
      );
      (camera as THREE.PerspectiveCamera).near = 0.01;
      (camera as THREE.PerspectiveCamera).far = dist * 100;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      camera.lookAt(centerRef.current);
      onCenter(centerRef.current.clone());
      setFitted(true);
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

export default function ModelViewer({ url }: { url: string }) {
  const [target, setTarget] = useState(new THREE.Vector3(0, 0, 0));

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px', borderRadius: '12px', overflow: 'hidden', background: '#f5f0eb' }}>
      <Canvas
        camera={{ position: [3, 2, 5], fov: 45 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} />
        <directionalLight position={[-5, 5, -5]} intensity={0.8} />
        <directionalLight position={[0, -2, 5]} intensity={0.4} />
        <Environment preset="apartment" />

        <Suspense fallback={null}>
          <FittedScene url={url} onCenter={setTarget} />
        </Suspense>

        <OrbitControls
          target={[target.x, target.y, target.z]}
          enablePan={false}
          enableZoom={true}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
