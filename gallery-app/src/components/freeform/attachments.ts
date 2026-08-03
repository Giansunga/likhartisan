export type AttachmentType = 'handle' | 'lid' | 'spout' | 'foot' | 'knob' | 'other';
export type AttachmentSide = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface AttachmentParams {
  id: string;
  name: string;
  type: AttachmentType;
  fileUrl: string;
  thumbnail?: string;
  anchorSide: AttachmentSide;
  anchorHeight: number;
  rotation: number;
  scale: number;
  priceAdjustment: number;
  productionDaysAdjustment: number;
}

export interface AttachmentRecord {
  id: string;
  name: string;
  attachment_type: AttachmentType;
  file_url: string;
  thumbnail: string | null;
  compatible_categories: string[] | null;
  anchor_side: AttachmentSide;
  anchor_height: number;
  rotation: number;
  scale: number;
  price_adjustment: number;
  production_days_adjustment: number;
}

export function toAttachmentParams(item: AttachmentRecord): AttachmentParams {
  return {
    id: item.id,
    name: item.name,
    type: item.attachment_type,
    fileUrl: item.file_url,
    thumbnail: item.thumbnail || '',
    anchorSide: item.anchor_side || 'right',
    anchorHeight: Number(item.anchor_height ?? 0.5),
    rotation: Number(item.rotation ?? 0),
    scale: Number(item.scale ?? 1),
    priceAdjustment: Number(item.price_adjustment ?? 0),
    productionDaysAdjustment: Number(item.production_days_adjustment ?? 0),
  };
}
