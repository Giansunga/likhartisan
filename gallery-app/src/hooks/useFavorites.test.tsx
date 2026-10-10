import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FAVORITES_KEY } from '../lib/utils';
import { useFavorites } from './useFavorites';

describe('shared local favorites', () => {
  beforeEach(() => localStorage.clear());
  it('shares guest state between consumers, preserves other ids, and restores on remount', () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(['saved']));
    const gallery = renderHook(useFavorites); const detail = renderHook(useFavorites);
    act(() => detail.result.current.toggleFavorite('new'));
    expect(gallery.result.current.favorites).toEqual(['saved', 'new']);
    act(() => gallery.result.current.toggleFavorite('saved'));
    expect(detail.result.current.favorites).toEqual(['new']);
    detail.unmount(); expect(renderHook(useFavorites).result.current.favorites).toEqual(['new']);
  });
  it('synchronizes storage events, clearing and malformed stored values', () => {
    const { result } = renderHook(useFavorites);
    act(() => { localStorage.setItem(FAVORITES_KEY, JSON.stringify(['other-tab'])); window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_KEY })); });
    expect(result.current.favorites).toEqual(['other-tab']);
    act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', { key: null })); });
    expect(result.current.favorites).toEqual([]);
    localStorage.setItem(FAVORITES_KEY, '{}'); expect(renderHook(useFavorites).result.current.favorites).toEqual([]);
  });
});
