import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { updateModelState } from '../../lib/publicModelLoader';
import ModelLoadSurface from '../ModelLoadSurface';

const clear = vi.hoisted(() => vi.fn());
vi.mock('@react-three/fiber', () => ({ useLoader: { clear } }));

it('uses the centered circle and percentage instead of a loading card or bar', () => {
  const source = '/media/r2/models/progress-test.glb';
  updateModelState(source, { phase: 'loading', loaded: 25, total: 100 });
  const { container } = render(<ModelLoadSurface source={source}><div>Viewer</div></ModelLoadSurface>);
  expect(screen.getByText('25%')).toBeInTheDocument();
  expect(container.querySelector('.model-load-spinner')).toBeInTheDocument();
  expect(container.querySelector('.model-load-card')).not.toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

it('clears the failed model and remounts its boundary on explicit Retry', () => {
  const source = '/media/r2/models/retry-test.glb';
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  let fail = true;
  function TestScene() {
    useEffect(() => { updateModelState(source, { phase: 'ready', loaded: 1 }); }, []);
    if (fail) throw new Error('Simulated model error');
    return <div>Model ready</div>;
  }
  render(<ModelLoadSurface source={source}><TestScene /></ModelLoadSurface>);
  expect(screen.getByText('3D model unavailable')).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(clear).toHaveBeenCalledWith(expect.any(Function), source);
  expect(screen.getByText('Model ready')).toBeInTheDocument();
  expect(screen.queryByText('3D model unavailable')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  consoleError.mockRestore();
});
