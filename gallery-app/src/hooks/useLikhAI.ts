import { useContext } from 'react';
import { LikhAIContext } from '../contexts/likhai-context';

export function useLikhAI() {
  const value = useContext(LikhAIContext);
  if (!value) throw new Error('useLikhAI must be used inside LikhAIProvider');
  return value;
}
