import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from '../Layout';

vi.mock('../Navbar', () => ({ default: () => <nav>Navigation</nav> }));
vi.mock('../Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('../BottomNav', () => ({ default: () => null }));

const scrolledIds: string[] = [];

function AboutFixture() {
  return <><Link to="/about#heritage">Open heritage</Link><section id="origin">Origin</section><section id="heritage">Heritage</section></>;
}

function HomeFixture() {
  const navigate = useNavigate();
  return <>
    <Link to="/#home-reviews">Open reviews</Link>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate(1)}>Forward</button>
    <section id="home-story" data-home-section tabIndex={-1}>Story</section>
    <section id="home-reviews" data-home-section tabIndex={-1}>Reviews</section>
  </>;
}

function renderAt(entry: string) {
  return render(<MemoryRouter initialEntries={[entry]}><Routes><Route element={<Layout />}><Route index element={<HomeFixture />} /><Route path="about" element={<AboutFixture />} /></Route></Routes></MemoryRouter>);
}

describe('Layout hash navigation', () => {
  beforeEach(() => {
    scrolledIds.length = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(function scrollIntoView(this: HTMLElement) { scrolledIds.push(this.id); }),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('scrolls direct and same-page hashes to their chapters', () => {
    renderAt('/about#origin');
    expect(scrolledIds).toContain('origin');
    fireEvent.click(screen.getByRole('link', { name: 'Open heritage' }));
    expect(scrolledIds).toContain('heritage');
  });

  it('falls back to the page top for missing or absent hashes', () => {
    renderAt('/about#missing');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('scrolls and focuses homepage direct links and history destinations', () => {
    renderAt('/#home-story');
    expect(scrolledIds).toContain('home-story');
    expect(document.getElementById('home-story')).toHaveFocus();
    fireEvent.click(screen.getByRole('link', { name: 'Open reviews' }));
    expect(document.getElementById('home-reviews')).toHaveFocus();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'instant' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(document.getElementById('home-story')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(document.getElementById('home-reviews')).toHaveFocus();
  });
});
