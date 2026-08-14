export type LikhAIIntent = 'order' | 'product' | 'shop' | 'freeform' | 'checkout' | 'shipping' | 'returns' | 'account' | 'general';
export type LikhAIGroundingStatus = 'grounded' | 'partial' | 'unavailable';

export type LikhAIOrderCard = {
  type: 'order'; id: string; shortId: string; status: string; deliveryStatus: string;
  total: number; createdAt: string; itemCount: number; image?: string | null;
  productName?: string | null; href: string;
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
  cards: LikhAICard[]; actions: LikhAIAction[]; suggestions: string[]; requiresAuth: boolean;
};

export type LikhAIMessage = {
  id: string; role: 'user' | 'assistant'; content: string; timestamp: string;
  responseId?: string; groundingStatus?: LikhAIGroundingStatus; cards?: LikhAICard[];
  actions?: LikhAIAction[]; suggestions?: string[]; rating?: 'positive' | 'negative';
  errorKind?: 'auth' | 'rate-limit' | 'provider' | 'connection';
};
