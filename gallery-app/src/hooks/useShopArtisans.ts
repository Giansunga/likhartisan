import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { FeaturedArtisan } from '../lib/featuredArtisan';

export function useShopArtisans(shopId: string) {
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ shopId, attempt }), [shopId, attempt]);
  const [state, setState] = useState<{ request: typeof request | null; artisans: FeaturedArtisan[]; error: string }>({ request: null, artisans: [], error: '' });
  useEffect(() => {
    let active = true;
    if (!shopId) return;
    void (async () => {
      try {
        const { data, error } = await supabase.from('artisans').select('id, shop_id, name, specialty').eq('shop_id', shopId).order('name');
        if (error) throw error;
        if (active) setState({ request, artisans: data ?? [], error: '' });
      } catch {
        if (active) setState({ request, artisans: [], error: 'Could not load artisans. Please try again.' });
      }
    })();
    return () => { active = false; };
  }, [shopId, request]);
  const current = state.request === request;
  return {
    artisans: current ? state.artisans : [],
    loading: Boolean(shopId) && !current,
    error: current ? state.error : '',
    retry: () => setAttempt(value => value + 1),
  };
}
