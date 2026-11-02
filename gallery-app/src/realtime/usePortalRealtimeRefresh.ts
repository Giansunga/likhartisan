import { useEffect, useMemo, useRef } from 'react';
import { usePortalRealtime } from './PortalRealtimeProvider';
import { captureException } from '../lib/sentry';

export function usePortalRealtimeRefresh(
  tables: readonly string[],
  refresh: () => void | Promise<void>,
  debounceMs = 120,
) {
  const realtime = usePortalRealtime();
  const subscribe = realtime?.subscribe;
  const connectedEpoch = realtime?.connectedEpoch;
  const refreshRef = useRef(refresh);
  const workerRef = useRef({ running: false, pending: false, schedule: null as (() => void) | null });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableKey = useMemo(() => [...new Set(tables)].sort().join('|'), [tables]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let active = true;
    const worker = workerRef.current;
    async function runRefresh() {
      if (!active) return;
      if (worker.running) { worker.pending = true; return; }
      worker.running = true;
      try { await refreshRef.current(); }
      catch (error) { captureException(error); }
      finally {
        worker.running = false;
        if (worker.pending) { worker.pending = false; worker.schedule?.(); }
      }
    }
    function scheduleRefresh() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runRefresh();
      }, debounceMs);
    }

    worker.schedule = scheduleRefresh;
    const acceptedTables = new Set(tableKey.split('|').filter(Boolean));
    const unsubscribe = subscribe?.(event => {
      if (acceptedTables.has(event.table)) scheduleRefresh();
    });

    const handleFocus = () => scheduleRefresh();
    window.addEventListener('focus', handleFocus);
    if (connectedEpoch) scheduleRefresh();

    return () => {
      active = false;
      if (worker.schedule === scheduleRefresh) worker.schedule = null;
      unsubscribe?.();
      window.removeEventListener('focus', handleFocus);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [connectedEpoch, debounceMs, subscribe, tableKey]);
}
