import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionAccessError } from '../../lib/authSession';
import { LikhAIRequestError, requestLikhAI } from '../likhaiClient';
import { requestLikhAIWithSession } from '../likhaiAuthenticatedRequest';

vi.mock('../likhaiClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../likhaiClient')>();
  return { ...actual, requestLikhAI: vi.fn() };
});

const response = {
  responseId: 'response-id', reply: 'Verified reply', intent: 'order' as const, groundingStatus: 'grounded' as const,
  generationStatus: 'generated' as const, cards: [], actions: [], suggestions: [], requiresAuth: false,
};

describe('authenticated LIKHAI requests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the current access token for a signed-in request', async () => {
    vi.mocked(requestLikhAI).mockResolvedValue(response);
    const getAccessToken = vi.fn().mockResolvedValue('current-token');
    await expect(requestLikhAIWithSession({ message: 'Track my order', history: [], signedIn: true, getAccessToken })).resolves.toEqual(response);
    expect(requestLikhAI).toHaveBeenCalledWith('Track my order', [], 'current-token');
  });

  it('refreshes once and retries the preserved request after a confirmed 401', async () => {
    vi.mocked(requestLikhAI)
      .mockRejectedValueOnce(new LikhAIRequestError('Expired', 'auth', 'AUTH_SESSION_INVALID'))
      .mockResolvedValueOnce(response);
    const getAccessToken = vi.fn()
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('new-token');

    await requestLikhAIWithSession({ message: 'Track my order', history: [], signedIn: true, getAccessToken });

    expect(getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(requestLikhAI).toHaveBeenNthCalledWith(2, 'Track my order', [], 'new-token', { authRetryCount: 1 });
  });

  it('keeps a temporary session verification failure retryable', async () => {
    const getAccessToken = vi.fn().mockRejectedValue(new SessionAccessError('Unavailable', 'unavailable'));
    await expect(requestLikhAIWithSession({ message: 'Track my order', history: [], signedIn: true, getAccessToken }))
      .rejects.toMatchObject({ kind: 'auth-unavailable', code: 'AUTH_VERIFICATION_UNAVAILABLE' });
  });

  it('reports sign-in only after the saved session is confirmed invalid', async () => {
    const getAccessToken = vi.fn().mockRejectedValue(new SessionAccessError('Invalid', 'invalid'));
    await expect(requestLikhAIWithSession({ message: 'Track my order', history: [], signedIn: true, getAccessToken }))
      .rejects.toMatchObject({ kind: 'auth', code: 'AUTH_SESSION_INVALID' });
  });
});
