export type MaterialParams = { finish: string; color: string };

export const FINISHES = [
  { id: 'raw_clay', label: 'Terracotta', color: '#C4A882' },
  { id: 'matte', label: 'Matte', color: '#8B7355' },
  { id: 'glazed', label: 'Glossy', color: '#D4A574' },
  { id: 'acrylic_paint', label: 'Acrylic Paint', color: '#E85D75' },
  { id: 'water_paint', label: 'Water Paint', color: '#5B9BD5' },
] as const;

export const SHOP_FINISHES: Record<string, string[]> = {
  'Princess Michael Pottery': ['raw_clay', 'matte', 'glazed'],
  "Maria's Pots Jars & General Merchandise": ['raw_clay', 'acrylic_paint'],
  'Sosima Gomez Pottery': ['raw_clay'],
  'Regala Pottery': ['raw_clay', 'glazed', 'water_paint'],
  'Apung Dong Pottery': ['raw_clay'],
};

export const MATERIAL_COLORS = [
  '#C4A882', '#A0522D', '#8B4513', '#D2691E', '#CD853F', '#DEB887',
  '#B8860B', '#DAA520', '#F4A460', '#E8C39E', '#2E8B57', '#3CB371',
  '#66CDAA', '#8FBC8F', '#228B22', '#006400', '#556B2F', '#6B8E23',
  '#4682B4', '#5F9EA0', '#87CEEB', '#4169E1', '#1E90FF', '#0000CD',
  '#8B0000', '#B22222', '#DC143C', '#FF6347', '#FF4500', '#FF8C00',
  '#FFD700', '#FFFFFF',
];

export function getAvailableFinishes(shopName?: string) {
  const allowed = shopName ? SHOP_FINISHES[shopName] : undefined;
  return allowed ? FINISHES.filter((finish) => allowed.includes(finish.id)) : [...FINISHES];
}

