import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useControlDraft } from '../useControlDraft';

afterEach(() => vi.unstubAllGlobals());

it('does not overwrite a newer queued control change with the preceding frame echoed by its parent', () => {
  let frame: FrameRequestCallback | null = null;
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frame = callback; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const onChange = vi.fn();
  const initial = { horizontal: 0, rotation: 0 };
  const { result, rerender } = renderHook(({ value }) => useControlDraft(value, onChange), { initialProps: { value: initial } });
  act(() => result.current.update({ horizontal: 10, rotation: 0 }));
  act(() => frame?.(0));
  act(() => result.current.update({ horizontal: 10, rotation: 40 }));
  rerender({ value: { horizontal: 10, rotation: 0 } });
  act(() => frame?.(1));
  expect(onChange).toHaveBeenLastCalledWith({ horizontal: 10, rotation: 40 });
});
