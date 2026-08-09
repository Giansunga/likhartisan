export const FINISH_IDS = ['raw_clay', 'matte', 'glazed', 'acrylic_paint', 'water_paint'] as const;
export type FinishId = typeof FINISH_IDS[number];
export type LegacyFinishId = 'ceramic' | 'metallic';
export type KnownFinishId = FinishId | LegacyFinishId;
export type MaterialParams = { finish: KnownFinishId; color: string };

export type FinishTextureStyle = 'clay' | 'fine' | 'glaze' | 'orange-peel' | 'brush';

export type FinishDefinition = {
  id: KnownFinishId;
  label: string;
  color: string;
  roughness: number;
  metalness: 0;
  clearcoat: number;
  clearcoatRoughness: number;
  normalScale: number;
  roughnessVariation: number;
  textureRepeat: number;
  textureStyle: FinishTextureStyle;
  preview: string;
  hidden?: boolean;
};
export type VisibleFinishDefinition = Omit<FinishDefinition, 'id' | 'hidden'> & { id: FinishId };

export const FINISH_DEFINITIONS: Record<KnownFinishId, FinishDefinition> = {
  raw_clay: {
    id: 'raw_clay', label: 'Terracotta', color: '#BE734F', roughness: 0.88, metalness: 0,
    clearcoat: 0, clearcoatRoughness: 1, normalScale: 0.32, roughnessVariation: 0.12,
    textureRepeat: 10, textureStyle: 'clay',
    preview: 'radial-gradient(circle at 32% 28%, #E5A381 0 7%, #BE734F 28%, #81452F 100%)',
  },
  matte: {
    id: 'matte', label: 'Matte', color: '#8B7355', roughness: 0.72, metalness: 0,
    clearcoat: 0.04, clearcoatRoughness: 0.6, normalScale: 0.07, roughnessVariation: 0.05,
    textureRepeat: 14, textureStyle: 'fine',
    preview: 'radial-gradient(circle at 32% 28%, #A99374 0 10%, #8B7355 38%, #65533D 100%)',
  },
  glazed: {
    id: 'glazed', label: 'Glossy', color: '#D4A574', roughness: 0.2, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.08, normalScale: 0.035, roughnessVariation: 0.025,
    textureRepeat: 18, textureStyle: 'glaze',
    preview: 'radial-gradient(circle at 30% 22%, #FFF 0 8%, #EBC9A5 9% 18%, #D4A574 42%, #976C47 100%)',
  },
  acrylic_paint: {
    id: 'acrylic_paint', label: 'Acrylic Paint', color: '#E85D75', roughness: 0.38, metalness: 0,
    clearcoat: 0.25, clearcoatRoughness: 0.25, normalScale: 0.12, roughnessVariation: 0.07,
    textureRepeat: 16, textureStyle: 'orange-peel',
    preview: 'radial-gradient(circle at 30% 24%, #FFB0BD 0 7%, #E85D75 23%, #A92F4A 100%)',
  },
  water_paint: {
    id: 'water_paint', label: 'Water Paint', color: '#5B9BD5', roughness: 0.65, metalness: 0,
    clearcoat: 0.03, clearcoatRoughness: 0.7, normalScale: 0.1, roughnessVariation: 0.09,
    textureRepeat: 8, textureStyle: 'brush',
    preview: 'linear-gradient(120deg, #83B7E2 0 22%, #4C8CC5 23% 28%, #6AA5D8 29% 55%, #3F7FB7 56% 61%, #5B9BD5 62%)',
  },
  ceramic: {
    id: 'ceramic', label: 'Ceramic', color: '#C65A2E', roughness: 0.42, metalness: 0,
    clearcoat: 0.35, clearcoatRoughness: 0.22, normalScale: 0.05, roughnessVariation: 0.04,
    textureRepeat: 16, textureStyle: 'fine', preview: '#C65A2E', hidden: true,
  },
  metallic: {
    id: 'metallic', label: 'Metallic', color: '#8A8178', roughness: 0.34, metalness: 0,
    clearcoat: 0.65, clearcoatRoughness: 0.16, normalScale: 0.05, roughnessVariation: 0.04,
    textureRepeat: 16, textureStyle: 'fine', preview: '#8A8178', hidden: true,
  },
};

export const FINISHES: VisibleFinishDefinition[] = FINISH_IDS.map((id) => FINISH_DEFINITIONS[id] as VisibleFinishDefinition);

export const SHOP_FINISHES: Record<string, FinishId[]> = {
  'Princess Michael Pottery': ['raw_clay', 'matte', 'glazed'],
  "Maria's Pots Jars & General Merchandise": ['raw_clay', 'acrylic_paint'],
  'Sosima Gomez Pottery': ['raw_clay'],
  'Regala Pottery': ['raw_clay', 'glazed', 'water_paint'],
  'Apung Dong Pottery': ['raw_clay'],
};

export const MATERIAL_COLORS = [
  '#BE734F', '#A0522D', '#8B4513', '#D2691E', '#CD853F', '#DEB887',
  '#B8860B', '#DAA520', '#F4A460', '#E8C39E', '#2E8B57', '#3CB371',
  '#66CDAA', '#8FBC8F', '#228B22', '#006400', '#556B2F', '#6B8E23',
  '#4682B4', '#5F9EA0', '#87CEEB', '#4169E1', '#1E90FF', '#0000CD',
  '#8B0000', '#B22222', '#DC143C', '#FF6347', '#FF4500', '#FF8C00',
  '#FFD700', '#FFFFFF',
];

export function normalizeFinishId(value: unknown): KnownFinishId {
  return typeof value === 'string' && value in FINISH_DEFINITIONS ? value as KnownFinishId : 'raw_clay';
}

export function isFinishId(value: unknown): value is FinishId {
  return typeof value === 'string' && FINISH_IDS.includes(value as FinishId);
}

export function normalizeMaterialParams(value: Partial<{ finish: unknown; color: unknown }> | null | undefined): MaterialParams {
  const finish = normalizeFinishId(value?.finish);
  const color = typeof value?.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)
    ? value.color.toUpperCase()
    : FINISH_DEFINITIONS[finish].color;
  return { finish, color };
}

export function getFinishDefinition(value: unknown): FinishDefinition {
  return FINISH_DEFINITIONS[normalizeFinishId(value)];
}

export function getAvailableFinishes(shopName?: string) {
  const allowed = shopName ? SHOP_FINISHES[shopName] : undefined;
  return allowed ? FINISHES.filter((finish) => allowed.includes(finish.id as FinishId)) : [...FINISHES];
}
