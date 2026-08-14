export type PurchaseStatus = 'all' | 'to-pay' | 'to-ship' | 'to-receive' | 'completed' | 'return-refund' | 'cancelled';

export interface PurchaseItem {
  index: number;
  productId: string;
  variationId: string;
  productName: string;
  image: string;
  quantity: number;
  price: number;
  dimensions?: string;
  variation?: string;
  shopId: string;
  shopName: string;
}

export interface ReturnRequest {
  id: string;
  order_id: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'refunded' | 'closed';
  reason: string;
  requested_resolution: 'refund' | 'replacement';
  description?: string;
  resolution_note?: string | null;
  submitted_at?: string | null;
  order_return_items?: Array<{ item_index: number; quantity: number }>;
  order_return_evidence?: Array<{ id: string; signedUrl?: string }>;
}

export interface PurchaseSummary {
  id: string;
  shortId: string;
  items: PurchaseItem[];
  shops: Array<{ id: string; name: string }>;
  subtotal: number;
  shippingFee: number;
  total: number;
  status: Exclude<PurchaseStatus, 'all'>;
  paymentStatus: string;
  deliveryStatus: string;
  deliveryOption: string;
  deliveryProvider: string;
  trackingNumber: string;
  estimatedDelivery: string;
  checkoutSessionId: string;
  orderType?: string;
  designRequestId?: string;
  createdAt: string;
  activeReturn: ReturnRequest | null;
}

export interface OrderActivity { id: string; label: string; actionType: string; createdAt: string; }
export interface PurchaseDetail extends PurchaseSummary {
  activity: OrderActivity[];
  returnRequest: ReturnRequest | null;
  returnEligibility: { eligible: boolean; reason: string; deadline: string | null };
}
export type PurchaseStatusCounts = Record<PurchaseStatus, number>;
export interface PurchaseListResponse {
  orders: PurchaseSummary[];
  statusCounts: PurchaseStatusCounts;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface ReorderPlan {
  available: Array<{ productId: string; variationId?: string; productName: string; image: string; price: number; qty: number; shopId: string; shopName: string; variation?: string }>;
  unavailable: Array<{ productName: string; reason: string }>;
}
