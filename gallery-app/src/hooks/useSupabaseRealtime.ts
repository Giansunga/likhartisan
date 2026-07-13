import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type RealtimeEvent = 
  | { table: 'orders'; action: 'INSERT' | 'UPDATE' | 'DELETE'; new: any; old: any }
  | { table: 'notifications'; action: 'INSERT' | 'UPDATE' | 'DELETE'; new: any; old: any }
  | { table: 'messages'; action: 'INSERT' | 'UPDATE' | 'DELETE'; new: any; old: any };

export interface UseRealtimeHandlers {
  onOrderInsert?: (order: any) => void;
  onOrderUpdate?: (order: any, oldOrder: any) => void;
  onOrderDelete?: (order: any) => void;
  onNotificationInsert?: (notification: any) => void;
  onNotificationUpdate?: (notification: any, oldNotification: any) => void;
  onMessageInsert?: (message: any) => void;
  onMessageUpdate?: (message: any, oldMessage: any) => void;
}

/**
 * Realtime subscription hook for Supabase tables.
 * Automatically subscribes to orders, notifications, and messages changes.
 * Fires callbacks on INSERT/UPDATE/DELETE events.
 */
export function useSupabaseRealtime(handlers: UseRealtimeHandlers = {}) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setError(null);

    if (!user) {
      cleanup();
      return;
    }

    // Create realtime channel subscribed to all three tables
    const channel = supabase
      .channel('realtime-likhartisan')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          if (!isMountedRef.current) return;
          const { event, new: newRecord, old: oldRecord } = payload as any;
          
          if (event === 'INSERT' && handlers.onOrderInsert) handlers.onOrderInsert(newRecord);
          else if (event === 'UPDATE' && handlers.onOrderUpdate) handlers.onOrderUpdate(newRecord, oldRecord);
          else if (event === 'DELETE' && handlers.onOrderDelete) handlers.onOrderDelete(newRecord);
        }
      )
      .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
              (payload: any) => {
                if (!isMountedRef.current) return;
                const { event, new: newRecord, old: oldRecord } = payload as any;
          
                if (event === 'INSERT' && handlers.onNotificationInsert) handlers.onNotificationInsert(newRecord);
                else if (event === 'UPDATE' && handlers.onNotificationUpdate) handlers.onNotificationUpdate(newRecord, oldRecord);
              }
            )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' }, // Global chat or channel-based; adjust filter if needed
        (payload) => {
          if (!isMountedRef.current) return;
          const { new: newRecord, old: oldRecord } = payload;
          
          if (handlers.onMessageInsert) handlers.onMessageInsert(newRecord);
          else if (handlers.onMessageUpdate) handlers.onMessageUpdate(newRecord, oldRecord);
        }
      )
      .subscribe((status) => {
        if (!isMountedRef.current) return;
        
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setError(null);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(`Realtime connection lost: ${status}`);
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, [user?.id, cleanup]);

  return { isConnected, error };
}