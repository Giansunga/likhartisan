import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orbitControlsSpy = vi.fn();

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useFrame: vi.fn(),
  useThree: () => ({
    camera: {
      fov: 45,
      position: { set: vi.fn() },
      lookAt: vi.fn(),
      updateProjectionMatrix: vi.fn(),
    },
  }),
}));

vi.mock('@react-three/drei', () => ({
  Environment: () => null,
  OrbitControls: (props: Record<string, unknown>) => {
    orbitControlsSpy(props);
    return <div data-testid="orbit-controls" />;
  },
  useGLTF: () => ({
    scene: {
      traverse: vi.fn(),
    },
  }),
}));

import ModelViewer from '../ModelViewer';

describe('ModelViewer', () => {
  beforeEach(() => {
    orbitControlsSpy.mockClear();
  });

  it('gently auto-rotates while preserving shopper controls', () => {
    render(<ModelViewer url="/models/example.glb" />);

    expect(screen.getByTestId('orbit-controls')).toBeInTheDocument();
    expect(orbitControlsSpy).toHaveBeenCalledWith(expect.objectContaining({
      autoRotate: true,
      autoRotateSpeed: 1.2,
      enablePan: false,
      enableZoom: true,
    }));
  });
});
