import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
  render(<ModelLoadSurface source={source} fallbackSrc="/retry-photo.jpg" fallbackAlt="Vase preview"><TestScene /></ModelLoadSurface>);
  expect(screen.getByText('3D model unavailable')).toBeInTheDocument();
  expect(screen.getByAltText('Vase preview')).toHaveAttribute('src', '/retry-photo.jpg');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(clear).toHaveBeenCalledWith(expect.any(Function), source);
  expect(screen.getByText('Model ready')).toBeInTheDocument();
  expect(screen.queryByText('3D model unavailable')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  expect(screen.queryByAltText('Vase preview')).not.toBeInTheDocument();
  consoleError.mockRestore();
});

it('shows the model thumbnail through loading, retrying, preparation and failure, then reveals the ready model', () => {
  const source = '/models/photo-fallback.glb';
  updateModelState(source, { phase: 'loading', loaded: 0 });
  render(<ModelLoadSurface source={source} fallbackSrc="/model-photo.jpg" fallbackAlt="Model photo"><div>Interactive model</div></ModelLoadSurface>);
  for (const phase of ['loading', 'retrying', 'preparing', 'error'] as const) {
    act(() => updateModelState(source, { phase, loaded: 0 }));
    expect(screen.getByAltText('Model photo')).toHaveAttribute('src', '/model-photo.jpg');
  }
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  act(() => updateModelState(source, { phase: 'ready', loaded: 1 }));
  expect(screen.queryByAltText('Model photo')).not.toBeInTheDocument();
  expect(screen.getByText('Interactive model')).toBeInTheDocument();
});

it('uses a local placeholder when the thumbnail is missing or fails', () => {
  const source = '/models/missing-photo.glb';
  const { rerender } = render(<ModelLoadSurface source={source}><div>Scene</div></ModelLoadSurface>);
  expect(screen.getByAltText('Model preview')).toHaveAttribute('src', '/images/media-unavailable.svg');
  rerender(<ModelLoadSurface source={source} fallbackSrc="/broken-photo.jpg"><div>Scene</div></ModelLoadSurface>);
  const photo = screen.getByAltText('Model preview');
  fireEvent.error(photo);
  expect(photo).toHaveAttribute('src', '/images/media-unavailable.svg');
});

it('resets a failed boundary and its photo when the selected model changes', () => {
  const source = '/models/old-selection.glb';
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  function BrokenScene(): never { throw new Error('Simulated WebGL failure'); }
  const { rerender } = render(<ModelLoadSurface source={source} fallbackSrc="/old.jpg"><BrokenScene /></ModelLoadSurface>);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  rerender(<ModelLoadSurface source="/models/new-selection.glb" fallbackSrc="/new.jpg"><div>New model</div></ModelLoadSurface>);
  expect(screen.getByAltText('Model preview')).toHaveAttribute('src', '/new.jpg');
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  expect(screen.getByText('New model')).toBeInTheDocument();
  consoleError.mockRestore();
});
