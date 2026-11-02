import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShapeTab from '../ShapeTab';
import { DEFAULT_SHAPE_PARAMS_IN, shapeFromModelBase } from '../../../lib/measurements';

const initialShape = DEFAULT_SHAPE_PARAMS_IN;

describe('ShapeTab', () => {
  let queuedFrame: FrameRequestCallback | null;

  beforeEach(() => {
    queuedFrame = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      queuedFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn(() => {
      queuedFrame = null;
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('coalesces rapid slider changes into one preview update per frame', () => {
    const onChange = vi.fn();
    render(<ShapeTab shapeParams={initialShape} onChange={onChange} />);
    const height = screen.getByRole('slider', { name: 'Height' });

    fireEvent.change(height, { target: { value: '10.8' } });
    fireEvent.change(height, { target: { value: '10.9' } });
    fireEvent.change(height, { target: { value: '11' } });

    expect(screen.getByText('+1.16 in')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    act(() => queuedFrame?.(0));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ ...initialShape, height: 11 });
  });

  it('flushes the exact final value and ends deferred analysis on release', () => {
    const onChange = vi.fn();
    const onInteractionChange = vi.fn();
    render(<ShapeTab shapeParams={initialShape} onChange={onChange} onInteractionChange={onInteractionChange} />);
    const width = screen.getByRole('slider', { name: 'Body Width' });

    fireEvent.pointerDown(width);
    fireEvent.change(width, { target: { value: '10' } });
    fireEvent.pointerUp(width);

    expect(onInteractionChange.mock.calls).toEqual([[true], [false]]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ ...initialShape, bodyWidth: 10 });
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it('keeps a model with 14-inch neck and rim baselines adjustable', () => {
    const shape = { ...initialShape, neckWidth: 14, rimSize: 14 };
    render(<ShapeTab shapeParams={shape} baseShape={shape} onChange={vi.fn()} />);

    for (const name of ['Neck Width', 'Rim Size']) {
      const slider = screen.getByRole('slider', { name });
      expect(Number(slider.getAttribute('max'))).toBeGreaterThan(14);
      expect(slider).toHaveValue('14');
    }
  });

  it('starts at zero offset, limits edits to half the baseline, and resets to the saved baseline', () => {
    const shape = { ...initialShape, height: 13, bodyWidth: 14, neckWidth: 8, rimSize: 10 };
    const onChange = vi.fn();
    render(<ShapeTab shapeParams={shape} baseShape={shape} onChange={onChange} />);
    const height = screen.getByRole('slider', { name: 'Height' });
    expect(height).toHaveAttribute('min', '6.5');
    expect(height).toHaveAttribute('max', '19.5');
    expect(screen.getAllByText('0.00 in')).toHaveLength(4);
    expect(screen.getByText('0%')).toBeInTheDocument();
    fireEvent.change(height, { target: { value: '14' } });
    expect(screen.getByText('+1.00 in')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Shape' }));
    expect(onChange).toHaveBeenLastCalledWith(shape);
  });

  it('keeps the model baseline metadata when resetting an edited shape', () => {
    const base = shapeFromModelBase({ height: 14, bodyWidth: 5, neckWidth: 5, rimSize: 5 });
    const onChange = vi.fn();
    render(<ShapeTab shapeParams={{ ...base, height: 15 }} baseShape={base} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Shape' }));
    expect(onChange).toHaveBeenCalledWith(base);
  });

  it.each(['pointerup', 'pointercancel', 'blur'])('commits a drag ending on window %s', (event) => {
    const onChange = vi.fn();
    const interaction = vi.fn();
    render(<ShapeTab shapeParams={initialShape} onChange={onChange} onInteractionChange={interaction} />);
    const height = screen.getByRole('slider', { name: 'Height' });
    fireEvent.pointerDown(height);
    fireEvent.change(height, { target: { value: '11' } });
    fireEvent(window, new Event(event));
    expect(onChange).toHaveBeenLastCalledWith({ ...initialShape, height: 11 });
    expect(interaction.mock.calls).toEqual([[true], [false]]);
  });

  it('commits queued edits when a panel unmounts and does not replay cancelled frames', () => {
    const onChange = vi.fn();
    const interaction = vi.fn();
    const { unmount } = render(<ShapeTab shapeParams={initialShape} onChange={onChange} onInteractionChange={interaction} />);
    fireEvent.pointerDown(screen.getByRole('slider', { name: 'Height' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Height' }), { target: { value: '11' } });
    unmount();
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...initialShape, height: 11 });
    expect(interaction).toHaveBeenLastCalledWith(false);
    expect(queuedFrame).toBeNull();
  });

  it('keeps saved outlier ranges stable while editing and updates them for a different baseline', () => {
    const base = shapeFromModelBase({ height: 10, bodyWidth: 8, neckWidth: 5, rimSize: 4 });
    const { rerender } = render(<ShapeTab shapeParams={{ ...base, height: 19 }} baseShape={base} onChange={vi.fn()} />);
    const height = screen.getByRole('slider', { name: 'Height' });
    expect(height).toHaveAttribute('max', '19');
    rerender(<ShapeTab shapeParams={{ ...base, height: 18 }} baseShape={base} onChange={vi.fn()} />);
    expect(height).toHaveAttribute('max', '19');
    const next = shapeFromModelBase({ height: 20, bodyWidth: 8, neckWidth: 5, rimSize: 4 });
    rerender(<ShapeTab shapeParams={next} baseShape={next} onChange={vi.fn()} />);
    expect(height).toHaveAttribute('min', '10');
    expect(height).toHaveAttribute('max', '30');
  });
});
