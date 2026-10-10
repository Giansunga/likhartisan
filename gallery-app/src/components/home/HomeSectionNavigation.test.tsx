import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_SECTIONS } from '../../lib/homeSections';
import HomeSectionNavigation from './HomeSectionNavigation';

let scrollOffset = 0;
let compact = false;
let frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
const tops = [80, 800, 1600, 2200, 3000, 5000, 5500, 6000];
const resizeCallbacks: ResizeObserverCallback[] = [];
const disconnect = vi.fn();

function rectangle(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 1400, width: 1400, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
}

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.hash}</output>;
}

function renderNavigation(entry = '/') {
  return render(<MemoryRouter initialEntries={[entry]}>
    <div id="main-navbar" />
    <div className="home-page">
      <HomeSectionNavigation sections={HOME_SECTIONS} />
      {HOME_SECTIONS.map(section => <section key={section.id} id={section.id} data-home-section tabIndex={-1}>{section.label} content</section>)}
    </div>
    <LocationDisplay />
  </MemoryRouter>);
}

function flushFrames() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(0));
  });
}

function scrollTo(offset: number) {
  scrollOffset = offset;
  fireEvent.scroll(window);
  flushFrames();
}

describe('HomeSectionNavigation', () => {
  beforeEach(() => {
    scrollOffset = 0; compact = false; frameId = 0;
    frames.clear(); resizeCallbacks.length = 0; disconnect.mockClear();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
      observe = vi.fn();
      disconnect = disconnect;
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.set(++frameId, callback); return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.id === 'main-navbar') return rectangle(0, 80);
      if (this.classList.contains('home-page')) return rectangle(80 - scrollOffset, 6500 - scrollOffset);
      const index = HOME_SECTIONS.findIndex(section => section.id === this.id);
      return index < 0 ? rectangle(0, 0) : rectangle(tops[index] - scrollOffset, (tops[index + 1] ?? 6500) - scrollOffset);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('hides during the hero, exposes all section links afterward, and hides past the page', () => {
    renderNavigation(); flushFrames();
    expect(screen.queryByRole('navigation', { name: 'Landing page sections' })).not.toBeInTheDocument();
    // A section jump leaves the shared header offset above Our Story.
    scrollTo(700);
    const navigation = screen.getByRole('navigation', { name: 'Landing page sections' });
    HOME_SECTIONS.forEach(section => {
      const link = within(navigation).getByRole('link', { name: section.label });
      expect(link).toHaveAttribute('href', `/#${section.id}`);
      expect(link.querySelector('.home-section-nav__dot')).toHaveAttribute('aria-hidden', 'true');
      expect(link).toHaveTextContent(section.label);
      expect(link.textContent).not.toMatch(/\d/);
    });
    expect(within(navigation).getByRole('link', { name: 'Our Story' })).toHaveAttribute('aria-current', 'location');
    scrollTo(6400);
    expect(navigation).toHaveAttribute('hidden');
  });

  it('tracks section boundaries and the entire tall Design Studio without changing the URL', () => {
    renderNavigation('/#home-story'); flushFrames();
    scrollTo(1800);
    expect(screen.getByRole('link', { name: 'Collections' })).toHaveAttribute('aria-current', 'location');
    scrollTo(3100);
    expect(screen.getByRole('link', { name: 'Design Studio' })).toHaveAttribute('aria-current', 'location');
    scrollTo(4800);
    expect(screen.getByRole('link', { name: 'Design Studio' })).toHaveAttribute('aria-current', 'location');
    scrollTo(4900);
    expect(screen.getByRole('link', { name: 'Shop Tour' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByTestId('location')).toHaveTextContent('/#home-story');
  });

  it('recalculates after resize and asynchronous section-size changes', () => {
    renderNavigation(); flushFrames(); scrollTo(720);
    scrollOffset = 1800;
    fireEvent.resize(window); flushFrames();
    expect(screen.getByRole('link', { name: 'Collections' })).toHaveAttribute('aria-current', 'location');
    scrollOffset = 2300;
    act(() => resizeCallbacks[0]([], {} as ResizeObserver)); flushFrames();
    expect(screen.getByRole('link', { name: 'Shops' })).toHaveAttribute('aria-current', 'location');
  });

  it('supports Escape with focus restoration and outside-pointer dismissal on compact screens', () => {
    compact = true;
    renderNavigation(); flushFrames(); scrollTo(720);
    const button = screen.getByRole('button', { name: 'Sections' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Shops' })).not.toBeInTheDocument();
    fireEvent.click(button);
    screen.getByRole('link', { name: 'Shops' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the compact list on selection and writes only the selected hash', () => {
    compact = true;
    renderNavigation(); flushFrames(); scrollTo(720);
    const button = screen.getByRole('button', { name: 'Sections' });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('link', { name: 'Reviews' }));
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('location')).toHaveTextContent('/#home-reviews');
  });

  it('jumps and focuses again when selecting the current hash without another history entry', () => {
    renderNavigation('/#home-story'); flushFrames(); scrollTo(1800);
    fireEvent.click(screen.getByRole('link', { name: 'Our Story' }));
    const target = document.getElementById('home-story');
    expect(target?.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
    expect(target).toHaveFocus();
    expect(screen.getByTestId('location')).toHaveTextContent('/#home-story');
  });

  it('closes the compact menu when returning to the hero', () => {
    compact = true;
    renderNavigation(); flushFrames(); scrollTo(720);
    fireEvent.click(screen.getByRole('button', { name: 'Sections' }));
    scrollTo(0); scrollTo(720);
    expect(screen.getByRole('button', { name: 'Sections' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('coalesces scroll events and releases pending frames, observers, and listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = renderNavigation(); flushFrames();
    fireEvent.scroll(window); fireEvent.scroll(window);
    expect(frames.size).toBe(1);
    view.unmount();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
