import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from '../Layout';

vi.mock('../Navbar', () => ({ default: () => <nav>Navigation</nav> }));
vi.mock('../Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('../BottomNav', () => ({ default: () => null }));

const scrolledIds: string[] = [];

function AboutFixture() {
  return <><Link to="/about#heritage">Open heritage</Link><section id="origin">Origin</section><section id="heritage">Heritage</section></>;
}

function renderAt(entry: string) {
  return render(<MemoryRouter initialEntries={[entry]}><Routes><Route element={<Layout />}><Route path="about" element={<AboutFixture />} /></Route></Routes></MemoryRouter>);
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
});
