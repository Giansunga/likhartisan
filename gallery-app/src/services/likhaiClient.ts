import { API_BASE } from '../lib/api';
import type { LikhAIMessage, LikhAIResponse } from '../types/likhai';

export class LikhAIRequestError extends Error {
  kind: 'auth' | 'auth-unavailable' | 'rate-limit' | 'provider' | 'connection';
  code?: string;
  constructor(message: string, kind: LikhAIRequestError['kind'], code?: string) {
    super(message); this.name = 'LikhAIRequestError'; this.kind = kind; this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

async function responseJson(response: Response) {
  try { return await response.json(); } catch { return {}; }
}

export async function requestLikhAI(
  message: string,
  history: LikhAIMessage[],
  accessToken?: string,
  options: { authRetryCount?: number } = {},
): Promise<LikhAIResponse> {
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API_BASE}/api/chatbot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.authRetryCount ? { 'X-LikhAI-Auth-Retry': String(options.authRetryCount) } : {}),
      },
      body: JSON.stringify({ message, history: history.slice(-20).map(item => ({ role: item.role, content: item.content })) }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LikhAIRequestError('LikhAI could not finish that request. Your message is saved; please retry in a moment.', 'connection');
    }
    throw new LikhAIRequestError('I could not connect to LikhAI. Check your connection and try again.', 'connection');
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await responseJson(response);
  if (!response.ok) {
    const code = typeof data.code === 'string' ? data.code : undefined;
    const kind = response.status === 401 || code === 'AUTH_SESSION_INVALID'
      ? 'auth'
      : code === 'AUTH_VERIFICATION_UNAVAILABLE' || code === 'AUTH_CONFIGURATION_INVALID'
        ? 'auth-unavailable'
        : response.status === 429 ? 'rate-limit' : 'provider';
    const fallback = kind === 'auth'
      ? 'Your session has expired. Please sign in again before asking about account information.'
      : kind === 'auth-unavailable'
        ? 'I could not verify your signed-in session right now. Your message is saved; please retry in a moment.'
      : kind === 'rate-limit' ? 'LikhAI is receiving many requests. Please wait a moment and try again.'
        : 'LikhAI is temporarily unavailable. Please try again shortly.';
    throw new LikhAIRequestError(typeof data.error === 'string' ? data.error : fallback, kind, code);
  }
  return data as LikhAIResponse;
}

export async function submitLikhAIFeedback(responseId: string, rating: 'positive' | 'negative') {
  const response = await fetch(`${API_BASE}/api/chatbot/feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responseId, rating }),
  });
  if (!response.ok) throw new Error('Could not save feedback');
}
