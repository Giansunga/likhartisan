import { useEffect, useRef, type ReactNode } from 'react';

export type PanelSectionProps = {
  number: number;
  title: string;
  summary?: string;
  expanded: boolean;
  completed?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  regionId: string;
  children: ReactNode;
};

export default function PanelSection({
  number,
  title,
  summary,
  expanded,
  completed = false,
  disabled = false,
  onToggle,
  regionId,
  children,
}: PanelSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const wasExpandedRef = useRef(expanded);
  const headingId = `${regionId}-heading`;

  useEffect(() => {
    if (expanded && !wasExpandedRef.current) {
      const frame = requestAnimationFrame(() => sectionRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
      wasExpandedRef.current = expanded;
      return () => cancelAnimationFrame(frame);
    }
    wasExpandedRef.current = expanded;
  }, [expanded]);

  return (
    <section ref={sectionRef} className={`guided-panel-section${expanded ? ' expanded' : ''}${completed ? ' completed' : ''}${disabled ? ' disabled' : ''}`}>
      <button
        type="button"
        id={headingId}
        className="guided-panel-trigger"
        aria-expanded={expanded}
        aria-controls={regionId}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="guided-panel-number" aria-hidden="true">{completed ? '✓' : number}</span>
        <span className="guided-panel-heading">
          <strong>{title}</strong>
          {summary ? <small>{summary}</small> : null}
        </span>
        <svg className="guided-panel-chevron" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      <div id={regionId} role="region" aria-labelledby={headingId} hidden={!expanded} className="guided-panel-content">
        {children}
      </div>
    </section>
  );
}
