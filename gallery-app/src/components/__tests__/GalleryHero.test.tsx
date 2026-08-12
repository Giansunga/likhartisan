import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import GalleryHero from '../GalleryHero';

function renderHero(currentTheme: 'default' | 'christmas' | 'valentines') {
  return render(
    <MemoryRouter>
      <GalleryHero currentTheme={currentTheme} isMobile={false} />
    </MemoryRouter>,
  );
}

describe('GalleryHero', () => {
  it('renders the Christmas artwork with the standard gallery copy and no decorative markup', () => {
    const { container } = renderHero('christmas');

    expect(screen.getByText(/Explore the beauty and craftsmanship/)).toBeInTheDocument();
    expect(container.querySelector('.gallery-banner-bg')).toHaveStyle({
      backgroundImage: 'url(/images/christmas-gallery-hero.webp)',
    });
    expect(screen.queryByText('Christmas Collection')).not.toBeInTheDocument();
    expect(container.querySelector('.christmas-gallery-decor')).not.toBeInTheDocument();
    expect(container.querySelector('.christmas-banner-trim')).not.toBeInTheDocument();
    expect(container.querySelector('.christmas-snowflake')).not.toBeInTheDocument();
  });

  it('renders Valentine artwork with the same standard gallery copy', () => {
    const { container, rerender } = renderHero('christmas');

    rerender(
      <MemoryRouter>
        <GalleryHero currentTheme="valentines" isMobile={false} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Christmas Collection')).not.toBeInTheDocument();
    expect(screen.getByText(/Explore the beauty and craftsmanship/)).toBeInTheDocument();
    expect(container.querySelector('.gallery-banner-bg')).toHaveStyle({
      backgroundImage: 'url(/images/valentines-gallery-hero.webp)',
    });

    rerender(
      <MemoryRouter>
        <GalleryHero currentTheme="default" isMobile={false} />
      </MemoryRouter>,
    );

    expect(container.querySelector('.gallery-banner-bg')).toHaveStyle({
      backgroundImage: 'url(/images/hero_1.jpg)',
    });
    expect(container.querySelector('.christmas-gallery-decor')).not.toBeInTheDocument();
  });
});
