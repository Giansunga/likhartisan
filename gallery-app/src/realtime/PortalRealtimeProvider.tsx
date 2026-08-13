import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

export type PortalRealtimeOperation = 'INSERT' | 'UPDATE' | 'DELETE';
export type PortalRealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface PortalRealtimeEvent {
  table: string;
  operation: PortalRealtimeOperation;
  record_id: string | null;
}

type RealtimeListener = (event: PortalRealtimeEvent) => void;

interface PortalRealtimeContextValue {
  status: PortalRealtimeStatus;
  connectedEpoch: number;
  subscribe: (listener: RealtimeListener) => () => void;
}

const PortalRealtimeContext = createContext<PortalRealtimeContextValue | null>(null);

function isPortalRealtimeEvent(value: unknown): value is PortalRealtimeEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PortalRealtimeEvent>;
  return typeof candidate.table === 'string'
    && ['INSERT', 'UPDATE', 'DELETE'].includes(candidate.operation || '')
    && (typeof candidate.record_id === 'string' || candidate.record_id === null);
}

export function PortalRealtimeProvider({ topics, children }: { topics: string[]; children: ReactNode }) {
  const listenersRef = useRef(new Set<RealtimeListener>());
  const [status, setStatus] = useState<PortalRealtimeStatus>('connecting');
  const [connectedEpoch, setConnectedEpoch] = useState(0);
  const topicKey = useMemo(() => [...new Set(topics)].sort().join('|'), [topics]);

  const subscribe = useCallback((listener: RealtimeListener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  useEffect(() => {
    const activeTopics = topicKey.split('|').filter(Boolean);
    if (!activeTopics.length) return;

    let active = true;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    void (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      setStatus('connecting');

      for (const topic of activeTopics) {
        const channel = supabase
          .channel(topic, { config: { private: true } })
          .on('broadcast', { event: 'db_change' }, message => {
            const body = (message as { payload?: unknown }).payload ?? message;
            if (!isPortalRealtimeEvent(body)) return;
            for (const listener of listenersRef.current) listener(body);
          });

        channels.push(channel);
        channel.subscribe(channelStatus => {
          if (!active) return;
          if (channelStatus === 'SUBSCRIBED') {
            setStatus('connected');
            setConnectedEpoch(current => current + 1);
          } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
            setStatus('error');
          } else if (channelStatus === 'CLOSED') {
            setStatus('disconnected');
          }
        });
      }
    })().catch(() => {
      if (active) setStatus('error');
    });

    return () => {
      active = false;
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [topicKey]);

  const value = useMemo(
    () => ({ status, connectedEpoch, subscribe }),
    [connectedEpoch, status, subscribe],
  );

  return <PortalRealtimeContext.Provider value={value}>{children}</PortalRealtimeContext.Provider>;
}

// The provider and its tightly-coupled hook intentionally share one module.
// eslint-disable-next-line react-refresh/only-export-components
export function usePortalRealtime() {
  return useContext(PortalRealtimeContext);
}
