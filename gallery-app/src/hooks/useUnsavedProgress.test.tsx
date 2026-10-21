import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUnsavedProgress } from './useUnsavedProgress';
describe('unsaved Freeform progress', () => {
  it('warns only while dirty and removes the handler after saving/reset or unmount', () => {
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedProgress(dirty), { initialProps: { dirty: false } });
    const refresh = () => { const event = new Event('beforeunload', { cancelable: true }); fireEvent(window, event); return event.defaultPrevented; };
    expect(refresh()).toBe(false); rerender({ dirty: true }); expect(refresh()).toBe(true);
    rerender({ dirty: false }); expect(refresh()).toBe(false);
    rerender({ dirty: true }); unmount(); expect(refresh()).toBe(false);
  });
});
