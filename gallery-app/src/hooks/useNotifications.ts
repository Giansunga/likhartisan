import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/portalErrors';
import { announceNotificationChange, normalizeNotification, NOTIFICATIONS_CHANGED_EVENT } from '../lib/notifications';
import type { NotificationContext, NotificationRecord } from '../types/notifications';

interface NotificationState {
  key: string; notifications: NotificationRecord[]; unreadCount: number; loading: boolean;
  loadError: string; actionError: string;
}
interface Scope { key: string; active: boolean; request: number; mutating: boolean; refreshQueued: boolean }
type ApplyMutation = (state: NotificationState) => NotificationState;
const emptyState = (key: string, loading: boolean): NotificationState => ({ key, notifications: [], unreadCount: 0, loading, loadError: '', actionError: '' });

export function useNotifications(userId: string | undefined, context: NotificationContext, limit?: number) {
  const key = `${userId || ''}:${context}:${limit || 'all'}`;
  const [state, setState] = useState(() => emptyState(key, Boolean(userId)));
  const lifecycle = useRef<Scope | null>(null);
  // Hide a previous identity's data before its subscription effect is cleaned up.
  const visible = state.key === key ? state : emptyState(key, Boolean(userId));

  const load = useCallback(async (silent = false) => {
    const scope = lifecycle.current;
    if (!scope?.active || scope.key !== key) return;
    if (scope.mutating) { scope.refreshQueued = true; return; }
    const request = ++scope.request;
    const current = () => scope.active && lifecycle.current === scope && request === scope.request;
    if (!userId) { setState(emptyState(key, false)); return; }
    setState(previous => previous.key === key
      ? { ...previous, loading: silent ? previous.loading : true }
      : emptyState(key, true));
    try {
      const selectNotifications = async (includeRequestId: boolean) => {
        let query = supabase.from('notifications')
          .select(`id, user_id, type, title, message, product_image, order_id, conversation_id, ${includeRequestId ? 'design_request_id, ' : ''}recipient_context, read, created_at`)
          .eq('user_id', userId).eq('recipient_context', context).order('created_at', { ascending: false });
        if (limit) query = query.limit(limit);
        return query;
      };
      let { data, error } = await selectNotifications(true);
      if (error?.code === '42703' || error?.code === 'PGRST204') ({ data, error } = await selectNotifications(false));
      if (error) throw error;
      const normalized = (data || []).map(item => normalizeNotification(item as unknown as NotificationRecord));
      let unreadCount = normalized.filter(item => !item.read).length;
      if (limit) {
        const result = await supabase.from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('recipient_context', context).eq('read', false);
        if (result.error) throw result.error;
        if (result.count == null) throw new Error('The unread notification count could not be loaded.');
        unreadCount = result.count;
      }
      if (current()) setState(previous => ({ ...previous, key, notifications: normalized, unreadCount, loading: false, loadError: '' }));
    } catch (error) {
      if (current()) setState(previous => ({ ...previous, key, loadError: getErrorMessage(error, 'Notifications could not be loaded.') }));
    } finally {
      if (current()) setState(previous => ({ ...previous, loading: false }));
    }
  }, [context, key, limit, userId]);

  useEffect(() => {
    const scope: Scope = { key, active: true, request: 0, mutating: false, refreshQueued: false };
    lifecycle.current = scope;
    queueMicrotask(() => { if (scope.active) void load(); });
    return () => { scope.active = false; ++scope.request; };
  }, [key, load]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => { void load(true); };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    // StrictMode can replace this effect before channel removal completes.
    const channel = supabase.channel(`notifications:${context}:${userId}:${limit || 'all'}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    const poll = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
      window.clearInterval(poll);
      void Promise.resolve(supabase.removeChannel(channel)).catch(() => undefined);
    };
  }, [context, limit, load, userId]);

  const runMutation = useCallback(async (operation: () => Promise<ApplyMutation>) => {
    const scope = lifecycle.current;
    if (!userId || !scope?.active || scope.key !== key || scope.mutating) return;
    scope.mutating = true;
    ++scope.request; // Older reads must not undo a confirmed mutation.
    const current = () => scope.active && lifecycle.current === scope;
    let saved = false;
    setState(previous => ({ ...previous, actionError: '' }));
    try {
      const apply = await operation();
      if (!current()) return;
      setState(previous => previous.key === key ? apply(previous) : previous);
      saved = true;
      announceNotificationChange();
    } catch (error) {
      if (current()) setState(previous => ({ ...previous, actionError: getErrorMessage(error, 'The notification could not be changed.') }));
    } finally {
      scope.mutating = false;
      if (current() && (saved || scope.refreshQueued)) {
        scope.refreshQueued = false;
        await load(true);
      }
    }
  }, [key, load, userId]);

  const markRead = useCallback(async (id: string, read = true) => runMutation(async () => {
    const { data, error } = await supabase.from('notifications').update({ read })
      .eq('id', id).eq('user_id', userId).eq('recipient_context', context).select('id, read').maybeSingle();
    if (error) throw error;
    if (!data || data.id !== id || data.read !== read) throw new Error('The notification was not updated. Refresh and try again.');
    return previous => {
      const old = previous.notifications.find(item => item.id === id);
      const difference = old && old.read !== read ? (read ? -1 : 1) : 0;
      return { ...previous, notifications: previous.notifications.map(item => item.id === id ? { ...item, read } : item), unreadCount: Math.max(0, previous.unreadCount + difference) };
    };
  }), [context, runMutation, userId]);

  const markAllRead = useCallback(async () => {
    if (!visible.unreadCount) return;
    await runMutation(async () => {
      const { data, error } = await supabase.from('notifications').update({ read: true })
        .eq('user_id', userId).eq('recipient_context', context).eq('read', false).select('id, read');
      if (error) throw error;
      if (!data?.length) throw new Error('No notifications were updated. Refresh and try again.');
      const ids = new Set(data.filter(item => item.read).map(item => item.id));
      return previous => ({ ...previous, notifications: previous.notifications.map(item => ids.has(item.id) ? { ...item, read: true } : item), unreadCount: Math.max(0, previous.unreadCount - ids.size) });
    });
  }, [context, runMutation, userId, visible.unreadCount]);

  const deleteNotification = useCallback(async (id: string) => runMutation(async () => {
    const { data, error } = await supabase.from('notifications').delete()
      .eq('id', id).eq('user_id', userId).eq('recipient_context', context).select('id').maybeSingle();
    if (error) throw error;
    if (!data || data.id !== id) throw new Error('The notification was not deleted. Refresh and try again.');
    return previous => {
      const deleted = previous.notifications.find(item => item.id === id);
      return { ...previous, notifications: previous.notifications.filter(item => item.id !== id), unreadCount: Math.max(0, previous.unreadCount - (deleted && !deleted.read ? 1 : 0)) };
    };
  }), [context, runMutation, userId]);

  return {
    notifications: visible.notifications, loading: visible.loading, error: visible.actionError || visible.loadError,
    unreadCount: visible.unreadCount, reload: load, markRead, markAllRead, deleteNotification,
    clearError: () => setState(previous => ({ ...previous, loadError: '', actionError: '' })),
  };
}
