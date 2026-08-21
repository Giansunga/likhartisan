import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AboutPage from '../AboutPage';

vi.mock('framer-motion', () => ({
  useReducedMotion: () => true,
  motion: new Proxy({}, { get: (_target, tag: string) => tag }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const query = {
        select: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(() => Promise.resolve({ data: [] })),
      };
      query.select.mockReturnValue(query);
      query.order.mockReturnValue(query);
      return query;
    }),
  },
}));

describe('AboutPage editorial chapters', () => {
  it('exposes stable anchors for landing-page chapter links', () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>);
    expect(document.getElementById('origin')).toHaveAttribute('aria-labelledby', 'about-origin-title');
    expect(document.getElementById('heritage')).toHaveAttribute('aria-labelledby', 'about-heritage-title');
    expect(document.getElementById('platform')).toHaveAttribute('aria-labelledby', 'about-platform-title');
    expect(document.getElementById('makers')).toHaveAttribute('aria-labelledby', 'about-makers-title');
    expect(document.getElementById('commitments')).toHaveAttribute('aria-labelledby', 'about-commitments-title');
    expect(screen.getByRole('heading', { name: /A local craft deserves a clearer path online/i })).toBeInTheDocument();
  });
});
