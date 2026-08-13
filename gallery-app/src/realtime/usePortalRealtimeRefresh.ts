import { useEffect, useMemo, useRef } from 'react';
import { usePortalRealtime } from './PortalRealtimeProvider';

export function usePortalRealtimeRefresh(
  tables: readonly string[],
  refresh: () => void | Promise<void>,
  debounceMs = 120,
) {
  const realtime = usePortalRealtime();
  const subscribe = realtime?.subscribe;
  const connectedEpoch = realtime?.connectedEpoch;
  const refreshRef = useRef(refresh);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableKey = useMemo(() => [...new Set(tables)].sort().join('|'), [tables]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void refreshRef.current();
      }, debounceMs);
    };

    const acceptedTables = new Set(tableKey.split('|').filter(Boolean));
    const unsubscribe = subscribe?.(event => {
      if (acceptedTables.has(event.table)) scheduleRefresh();
    });

    const handleFocus = () => scheduleRefresh();
    window.addEventListener('focus', handleFocus);

    return () => {
      unsubscribe?.();
      window.removeEventListener('focus', handleFocus);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [debounceMs, subscribe, tableKey]);

  useEffect(() => {
    if (!connectedEpoch) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void refreshRef.current();
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [connectedEpoch, debounceMs]);
}
