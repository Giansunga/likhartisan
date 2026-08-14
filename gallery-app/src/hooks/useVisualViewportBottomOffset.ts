import { useLayoutEffect } from 'react';

export function calculateVisualViewportBottomOffset(
  layoutHeight: number,
  visualHeight: number | null | undefined,
  visualOffsetTop: number | null | undefined,
) {
  if (![layoutHeight, visualHeight, visualOffsetTop].every(value => Number.isFinite(value))) return 0;

  return Math.max(0, Math.round(layoutHeight - Number(visualHeight) - Number(visualOffsetTop)));
}

function readVisualViewportBottomOffset() {
  if (typeof window === 'undefined' || !window.visualViewport) return 0;

  return calculateVisualViewportBottomOffset(
    window.innerHeight,
    window.visualViewport.height,
    window.visualViewport.offsetTop,
  );
}

export function useVisualViewportBottomOffset() {
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty(
        '--mobile-visible-bottom-offset',
        `${readVisualViewportBottomOffset()}px`,
      );
    };

    update();
    window.addEventListener('resize', update, { passive: true });
    viewport?.addEventListener('resize', update, { passive: true });
    viewport?.addEventListener('scroll', update, { passive: true });

    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--mobile-visible-bottom-offset');
    };
  }, []);
}
