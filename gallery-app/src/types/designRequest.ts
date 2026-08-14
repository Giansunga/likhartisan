import { normalizeAttachmentSelections, type AttachmentSelection } from '../components/freeform/attachments';
import type { DecorationParams } from '../components/freeform/decor';
import { normalizeMaterialParams, type MaterialParams } from '../components/freeform/materials';

export type DesignRequestStatus = 'pending' | 'changes_requested' | 'quoted' | 'declined' | 'approved';

export type DesignShapeParams = {
  height: number;
  bodyWidth: number;
  neckWidth: number;
  rimSize: number;
  curvature: number;
};

export interface DesignRequestSnapshotV1 {
  version: 1;
  model: { id: string | null; name: string; file: string; thumbnail: string; category: string };
  shape: DesignShapeParams;
  material: MaterialParams;
  decoration: DecorationParams;
  attachments: AttachmentSelection[];
  dimensions: { heightCm: number; widthCm: number };
  estimate: { price: number; productionDays: number };
}

export interface DesignRequest {
  id: string;
  client_token: string;
  buyer_id: string;
  shop_id: string;
  conversation_id: string | null;
  design_snapshot: DesignRequestSnapshotV1;
  quantity: number;
  buyer_note: string;
  status: DesignRequestStatus;
  quoted_price: number | null;
  lead_time_days: number | null;
  shop_response: string;
  responded_at: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  current_revision: number;
  buyer_name?: string;
}

export interface DesignRequestRevision {
  id: string;
  request_id: string;
  revision_number: number;
  client_token: string;
  design_snapshot: DesignRequestSnapshotV1;
  quantity: number;
  buyer_note: string;
  created_by: string;
  created_at: string;
}

export type DesignRequestEventType =
  | 'submitted' | 'changes_requested' | 'revised' | 'quoted' | 'declined'
  | 'approved' | 'payment_verified' | 'production_updated';

export interface DesignRequestEvent {
  id: string;
  request_id: string;
  actor_id: string | null;
  actor_role: 'buyer' | 'shop' | 'system' | 'admin';
  event_type: DesignRequestEventType;
  revision_number: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface DesignRequestOrderSummary {
  id: string;
  status: string;
  payment_status: string;
  delivery_status: string;
  total: number;
  checkout_session_id: string | null;
  order_type: string;
}

export type DesignRequestStage =
  | 'needs_response' | 'awaiting_buyer' | 'revision_requested' | 'declined'
  | 'payment_pending' | 'ready_for_production' | 'in_production' | 'shipped'
  | 'delivered' | 'completed' | 'cancelled';

export interface DesignRequestQueueItem extends DesignRequest {
  buyer_name: string;
  order: DesignRequestOrderSummary | null;
  stage: DesignRequestStage;
}

export interface DesignRequestMessagePayload {
  type: 'design_request' | 'design_request_update';
  version: 1;
  request_id: string;
  message: string;
  status?: DesignRequestStatus;
  summary?: { model?: string; color?: string; finish?: string; quantity?: number; status?: DesignRequestStatus };
  quoted_price?: number | null;
  lead_time_days?: number | null;
  shop_response?: string;
  order_id?: string;
  revision_number?: number;
  event_type?: DesignRequestEventType;
}

export function isDesignRequestMessage(value: unknown): value is DesignRequestMessagePayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (record.type === 'design_request' || record.type === 'design_request_update')
    && record.version === 1 && typeof record.request_id === 'string';
}

export const REQUEST_STATUS_LABELS: Record<DesignRequestStatus, string> = {
  pending: 'Pending', changes_requested: 'Changes Requested', quoted: 'Quoted', declined: 'Declined', approved: 'Approved',
};

export function createDesignRequestSnapshot(input: Omit<DesignRequestSnapshotV1, 'version'>): DesignRequestSnapshotV1 {
  return {
    version: 1,
    model: { ...input.model },
    shape: { ...input.shape },
    material: normalizeMaterialParams(input.material),
    decoration: { ...input.decoration },
    attachments: normalizeAttachmentSelections(input.attachments),
    dimensions: { ...input.dimensions },
    estimate: { ...input.estimate },
  };
}
