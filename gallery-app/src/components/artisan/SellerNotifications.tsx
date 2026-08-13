import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, CircleAlert, MessageCircle, PackageCheck, RefreshCw, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { ArtisanNotification } from '../../types/artisan';
import { SellerConfirmDialog } from './Overlay';
import { useArtisanPortal } from './artisanContextValue';
import { filterNotifications, groupNotifications, notificationCategory, notificationCounts, relativeNotificationTime, type NotificationFilter } from './notificationUtils';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';

const tabs: Array<{ key: NotificationFilter; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' }, { key: 'orders', label: 'Orders' }, { key: 'messages', label: 'Messages' }, { key: 'system', label: 'System' },
];

export default function SellerNotifications() {
  const { userId } = useArtisanPortal();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<ArtisanNotification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ArtisanNotification | null>(null);
  const counts = notificationCounts(notifications);
  const visible = useMemo(() => filterNotifications(notifications, filter), [filter, notifications]);
  const groups = useMemo(() => groupNotifications(visible), [visible]);

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data, error: loadError } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else setNotifications((data || []) as ArtisanNotification[]);
    if (!silent) setLoading(false);
  }, [userId]);

  useEffect(() => { queueMicrotask(() => { void loadNotifications(); }); }, [loadNotifications]);
  usePortalRealtimeRefresh(['notifications'], () => loadNotifications(true));

  async function setRead(notification: ArtisanNotification, read: boolean) {
    const { data, error: updateError } = await supabase.from('notifications').update({ read }).eq('id', notification.id).eq('user_id', userId).select('*').single();
    if (updateError) { setError(updateError.message); return; }
    setNotifications(current => current.map(item => item.id === notification.id ? data as ArtisanNotification : item));
  }

  async function markAllRead() {
    if (!counts.unread) return;
    setWorking(true);
    const { error: updateError } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false).select('id');
    if (updateError) setError(updateError.message);
    else setNotifications(current => current.map(notification => ({ ...notification, read: true })));
    setWorking(false);
  }

  async function deleteNotification() {
    if (!deleteTarget) return;
    setWorking(true);
    const { error: deleteError } = await supabase.from('notifications').delete().eq('id', deleteTarget.id).eq('user_id', userId);
    if (deleteError) setError(deleteError.message);
    else { setNotifications(current => current.filter(notification => notification.id !== deleteTarget.id)); setDeleteTarget(null); }
    setWorking(false);
  }

  async function openNotification(notification: ArtisanNotification) {
    if (!notification.read) await setRead(notification, true);
    if (notification.order_id) navigate(`/artisan-dashboard/orders?orderId=${encodeURIComponent(notification.order_id)}`);
    else if (notification.type === 'message') navigate('/artisan-dashboard/messages');
  }

  function iconFor(notification: ArtisanNotification) {
    const category = notificationCategory(notification);
    if (category === 'orders') return <PackageCheck size={19} />;
    if (category === 'messages') return <MessageCircle size={19} />;
    return <CircleAlert size={19} />;
  }

  return <div className="seller-notifications-page">
    <div className="portal-action-bar"><button className="seller-button seller-button--outline" type="button" disabled={!counts.unread || working} onClick={() => void markAllRead()}><CheckCheck size={16} /> Mark all read</button></div>
    {error ? <div className="seller-message-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div> : null}
    <div className="seller-notification-stats"><div><Bell /><span>Unread<strong>{counts.unread}</strong></span></div><div><PackageCheck /><span>Orders<strong>{counts.orders}</strong></span></div><div><MessageCircle /><span>Messages<strong>{counts.messages}</strong></span></div><div><CircleAlert /><span>System<strong>{counts.system}</strong></span></div></div>
    <div className="seller-notification-tabs" role="tablist" aria-label="Notification categories">{tabs.map(tab => <button role="tab" aria-selected={filter === tab.key} className={filter === tab.key ? 'is-active' : ''} key={tab.key} onClick={() => setFilter(tab.key)}>{tab.label}{counts[tab.key] ? <span>{counts[tab.key]}</span> : null}</button>)}</div>
    <section className="seller-notification-feed">
      {loading ? <div className="seller-notification-skeleton">{[1,2,3,4].map(item => <div key={item}><i /><span><b /><small /></span></div>)}</div> : groups.length ? groups.map(([label, items]) => <div className="seller-notification-group" key={label}><h2>{label}</h2><div>{items.map(notification => {
        const category = notificationCategory(notification);
        const actionable = Boolean(notification.order_id || notification.type === 'message');
        return <article className={`seller-notification-row is-${category} ${notification.read ? '' : 'is-unread'}`} key={notification.id}>
          <button className="seller-notification-row__main" type="button" onClick={() => void openNotification(notification)} disabled={!actionable && notification.read}>
            <span className="seller-notification-row__icon">{iconFor(notification)}</span><span className="seller-notification-row__copy"><strong>{notification.title || 'Shop update'}{!notification.read ? <i /> : null}</strong><span>{notification.message || 'There is a new update for your shop.'}</span><small>{relativeNotificationTime(notification.created_at)}{actionable ? category === 'orders' ? ' · View order' : ' · Open messages' : ''}</small></span>
          </button>
          <div className="seller-notification-row__actions"><button type="button" onClick={() => void setRead(notification, !notification.read)} aria-label={notification.read ? 'Mark unread' : 'Mark read'} title={notification.read ? 'Mark unread' : 'Mark read'}>{notification.read ? <RefreshCw size={15} /> : <Check size={16} />}</button><button className="is-danger" type="button" onClick={() => setDeleteTarget(notification)} aria-label="Delete notification"><Trash2 size={15} /></button></div>
        </article>;
      })}</div></div>) : <div className="seller-empty-panel seller-empty-panel--large"><Bell size={36} /><h2>{notifications.length ? 'Nothing in this category' : 'No notifications yet'}</h2><p>{notifications.length ? 'Choose another category to see more updates.' : 'Order, message, and system updates will appear here.'}</p></div>}
    </section>
    <SellerConfirmDialog open={Boolean(deleteTarget)} title="Delete notification?" description="This notification will be permanently removed from your activity history." confirmLabel="Delete notification" busy={working} onClose={() => { if (!working) setDeleteTarget(null); }} onConfirm={() => void deleteNotification()} />
  </div>;
}
