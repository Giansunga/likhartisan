import { API_BASE } from '../lib/api';
import type { LikhAIMessage, LikhAIResponse } from '../types/likhai';

export class LikhAIRequestError extends Error {
  kind: 'auth' | 'rate-limit' | 'provider' | 'connection';
  constructor(message: string, kind: LikhAIRequestError['kind']) {
    super(message); this.name = 'LikhAIRequestError'; this.kind = kind;
  }
}

async function responseJson(response: Response) {
  try { return await response.json(); } catch { return {}; }
}

export async function requestLikhAI(message: string, history: LikhAIMessage[], accessToken?: string): Promise<LikhAIResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/chatbot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ message, history: history.slice(-20).map(item => ({ role: item.role, content: item.content })) }),
    });
  } catch {
    throw new LikhAIRequestError('I could not connect to LikhAI. Check your connection and try again.', 'connection');
  }

  const data = await responseJson(response);
  if (!response.ok) {
    const kind = response.status === 401 ? 'auth' : response.status === 429 ? 'rate-limit' : 'provider';
    const fallback = kind === 'auth'
      ? 'Your session has expired. Please sign in again before asking about account information.'
      : kind === 'rate-limit' ? 'LikhAI is receiving many requests. Please wait a moment and try again.'
        : 'LikhAI is temporarily unavailable. Please try again shortly.';
    throw new LikhAIRequestError(typeof data.error === 'string' ? data.error : fallback, kind);
  }
  return data as LikhAIResponse;
}

export async function submitLikhAIFeedback(responseId: string, rating: 'positive' | 'negative') {
  const response = await fetch(`${API_BASE}/api/chatbot/feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responseId, rating }),
  });
  if (!response.ok) throw new Error('Could not save feedback');
}
