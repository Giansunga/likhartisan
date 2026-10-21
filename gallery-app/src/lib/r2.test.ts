import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadToR2 } from './r2';
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
beforeEach(() => { mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } }); });
afterEach(() => vi.unstubAllGlobals());
describe('product upload transport', () => {
  it('preserves the admin endpoint and adds verified-session shop context only for artisan uploads', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ publicUrl: 'https://files.example/pot.glb' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['model'], 'pot.glb');
    await uploadToR2(file, 'models');
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/\/api\/upload\/file$/), expect.objectContaining({ headers: expect.not.objectContaining({ 'X-Shop-Id': expect.anything() }) }));
    await uploadToR2(file, 'models', { shopId: 'own-shop' });
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/\/api\/upload\/product-file$/), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token', 'X-Shop-Id': 'own-shop' }), body: file }));
  });
  it('does not upload without a session and propagates API errors', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(uploadToR2(new File(['x'], 'pot.png'), 'products')).rejects.toThrow('signed in'); expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Not your shop' }) });
    await expect(uploadToR2(new File(['x'], 'pot.png'), 'products', { shopId: 'other-shop' })).rejects.toThrow('Not your shop');
  });
});
