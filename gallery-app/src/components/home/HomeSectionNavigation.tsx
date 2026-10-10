import { ChevronDown, List } from 'lucide-react';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { scrollToHomeSection, type HomeSection } from '../../lib/homeSections';
import './HomeSectionNavigation.css';

export default function HomeSectionNavigation({ sections }: { sections: readonly HomeSection[] }) {
  const compact = useMediaQuery('(max-width: 1199px), (max-height: 649px)');
  const location = useLocation();
  const [position, setPosition] = useState({ visible: false, activeId: sections[0]?.id });
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    const page = navRef.current?.closest('.home-page');
    const targets = sections.map(section => document.getElementById(section.id));
    const hero = targets[0];
    if (!page || !hero) return;
    let frame: number | null = null;

    const update = () => {
      frame = null;
      const headerBottom = document.getElementById('main-navbar')?.getBoundingClientRect().bottom
        ?? (Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 80);
      const activationLine = headerBottom + (compact ? 72 : 20) + 1;
      const visible = hero.getBoundingClientRect().bottom <= activationLine
        && page.getBoundingClientRect().bottom > activationLine;
      let activeId = sections[0]?.id;
      targets.forEach((target, index) => {
        if (target && target.getBoundingClientRect().top <= activationLine) activeId = sections[index].id;
      });
      setPosition(previous => previous.visible === visible && previous.activeId === activeId
        ? previous : { visible, activeId });
      if (!visible) setOpen(false);
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(page);
    targets.forEach(target => { if (target) observer?.observe(target); });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [sections, compact]);

  useEffect(() => {
    if (!open || !compact) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !navRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, compact]);

  const activate = (event: MouseEvent<HTMLAnchorElement>, section: HomeSection) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setOpen(false);
    if (location.hash === `#${section.id}`) {
      event.preventDefault();
      const target = document.getElementById(section.id);
      if (target) scrollToHomeSection(target);
    }
  };

  return (
    <nav ref={navRef} aria-label="Landing page sections" className={`home-section-nav${compact ? ' home-section-nav--compact' : ''}`} hidden={!position.visible}>
      {compact && <button ref={buttonRef} type="button" className="home-section-nav__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(value => !value)}>
        <List aria-hidden="true" /> Sections <ChevronDown aria-hidden="true" className={open ? 'is-open' : ''} />
      </button>}
      <ol id={listId} className="home-section-nav__list" hidden={compact && !open}>
        {sections.map(section => <li key={section.id}>
          <Link to={`/#${section.id}`} aria-label={section.label} aria-current={position.activeId === section.id ? 'location' : undefined} onClick={event => activate(event, section)}>
            <span className="home-section-nav__dot" aria-hidden="true" />
            <span className="home-section-nav__label">{section.label}</span>
          </Link>
        </li>)}
      </ol>
    </nav>
  );
}
