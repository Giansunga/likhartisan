import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface LandingCounts { artisanCount: number | null; potteryCount: number | null }
let channelSequence = 0;

export function useLandingCounts() {
  const [counts, setCounts] = useState<LandingCounts>({ artisanCount: null, potteryCount: null });
  useEffect(() => {
    let active = true;
    let request = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const currentRequest = ++request;
      const results = await Promise.allSettled([
        supabase.from('artisans').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ]);
      if (!active || currentRequest !== request) return;
      setCounts(previous => {
        const next = { ...previous };
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && !result.value.error && typeof result.value.count === 'number' && result.value.count >= 0) {
            next[index === 0 ? 'artisanCount' : 'potteryCount'] = result.value.count;
          }
        });
        return next;
      });
    };
    const scheduleRefresh = () => {
      if (!active) return;
      // An event invalidates an older request immediately, before the debounce fires.
      request++;
      clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, 200);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleRefresh(); };
    // Fresh topics avoid reusing a subscribed channel during StrictMode cleanup.
    const channel = supabase.channel(`landing-counts-${++channelSequence}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'artisans' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, scheduleRefresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') scheduleRefresh(); });
    void refresh();
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      request++;
      clearTimeout(timer);
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);
  return counts;
}
