import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GalleryPage from '../GalleryPage';

const mocks = vi.hoisted(() => ({
  searchHook: vi.fn(),
  order: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ currentTheme: 'default' }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ order: mocks.order })) })),
  },
}));

vi.mock('../../lib/gallerySearch', () => ({
  AI_GALLERY_SEARCH_ENABLED: true,
  recordGallerySearchClick: vi.fn(),
  resetGallerySearchHistory: vi.fn(),
}));

vi.mock('../../hooks/useGalleryAiSearch', () => ({
  useGalleryAiSearch: mocks.searchHook,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

describe('GalleryPage AI search submission', () => {
  beforeEach(() => {
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.searchHook.mockReturnValue({
      products: [], searchPlan: null, options: { categories: [], shops: [], materials: [], techniques: [] },
      total: 0, totalPages: 0, mode: 'hybrid', parserFallback: false,
      loading: false, error: null, searchId: undefined, updateSearchPlan: vi.fn(),
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('restores q from the URL and does not submit while the draft changes', async () => {
    render(
      <MemoryRouter initialEntries={['/gallery?q=terracotta%20vase']}>
        <GalleryPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const input = screen.getByRole('searchbox', { name: 'Search gallery products' });
    expect(input).toHaveValue('terracotta vase');
    await waitFor(() => expect(mocks.searchHook).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'terracotta vase', enabled: true })));

    fireEvent.change(input, { target: { value: 'blue planter under 2000' } });
    expect(mocks.searchHook).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'terracotta vase' }));

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(mocks.searchHook).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'blue planter under 2000' })));
    expect(screen.getByTestId('location-search')).toHaveTextContent('q=blue+planter+under+2000');
  });
});
