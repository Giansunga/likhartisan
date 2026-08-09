import { useEffect } from 'react';
/* eslint-disable react-hooks/immutability -- R3F environment setup intentionally mutates the Three.js scene owned by the canvas. */
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export default function NeutralStudioEnvironment({ intensity = 0.85 }: { intensity?: number }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const environment = generator.fromScene(new RoomEnvironment(), 0.04).texture;
    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = environment;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = previousEnvironment;
      scene.environmentIntensity = previousIntensity;
      environment.dispose();
      generator.dispose();
    };
  }, [gl, intensity, scene]);

  return null;
}
