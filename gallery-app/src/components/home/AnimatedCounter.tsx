import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export default function AnimatedCounter({ value, delay = 0, suffix = '' }: { value: number | null; delay?: number; suffix?: string }) {
  const [count, setCount] = useState<number | null>(null);
  const displayed = useRef<number | null>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const seen = useRef(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    if (value === null) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;
    const start = () => {
      seen.current = true;
      const from = displayed.current ?? 0;
      let started: number | null = null;
      const tick = (time: number) => {
        started ??= time;
        const progress = reducedMotion ? 1 : Math.min((time - started) / 2600, 1);
        const next = Math.round(from + (value - from) * progress);
        displayed.current = next;
        setCount(next);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      timer = setTimeout(() => { frame = requestAnimationFrame(tick); }, reducedMotion ? 0 : delay);
    };
    if (reducedMotion || seen.current || !('IntersectionObserver' in window)) start();
    else {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { observer?.disconnect(); start(); }
      }, { threshold: 0.65 });
      if (counterRef.current) observer.observe(counterRef.current);
    }
    return () => { observer?.disconnect(); clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [value, delay, reducedMotion]);
  const visibleCount = reducedMotion ? value : count;
  return <span ref={counterRef}>{visibleCount === null ? '—' : `${visibleCount.toLocaleString('en-US')}${suffix}`}</span>;
}
