import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttachmentCatalog } from '../useAttachmentCatalog';

const mock = vi.hoisted(() => ({ fail: false, from: vi.fn() }));
vi.mock('../../../lib/supabase', () => ({ supabase: { from: mock.from } }));

describe('attachment catalog loading', () => {
  beforeEach(() => {
    mock.fail = false;
    mock.from.mockClear();
    mock.from.mockImplementation((table: string) => {
      const query = { select: () => query, eq: () => query, order: () => query,
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          (mock.fail ? Promise.reject(new Error('offline')) : Promise.resolve({ error: null, data: table === 'generated_attachment_catalog_settings'
            ? [{ recipe_key: 'bamboo-loop', active: true, default_price: 100, default_production_days: 1 }] : [] })).then(resolve, reject) };
      return query;
    });
  });
  it('distinguishes network failure from an empty catalog and supports retry', async () => {
    mock.fail = true;
    const { result } = renderHook(() => useAttachmentCatalog('shop-1'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/retained/);
    mock.fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.assets[0].recipe.key).toBe('bamboo-loop');
  });
  it('does not fetch until enabled and invalidates the previous shop immediately', async () => {
    const { result, rerender } = renderHook(({ shop, enabled }) => useAttachmentCatalog(shop, enabled), { initialProps: { shop: 'a', enabled: false } });
    expect(mock.from).not.toHaveBeenCalled();
    rerender({ shop: 'a', enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ shop: 'b', enabled: false });
    expect(result.current.status).toBe('pending');
    expect(result.current.assets).toEqual([]);
  });
});
