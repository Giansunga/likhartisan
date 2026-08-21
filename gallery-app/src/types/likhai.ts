export type LikhAIIntent = 'order' | 'product' | 'shop' | 'freeform' | 'checkout' | 'shipping' | 'returns' | 'account' | 'general';
export type LikhAIGroundingStatus = 'grounded' | 'partial' | 'unavailable';
export type LikhAIGenerationStatus = 'generated' | 'fallback';
export type LikhAIResolution = {
  state: 'resolved' | 'action_needed' | 'clarify' | 'sign_in' | 'unavailable';
  label: string;
};

export type LikhAIOrderCard = {
  type: 'order'; id: string; shortId: string; status: string; deliveryStatus: string;
  total: number; createdAt: string; itemCount: number; image?: string | null;
  productName?: string | null; href: string;
  paymentStatus?: string | null; deliveryOption?: string | null; deliveryProvider?: string | null;
  trackingNumber?: string | null; estimatedDelivery?: string | null; deliveryNotes?: string | null;
  cancellationEligible?: boolean; returnStatus?: string | null;
  returnEligibility?: 'eligible' | 'not_yet' | 'expired' | 'active' | 'unknown';
};

export type LikhAIProductCard = {
  type: 'product'; id: string; name: string; category?: string; materials?: string;
  price: number; image?: string; stock: number; href: string;
};

export type LikhAIShopCard = {
  type: 'shop'; id: string; name: string; description?: string; location?: string; href: string;
};

export type LikhAICard = LikhAIOrderCard | LikhAIProductCard | LikhAIShopCard;
export type LikhAIAction = { id: string; label: string; href: string };

export type LikhAIResponse = {
  responseId: string; reply: string; intent: LikhAIIntent; groundingStatus: LikhAIGroundingStatus;
  generationStatus: LikhAIGenerationStatus;
  cards: LikhAICard[]; actions: LikhAIAction[]; suggestions: string[]; requiresAuth: boolean;
  resolution?: LikhAIResolution;
};

export type LikhAIMessage = {
  id: string; role: 'user' | 'assistant'; content: string; timestamp: string;
  responseId?: string; groundingStatus?: LikhAIGroundingStatus; cards?: LikhAICard[];
  generationStatus?: LikhAIGenerationStatus;
  resolution?: LikhAIResolution;
  actions?: LikhAIAction[]; suggestions?: string[]; rating?: 'positive' | 'negative';
  errorKind?: 'auth' | 'auth-unavailable' | 'rate-limit' | 'provider' | 'connection';
  retryText?: string;
};
