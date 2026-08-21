import type { LikhAIMessage, LikhAIResponse } from '../types/likhai';
import { SessionAccessError } from '../lib/authSession';
import { LikhAIRequestError, requestLikhAI } from './likhaiClient';

type GetAccessToken = (options?: { forceRefresh?: boolean }) => Promise<string | null>;

function sessionRequestError(error: unknown) {
  if (error instanceof LikhAIRequestError) return error;
  if (error instanceof SessionAccessError) {
    return error.kind === 'invalid'
      ? new LikhAIRequestError('Your session is invalid or expired. Please sign in again.', 'auth', 'AUTH_SESSION_INVALID')
      : new LikhAIRequestError(
        'I could not verify your signed-in session right now. Your message is saved; please retry in a moment.',
        'auth-unavailable',
        'AUTH_VERIFICATION_UNAVAILABLE',
      );
  }
  return new LikhAIRequestError(
    'I could not verify your signed-in session right now. Your message is saved; please retry in a moment.',
    'auth-unavailable',
    'AUTH_VERIFICATION_UNAVAILABLE',
  );
}

export async function requestLikhAIWithSession({
  message,
  history,
  signedIn,
  getAccessToken,
}: {
  message: string;
  history: LikhAIMessage[];
  signedIn: boolean;
  getAccessToken: GetAccessToken;
}): Promise<LikhAIResponse> {
  let token: string | null;
  try {
    token = await getAccessToken();
  } catch (error) {
    throw sessionRequestError(error);
  }
  if (signedIn && !token) {
    throw new LikhAIRequestError('Your session is invalid or expired. Please sign in again.', 'auth', 'AUTH_SESSION_INVALID');
  }

  try {
    return await requestLikhAI(message, history, token || undefined);
  } catch (error) {
    if (!(error instanceof LikhAIRequestError) || error.kind !== 'auth') throw error;
  }

  try {
    token = await getAccessToken({ forceRefresh: true });
  } catch (error) {
    throw sessionRequestError(error);
  }
  if (!token) {
    throw new LikhAIRequestError('Your session is invalid or expired. Please sign in again.', 'auth', 'AUTH_SESSION_INVALID');
  }
  return requestLikhAI(message, history, token, { authRetryCount: 1 });
}
