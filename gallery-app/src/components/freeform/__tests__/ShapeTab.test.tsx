import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShapeTab from '../ShapeTab';
import { DEFAULT_SHAPE_PARAMS_IN } from '../../../lib/measurements';

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

    expect(screen.getByText('11.00 in')).toBeInTheDocument();
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
});
