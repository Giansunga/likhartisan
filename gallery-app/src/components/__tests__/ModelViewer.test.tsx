import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODEL_VIEWER_STUDIO_STORAGE_KEY, MODEL_ROTATION_SPEED } from '../modelViewerScene';

const orbitControlsSpy = vi.fn();
const frameCallbacks: Array<(state: unknown, delta: number) => void> = [];
let reducedMotion = false;

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div data-testid="canvas">{children}</div>,
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    frameCallbacks.push(callback);
  },
  useThree: () => ({
    camera: {
      fov: 45,
      position: { set: vi.fn() },
      lookAt: vi.fn(),
      updateProjectionMatrix: vi.fn(),
    },
  }),
}));

vi.mock('@react-three/drei', async () => {
  const THREE = await import('three');
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));

  return {
    OrbitControls: (props: Record<string, unknown>) => {
      orbitControlsSpy(props);
      return <div data-testid="orbit-controls" />;
    },
    useGLTF: () => ({ scene }),
  };
});

vi.mock('../freeform/NeutralStudioEnvironment', () => ({
  default: () => null,
}));

import ModelViewer from '../ModelViewer';

describe('ModelViewer', () => {
  beforeEach(() => {
    localStorage.clear();
    orbitControlsSpy.mockClear();
    frameCallbacks.length = 0;
    reducedMotion = false;
  });

  it('shows the studio by default and persists the accessible toggle', () => {
    const { container } = render(<ModelViewer url="/models/example.glb" />);
    const toggle = screen.getByRole('button', { name: 'Disable studio background' });

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[name="product-studio-cyclorama"]')).toBeInTheDocument();
    expect(container.querySelector('[name="product-soft-shadow"]')).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Enable studio background' })).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('[name="product-studio-cyclorama"]')).not.toBeInTheDocument();
    expect(container.querySelector('[name="product-soft-shadow"]')).not.toBeInTheDocument();
    expect(localStorage.getItem(MODEL_VIEWER_STUDIO_STORAGE_KEY)).toBe('off');
  });

  it('restores a stored flat-background preference', () => {
    localStorage.setItem(MODEL_VIEWER_STUDIO_STORAGE_KEY, 'off');
    const { container } = render(<ModelViewer url="/models/example.glb" />);

    expect(screen.getByRole('button', { name: 'Enable studio background' })).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('[name="product-studio-cyclorama"]')).not.toBeInTheDocument();
  });

  it('keeps shopper controls constrained and disables camera auto-rotation', () => {
    render(<ModelViewer url="/models/example.glb" />);

    expect(screen.getByTestId('orbit-controls')).toBeInTheDocument();
    expect(orbitControlsSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      autoRotate: false,
      enablePan: false,
      enableZoom: true,
      enableRotate: true,
      minPolarAngle: 0.01,
      maxPolarAngle: Math.PI - 0.01,
      onStart: expect.any(Function),
      onEnd: expect.any(Function),
    }));
    expect(orbitControlsSpy.mock.lastCall?.[0]).not.toHaveProperty('minAzimuthAngle');
    expect(orbitControlsSpy.mock.lastCall?.[0]).not.toHaveProperty('maxAzimuthAngle');
  });

  it('rotates only the product and honors reduced motion', () => {
    const firstRender = render(<ModelViewer url="/models/example.glb" />);
    const rotatingProduct = firstRender.container.querySelector('[name="rotating-product"]') as HTMLElement & { rotation: { y: number } };
    rotatingProduct.rotation = { y: 0 };

    act(() => frameCallbacks.at(-1)?.({}, 1));
    expect(rotatingProduct.rotation.y).toBeCloseTo(MODEL_ROTATION_SPEED * 0.1);

    firstRender.unmount();
    frameCallbacks.length = 0;
    reducedMotion = true;
    const reducedRender = render(<ModelViewer url="/models/reduced.glb" />);
    const reducedProduct = reducedRender.container.querySelector('[name="rotating-product"]') as HTMLElement & { rotation: { y: number } };
    reducedProduct.rotation = { y: 0 };

    act(() => frameCallbacks.at(-1)?.({}, 1));
    expect(reducedProduct.rotation.y).toBe(0);
  });
});
