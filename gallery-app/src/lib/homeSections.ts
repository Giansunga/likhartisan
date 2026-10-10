export interface HomeSection {
  id: string;
  label: string;
}

export const HOME_SECTIONS: readonly HomeSection[] = [
  { id: 'home-top', label: 'Top' },
  { id: 'home-story', label: 'Our Story' },
  { id: 'home-collections', label: 'Collections' },
  { id: 'home-shops', label: 'Shops' },
  { id: 'home-design-studio', label: 'Design Studio' },
  { id: 'home-shop-tour', label: 'Shop Tour' },
  { id: 'home-reviews', label: 'Reviews' },
  { id: 'home-about', label: 'About' },
];

export function scrollToHomeSection(target: HTMLElement) {
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
  target.focus({ preventScroll: true });
}
