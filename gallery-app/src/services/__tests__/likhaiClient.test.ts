import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLikhAI } from '../likhaiClient';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('requestLikhAI', () => {
  it('censors prompt, history, reply and suggestions before transport and display', async () => {
    const fetchMock = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({reply:'shit', suggestions:['gago'], resolution:{state:'clarify',label:'puta'}}),{status:200}));
    const result = await requestLikhAI('puta', [{id:'1',role:'user',content:'shit',timestamp:''}]);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({message:'****',history:[{content:'****'}]});
    expect(result).toMatchObject({reply:'****',suggestions:['****'],resolution:{label:'****'}});
  });
  it('sends the bearer token and prior history without a body user ID', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      responseId: 'response-id', reply: 'Verified reply', intent: 'order', groundingStatus: 'grounded',
      cards: [], actions: [], suggestions: [], requiresAuth: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await requestLikhAI('Track my order', [{ id: '1', role: 'assistant', content: 'Hello', timestamp: new Date().toISOString() }], 'access-token');
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
    const body = JSON.parse(String(init?.body));
    expect(body.userId).toBeUndefined();
    expect(body.message).toBe('Track my order');
    expect(body.history).toEqual([{ role: 'assistant', content: 'Hello' }]);
  });

  it('turns an unauthorized response into an auth-specific error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Session expired', code: 'AUTH_SESSION_INVALID' }), { status: 401 }));
    await expect(requestLikhAI('Track my order', [])).rejects.toMatchObject({ kind: 'auth', code: 'AUTH_SESSION_INVALID' });
  });

  it('keeps temporary authentication verification failures retryable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: 'Verification unavailable', code: 'AUTH_VERIFICATION_UNAVAILABLE',
    }), { status: 503 }));
    await expect(requestLikhAI('Track my order', [])).rejects.toMatchObject({ kind: 'auth-unavailable' });
  });

  it('keeps rejected backend authentication configuration retryable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: 'Verification unavailable', code: 'AUTH_CONFIGURATION_INVALID',
    }), { status: 503 }));
    await expect(requestLikhAI('Track my order', [])).rejects.toMatchObject({
      kind: 'auth-unavailable', code: 'AUTH_CONFIGURATION_INVALID',
    });
  });

  it('marks the one allowed authentication retry without exposing session data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      responseId: 'response-id', reply: 'Verified reply', intent: 'order', groundingStatus: 'grounded',
      generationStatus: 'generated', cards: [], actions: [], suggestions: [], requiresAuth: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await requestLikhAI('Track my order', [], 'new-token', { authRetryCount: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>)['X-LikhAI-Auth-Retry']).toBe('1');
  });

  it('aborts stalled requests after the frontend timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    const request = expect(requestLikhAI('Shipping info', [])).rejects.toMatchObject({ kind: 'connection' });
    await vi.advanceTimersByTimeAsync(15_000);
    await request;
  });
});
