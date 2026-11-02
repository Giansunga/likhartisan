import { useEffect, useRef, useState } from 'react';

/** One preview update per frame, with a final commit even if the panel closes. */
export function useControlDraft<T>(value: T, onChange: (value: T) => void, onInteractionChange?: (active: boolean) => void) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const frameRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const callbacks = useRef({ onChange, onInteractionChange });
  useEffect(() => { callbacks.current = { onChange, onInteractionChange }; }, [onChange, onInteractionChange]);
  useEffect(() => {
    // A parent can echo the preceding frame after the next edit was queued.
    // Do not let that older value overwrite the unsent draft.
    if (activeRef.current || frameRef.current !== null) return;
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  function commit() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    callbacks.current.onChange(draftRef.current);
  }
  function begin() {
    if (activeRef.current) return;
    activeRef.current = true;
    callbacks.current.onInteractionChange?.(true);
  }
  function end() {
    if (!activeRef.current) return;
    commit();
    activeRef.current = false;
    callbacks.current.onInteractionChange?.(false);
  }
  useEffect(() => {
    // Window listeners cover pointer release outside the control and lost focus.
    const finish = () => {
      if (!activeRef.current) return;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      callbacks.current.onChange(draftRef.current);
      activeRef.current = false;
      callbacks.current.onInteractionChange?.(false);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keyup', finish);
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keyup', finish);
      window.removeEventListener('blur', finish);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        callbacks.current.onChange(draftRef.current);
      }
      if (activeRef.current) callbacks.current.onInteractionChange?.(false);
      activeRef.current = false;
    };
  }, []);
  function update(next: T) {
    draftRef.current = next;
    setDraft(next);
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      callbacks.current.onChange(draftRef.current);
    });
  }
  function reset(next: T) {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    draftRef.current = next;
    setDraft(next);
    callbacks.current.onChange(next);
    if (activeRef.current) callbacks.current.onInteractionChange?.(false);
    activeRef.current = false;
  }
  return { draft, draftRef, update, reset, begin, end };
}
