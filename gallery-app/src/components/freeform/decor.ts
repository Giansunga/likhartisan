export type DecorEffect = 'painted' | 'engraved';
export type DecorPlacement = 'upper' | 'middle' | 'lower' | 'full';

export type DecorationParams = {
  patternId: string;
  placement: DecorPlacement;
  scale: number;
  color: string;
  effect: DecorEffect;
};

export const DEFAULT_DECORATION: DecorationParams = {
  patternId: '',
  placement: 'middle',
  scale: 1,
  color: '#7A3E12',
  effect: 'painted',
};

export const PATTERN_CATEGORIES = [
  { id: 'floral', label: 'Floral' },
  { id: 'bamboo', label: 'Bamboo' },
  { id: 'waves', label: 'Waves' },
  { id: 'traditional', label: 'Traditional' },
  { id: 'dots', label: 'Dots' },
] as const;

export type PatternCategory = (typeof PATTERN_CATEGORIES)[number]['id'];

type PatternDefinition = {
  id: string;
  name: string;
  description: string;
  category?: PatternCategory;
  defaultColor?: string;
  recommendedPlacement?: DecorPlacement;
  content: string;
};

// Original geometric motifs designed for the configurator; labels describe the style,
// rather than claiming that any one pattern represents a specific cultural artifact.
export const PATTERNS: PatternDefinition[] = [
  { id: 'banig-diamond', name: 'Weave', description: 'Interlocking diamond weave', content: '<path d="M8 24 24 8l16 16-16 16L8 24Zm32 0L56 8l16 16-16 16-16-16ZM24 40 40 24l16 16-16 16-16-16Z" fill="none" stroke="currentColor" stroke-width="3"/>' },
  { id: 'okir-scroll', name: 'Scroll vine', description: 'Flowing carved vine', content: '<path d="M4 36c13-26 29-26 36 0s23 26 36 0M4 20c13 26 29 26 36 0s23-26 36 0" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="22" cy="28" r="4" fill="currentColor"/><circle cx="58" cy="28" r="4" fill="currentColor"/>' },
  { id: 'bamboo', name: 'Bamboo', description: 'Bamboo stalk and leaf band', content: '<path d="M15 4v48m4-48v48M48 4v48m4-48v48M11 17h12m-12 18h12m33-18h12m-12 18h12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M21 20c9-8 15-6 17-2-8 4-13 5-17 2Zm31 17c-9 8-15 6-17 2 8-4 13-5 17-2Z" fill="currentColor"/>' },
  { id: 'floral', name: 'Blue botanical', description: 'Scattered flowers, leaves, and stems', defaultColor: '#315A9F', recommendedPlacement: 'full', content: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c9 2 12 8 16 14m-7-7 7-5m-3 9-7 2M48 6c3 8 8 12 17 14m-7-6 3-7m1 11 7-3M34 38c9-8 17-8 27-2m-13-3 2-8m3 10 8-1"/><path d="M10 36c-4-7 4-12 8-6 5-7 12 0 6 6 8 3 2 11-4 6-5 6-13 0-6-6Zm29-13c-4-7 4-12 8-6 5-7 12 0 6 6 8 3 2 11-4 6-5 6-13 0-6-6Zm28 21c-3-5 3-9 6-4 4-5 9 1 4 5 6 2 2 8-3 5-4 4-9 0-4-6Z"/><path d="M28 8c3-5 8-4 9 0-1 4-6 5-9 0Zm-2 21c4-4 9-2 9 2-2 4-7 3-9-2Zm42-2c4-4 9-2 9 2-2 4-7 3-9-2Z"/></g>' },
  { id: 'sun-ray', name: 'Sun ray', description: 'Radiating sun motif', content: '<path d="M16 28h12m8 0h12m-20-20v12m0 16v12M22 14l8 8m12 12 8 8m0-28-8 8M30 34l-8 8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="36" cy="28" r="8" fill="none" stroke="currentColor" stroke-width="3"/>' },
  { id: 'wave', name: 'Waves', description: 'Layered water waves', content: '<path d="M0 18c8-10 16-10 24 0s16 10 24 0 16-10 24 0M0 34c8-10 16-10 24 0s16 10 24 0 16-10 24 0" fill="none" stroke="currentColor" stroke-width="3"/>' },
  { id: 'leaf', name: 'Leaf trail', description: 'Alternating leaves', content: '<path d="M0 28h80" stroke="currentColor" stroke-width="2"/><path d="M12 28c0-10 9-13 13-13-1 8-5 13-13 13Zm18 0c0 10 9 13 13 13-1-8-5-13-13-13Zm18 0c0-10 9-13 13-13-1 8-5 13-13 13Z" fill="currentColor"/>' },
  { id: 'dot-border', name: 'Dots', description: 'Minimal dotted band', content: '<circle cx="10" cy="28" r="4" fill="currentColor"/><circle cx="30" cy="28" r="4" fill="currentColor"/><circle cx="50" cy="28" r="4" fill="currentColor"/><circle cx="70" cy="28" r="4" fill="currentColor"/>' },
  { id: 'floral-sampaguita', name: 'Sampaguita', description: 'Star-like blossoms', category: 'floral', content: '<g fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 18c8-8 14 2 7 7 8 6 0 15-6 8-8 7-16-2-7-8-7-7 1-15 6-7Zm40 0c8-8 14 2 7 7 8 6 0 15-6 8-8 7-16-2-7-8-7-7 1-15 6-7Z"/><circle cx="20" cy="26" r="2"/><circle cx="60" cy="26" r="2"/></g>' },
  { id: 'floral-hibiscus', name: 'Hibiscus', description: 'Bold bloom and stamen', category: 'floral', content: '<g fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 28c-13-11-2-20 5-10 4-10 15-4 8 4 11 0 10 12 0 10 5 10-8 14-10 4-8 8-16-2-5-8Z"/><path d="m25 29 13 8m0 0-4-1m4 1-2-4"/><path d="M59 28c-13-11-2-20 5-10 4-10 15-4 8 4 11 0 10 12 0 10 5 10-8 14-10 4-8 8-16-2-5-8Z"/></g>' },
  { id: 'floral-orchid', name: 'Orchid', description: 'Orchid petal pair', category: 'floral', content: '<g fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 28c4-16 15-13 12-3 10-10 17 1 7 6 8 7-3 15-9 6-5 10-16 4-9-5-12 4-14-8-1-4Z"/><circle cx="22" cy="29" r="3"/><path d="M52 28c4-16 15-13 12-3 10-10 17 1 7 6 8 7-3 15-9 6-5 10-16 4-9-5-12 4-14-8-1-4Z"/><circle cx="62" cy="29" r="3"/></g>' },
  { id: 'floral-sunflower', name: 'Sunflower', description: 'Radiating flower petals', category: 'floral', content: '<g fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="20" cy="28" r="5"/><path d="M20 10v11m0 14v11M2 28h11m14 0h11M7 15l8 8m10 10 8 8m0-26-8 8M15 33l-8 8"/><circle cx="60" cy="28" r="5"/><path d="M60 10v11m0 14v11M42 28h11m14 0h11M47 15l8 8m10 10 8 8m0-26-8 8M55 33l-8 8"/></g>' },
  { id: 'bamboo-leaves', name: 'Bamboo leaves', description: 'Dense leaf trail', category: 'bamboo', content: '<path d="M0 28h80" stroke="currentColor" stroke-width="2"/><path d="M8 28c3-11 12-12 16-10-6 8-11 10-16 10Zm16 0c3 11 12 12 16 10-6-8-11-10-16-10Zm16 0c3-11 12-12 16-10-6 8-11 10-16 10Zm16 0c3 11 12 12 16 10-6-8-11-10-16-10Z" fill="currentColor"/>' },
  { id: 'bamboo-lattice', name: 'Bamboo lattice', description: 'Crossed stalk framework', category: 'bamboo', content: '<path d="m0 8 50 40M-10 8l50 40M30 8l50 40M0 48 50 8M-10 48 40 8M30 48 80 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' },
  { id: 'bamboo-crossed', name: 'Crossed bamboo', description: 'Alternating tied bamboo', category: 'bamboo', content: '<path d="m4 12 30 32m-4-32L0 44m30-16 10-12m-8 28 30-32m-4 32L28 12m30 16 10-12m-8 28 20-22" fill="none" stroke="currentColor" stroke-width="3.2"/><circle cx="30" cy="28" r="3" fill="currentColor"/><circle cx="58" cy="28" r="3" fill="currentColor"/>' },
  { id: 'wave-double', name: 'Double wave', description: 'Bold paired wave crests', category: 'waves', content: '<path d="M0 19c10-16 20-16 30 0s20 16 30 0 14-16 20 0M0 38c10-16 20-16 30 0s20 16 30 0 14-16 20 0" fill="none" stroke="currentColor" stroke-width="3.2"/>' },
  { id: 'wave-spiral', name: 'Ocean crest', description: 'Curling crest waves with spirals', category: 'waves', content: '<path d="M0 48C5 27 15 17 25 42 30 16 40 7 47 39 55 18 68 18 80 45" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 48c7-8 14-8 21 0m5-6c7-9 14-9 21 0m6 2c7-8 14-8 21 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 42c-6-7 4-13 8-7 4 6-5 10-8 4m23 1c-6-7 4-13 8-7 4 6-5 10-8 4m20 3c-6-7 4-13 8-7 4 6-5 10-8 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' },
  { id: 'wave-ripple', name: 'Rain ripple', description: 'Concentric water ripples', category: 'waves', content: '<g fill="none" stroke="currentColor" stroke-width="2.5"><ellipse cx="20" cy="28" rx="17" ry="8"/><ellipse cx="20" cy="28" rx="9" ry="4"/><ellipse cx="60" cy="28" rx="17" ry="8"/><ellipse cx="60" cy="28" rx="9" ry="4"/></g>' },
  { id: 'wave-fishscale', name: 'Fish scale', description: 'Overlapping scallop band', category: 'waves', content: '<path d="M0 28c6-15 18-15 24 0 6-15 18-15 24 0 6-15 18-15 24 0M0 42c6-15 18-15 24 0 6-15 18-15 24 0 6-15 18-15 24 0" fill="none" stroke="currentColor" stroke-width="2.6"/>' },
  { id: 'traditional-curl', name: 'Curl border', description: 'Flowing cutwork-inspired curls', category: 'traditional', content: '<path d="M0 34c10 0 9-20 20-20 12 0 9 20 20 20s8-20 20-20c11 0 10 20 20 20M12 38c7 8 13 8 20 0m16 0c7 8 13 8 20 0" fill="none" stroke="currentColor" stroke-width="3"/>' },
  { id: 'traditional-diamond', name: 'Diamond border', description: 'Layered geometric border', category: 'traditional', content: '<path d="M0 28 12 16l12 12-12 12L0 28Zm24 0 12-12 12 12-12 12-12-12Zm24 0 12-12 12 12-12 12-12-12Z" fill="none" stroke="currentColor" stroke-width="2.7"/><circle cx="12" cy="28" r="2.5" fill="currentColor"/><circle cx="36" cy="28" r="2.5" fill="currentColor"/><circle cx="60" cy="28" r="2.5" fill="currentColor"/>' },
  { id: 'dots-grid', name: 'Dot grid', description: 'Offset dot grid', category: 'dots', content: '<g fill="currentColor"><circle cx="10" cy="18" r="3"/><circle cx="30" cy="18" r="3"/><circle cx="50" cy="18" r="3"/><circle cx="70" cy="18" r="3"/><circle cx="20" cy="36" r="3"/><circle cx="40" cy="36" r="3"/><circle cx="60" cy="36" r="3"/></g>' },
  { id: 'dots-flower', name: 'Dot flower', description: 'Petal-like dot clusters', category: 'dots', content: '<g fill="currentColor"><circle cx="16" cy="20" r="3"/><circle cx="24" cy="20" r="3"/><circle cx="20" cy="28" r="3"/><circle cx="16" cy="36" r="3"/><circle cx="24" cy="36" r="3"/><circle cx="56" cy="20" r="3"/><circle cx="64" cy="20" r="3"/><circle cx="60" cy="28" r="3"/><circle cx="56" cy="36" r="3"/><circle cx="64" cy="36" r="3"/></g>' },
  { id: 'dots-concentric', name: 'Concentric dots', description: 'Circular dot clusters', category: 'dots', content: '<g fill="currentColor"><circle cx="14" cy="28" r="3"/><circle cx="23" cy="17" r="3"/><circle cx="31" cy="28" r="3"/><circle cx="23" cy="39" r="3"/><circle cx="23" cy="28" r="3"/><circle cx="54" cy="28" r="3"/><circle cx="63" cy="17" r="3"/><circle cx="71" cy="28" r="3"/><circle cx="63" cy="39" r="3"/><circle cx="63" cy="28" r="3"/></g>' },
  { id: 'dots-trail', name: 'Dot trail', description: 'Alternating flowing dots', category: 'dots', content: '<g fill="currentColor"><circle cx="5" cy="32" r="3"/><circle cx="16" cy="24" r="3"/><circle cx="27" cy="32" r="3"/><circle cx="38" cy="24" r="3"/><circle cx="49" cy="32" r="3"/><circle cx="60" cy="24" r="3"/><circle cx="71" cy="32" r="3"/></g><path d="M0 28c12-12 20 12 32 0s20 12 32 0" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".55"/>' },
];

const LEGACY_PATTERN_CATEGORIES: Record<string, PatternCategory> = {
  floral: 'floral', bamboo: 'bamboo', leaf: 'bamboo', wave: 'waves',
  'banig-diamond': 'traditional', 'okir-scroll': 'traditional', 'sun-ray': 'traditional', 'dot-border': 'dots',
};

export function getPatternsByCategory(category: PatternCategory) {
  return PATTERNS.filter((pattern) => (pattern.category || LEGACY_PATTERN_CATEGORIES[pattern.id]) === category);
}

export function getPatternCategory(patternId: string): PatternCategory | undefined {
  const pattern = getPattern(patternId);
  return pattern?.category || LEGACY_PATTERN_CATEGORIES[patternId];
}

export function getPattern(patternId: string) {
  return PATTERNS.find((pattern) => pattern.id === patternId);
}

export function createPatternSvg(patternId: string, color: string, placement: DecorPlacement = 'middle', backgroundColor = 'transparent'): string {
  const pattern = getPattern(patternId);
  if (!pattern) return '';
  const content = pattern.content.replaceAll('currentColor', color);
  const y = placement === 'upper' ? 26 : placement === 'lower' ? 174 : 100;
  const patternRows = placement === 'full'
    // Reserve the upper rim area, then repeat complete pattern rows only.
    ? [6, 72, 138, 204].map((offset) => `<g transform="translate(0 ${offset})">${content}</g>`).join('')
    : `<g transform="translate(0 ${y})">${content}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="256" viewBox="0 0 80 256"><rect width="80" height="256" fill="${backgroundColor}"/>${patternRows}</svg>`;
}
