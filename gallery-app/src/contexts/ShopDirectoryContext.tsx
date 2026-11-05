import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export interface PublicShop {
  id: string;
  name: string;
  description: string | null;
  banner: string | null;
  image: string | null;
  location: string | null;
}

type DirectoryState = {
  shops: PublicShop[];
  status: 'idle' | 'loading' | 'ready' | 'error';
};
const initialState: DirectoryState = { shops: [], status: 'idle' };
const ShopDirectoryContext = createContext({
  ...initialState,
  ensureLoaded: () => {},
  retry: () => {},
});

export function ShopDirectoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DirectoryState>(initialState);
  const request = useRef<AbortController | null>(null);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    if (loaded.current || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState({ shops: [], status: 'loading' });
    try {
      const shops: PublicShop[] = [];
      const batchSize = 500;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.from('shops')
          .select('id, name, description, banner, image, location')
          .order('name').order('id')
          .range(offset, offset + batchSize - 1)
          .abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error) throw error;
        shops.push(...(data ?? []).filter(shop => shop.name?.trim()));
        hasMore = (data?.length ?? 0) === batchSize;
        offset += batchSize;
      }
      loaded.current = true;
      setState({ shops, status: 'ready' });
    } catch {
      if (!controller.signal.aborted) setState({ shops: [], status: 'error' });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, []);

  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  const ensureLoaded = useCallback(() => { void load(); }, [load]);
  const value = useMemo(() => ({ ...state, ensureLoaded, retry: ensureLoaded }), [state, ensureLoaded]);
  return <ShopDirectoryContext.Provider value={value}>{children}</ShopDirectoryContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useShopDirectory() { return useContext(ShopDirectoryContext); }
