import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { purchaseApi } from '../lib/purchaseApi';
import type { PurchaseListResponse } from '../types/purchases';

const EMPTY: PurchaseListResponse = { orders: [], statusCounts: { all: 0, 'to-pay': 0, 'to-ship': 0, 'to-receive': 0, completed: 0, 'return-refund': 0, cancelled: 0 }, pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } };

export function usePurchases(userId: string | undefined, query: string, authLoading = false) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | undefined>(undefined);
  const load = useCallback(async (quiet = false) => {
    if (!userId) {
      abortRef.current?.abort();
      setData(EMPTY);
      setError('');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    abortRef.current?.abort();
    if (authLoading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try { setData(await purchaseApi<PurchaseListResponse>(`?${query}`, {}, controller.signal)); }
    catch (e) { if ((e as Error).name !== 'AbortError') setError((e as Error).message); }
    finally { if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); } }
  }, [authLoading, query, userId]);
  // Fetching is the external synchronization performed by this hook.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); return () => abortRef.current?.abort(); }, [load]);
  useEffect(() => {
    if (!userId || authLoading) return;
    let timer: ReturnType<typeof setTimeout>;
    const channel = supabase.channel(`purchase-center:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` }, () => {
      clearTimeout(timer); timer = setTimeout(() => void load(true), 250);
    }).subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [authLoading, load, userId]);
  return { data, loading, refreshing, error, reload: () => load(true) };
}
