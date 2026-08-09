import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GalleryPage from '../GalleryPage';

const mocks = vi.hoisted(() => ({
  currentTheme: 'christmas' as 'default' | 'christmas' | 'valentines',
  order: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ currentTheme: mocks.currentTheme }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: mocks.order })),
    })),
  },
}));

describe('GalleryPage category artwork', () => {
  beforeEach(() => {
    mocks.currentTheme = 'christmas';
    mocks.order.mockResolvedValue({ data: [], error: null });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('uses the category image set for the active seasonal theme', async () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <GalleryPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(container.querySelectorAll('.zoom-card-bg')).toHaveLength(6));
    const christmasImages = [
      'christmas-all-crafts.webp',
      'christmas-vases.webp',
      'christmas-planters.webp',
      'christmas-jars.webp',
      'christmas-amphoras.webp',
      'christmas-tealights.webp',
    ];
    Array.from(container.querySelectorAll('.zoom-card-bg')).forEach((image, index) => {
      expect(image).toHaveStyle({ backgroundImage: `url(/images/${christmasImages[index]})` });
    });

    mocks.currentTheme = 'valentines';
    await act(async () => {
      rerender(
        <MemoryRouter>
          <GalleryPage />
        </MemoryRouter>,
      );
    });

    const valentinesImages = [
      'valentines-all-crafts.webp',
      'valentines-vases.webp',
      'valentines-planters.webp',
      'valentines-jars.webp',
      'valentines-amphoras.webp',
      'valentines-tealights.webp',
    ];
    Array.from(container.querySelectorAll('.zoom-card-bg')).forEach((image, index) => {
      expect(image).toHaveStyle({ backgroundImage: `url(/images/${valentinesImages[index]})` });
    });

    mocks.currentTheme = 'default';
    await act(async () => {
      rerender(
        <MemoryRouter>
          <GalleryPage />
        </MemoryRouter>,
      );
    });

    const standardImages = [
      'pottery-collage.png',
      'vases_collection.png',
      'planters_collection.png',
      'jars_collection.png',
      'amphoras_collection.png',
      'tealights_collection.png',
    ];
    Array.from(container.querySelectorAll('.zoom-card-bg')).forEach((image, index) => {
      expect(image).toHaveStyle({ backgroundImage: `url(/images/${standardImages[index]})` });
    });
  });
});
