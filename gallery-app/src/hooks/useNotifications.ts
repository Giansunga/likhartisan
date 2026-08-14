import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { announceNotificationChange, normalizeNotification, NOTIFICATIONS_CHANGED_EVENT } from '../lib/notifications';
import type { NotificationContext, NotificationRecord } from '../types/notifications';

export function useNotifications(userId: string | undefined, context: NotificationContext, limit?: number) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setError('');
      return;
    }
    if (!silent) setLoading(true);
    let query = supabase
      .from('notifications')
      .select('id, user_id, type, title, message, product_image, order_id, conversation_id, recipient_context, read, created_at')
      .eq('user_id', userId)
      .eq('recipient_context', context)
      .order('created_at', { ascending: false });
    if (limit) query = query.limit(limit);
    const { data, error: loadError } = await query;
    if (loadError) setError(loadError.message);
    else {
      setError('');
      const normalized = (data || []).map(notification => normalizeNotification(notification as NotificationRecord));
      setNotifications(normalized);
      if (limit) {
        const { count, error: countError } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('recipient_context', context)
          .eq('read', false);
        if (countError) setError(countError.message);
        else setUnreadCount(count || 0);
      } else {
        setUnreadCount(normalized.filter(notification => !notification.read).length);
      }
    }
    if (!silent) setLoading(false);
  }, [context, limit, userId]);

  useEffect(() => { queueMicrotask(() => { setNotifications([]); setUnreadCount(0); void load(); }); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => { void load(true); };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    const channel = supabase
      .channel(`notifications:${context}:${userId}:${limit || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    const poll = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [context, limit, load, userId]);

  const markRead = useCallback(async (id: string, read = true) => {
    if (!userId) return;
    const previous = notifications;
    const previousRead = previous.find(notification => notification.id === id)?.read;
    setNotifications(current => current.map(notification => notification.id === id ? { ...notification, read } : notification));
    if (previousRead !== undefined && previousRead !== read) setUnreadCount(current => Math.max(0, current + (read ? -1 : 1)));
    const { error: updateError } = await supabase.from('notifications').update({ read }).eq('id', id).eq('user_id', userId);
    if (updateError) {
      setNotifications(previous);
      if (previousRead !== undefined && previousRead !== read) setUnreadCount(current => Math.max(0, current + (read ? 1 : -1)));
      setError(updateError.message);
      return;
    }
    announceNotificationChange();
  }, [notifications, userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const previous = notifications;
    const previousUnreadCount = unreadCount;
    setNotifications(current => current.map(notification => ({ ...notification, read: true })));
    setUnreadCount(0);
    const { error: updateError } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('recipient_context', context).eq('read', false);
    if (updateError) {
      setNotifications(previous);
      setUnreadCount(previousUnreadCount);
      setError(updateError.message);
      return;
    }
    announceNotificationChange();
  }, [context, notifications, unreadCount, userId]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!userId) return;
    const previous = notifications;
    const deleted = previous.find(notification => notification.id === id);
    setNotifications(current => current.filter(notification => notification.id !== id));
    if (deleted && !deleted.read) setUnreadCount(current => Math.max(0, current - 1));
    const { error: deleteError } = await supabase.from('notifications').delete().eq('id', id).eq('user_id', userId);
    if (deleteError) {
      setNotifications(previous);
      if (deleted && !deleted.read) setUnreadCount(current => current + 1);
      setError(deleteError.message);
      return;
    }
    announceNotificationChange();
  }, [notifications, userId]);

  return { notifications, loading, error, unreadCount, reload: load, markRead, markAllRead, deleteNotification, clearError: () => setError('') };
}
