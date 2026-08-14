import { createContext } from 'react';
import type { LikhAIMessage } from '../types/likhai';

export type LikhAIContextValue = {
  messages: LikhAIMessage[];
  loading: boolean;
  sendMessage: (text: string) => Promise<void>;
  rateMessage: (messageId: string, rating: 'positive' | 'negative') => Promise<void>;
  clearConversation: () => void;
};

export const LikhAIContext = createContext<LikhAIContextValue | null>(null);
