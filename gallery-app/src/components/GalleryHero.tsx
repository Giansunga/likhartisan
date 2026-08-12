import { Link } from 'react-router-dom';
import type { ThemeName } from '../contexts/ThemeContext';

interface GalleryHeroProps {
  currentTheme: ThemeName;
  isMobile: boolean;
}

export default function GalleryHero({ currentTheme, isMobile }: GalleryHeroProps) {
  const backgroundImage = currentTheme === 'christmas'
    ? '/images/christmas-gallery-hero.webp'
    : currentTheme === 'valentines'
      ? '/images/valentines-gallery-hero.webp'
      : '/images/hero_1.jpg';

  return (
    <header
      className="gallery-header-banner"
    >
      <div className="gallery-banner-bg" style={{ backgroundImage: `url(${backgroundImage})` }} />
      <div className="gallery-banner-overlay" />
      <div
        className="max-w-[var(--container-width)] mx-auto px-6 relative z-[5] w-full"
        style={isMobile ? { paddingLeft: '12px', paddingRight: '12px' } : undefined}
      >
        <div className="gallery-banner-content">
          <div className="breadcrumbs">
            <Link to="/">Home</Link>
            <span className="separator">/</span>
            <span className="current">Gallery</span>
          </div>
          <h1 className="gallery-title system-hero-title system-hero-title--banner">
            Explore the beauty and craftsmanship of Santo Tomas pottery through curated collections.
          </h1>
        </div>
      </div>
    </header>
  );
}
