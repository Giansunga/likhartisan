import { useMemo, useState } from 'react';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { filterNotifications, groupNotifications, notificationCategory, notificationCounts, notificationDestination, relativeNotificationTime } from '../../lib/notifications';
import type { NotificationContext, NotificationFilter, NotificationRecord } from '../../types/notifications';
import NotificationIcon from './NotificationIcon';
import './notifications.css';

export interface NotificationCenterData {
  notifications: NotificationRecord[];
  loading: boolean;
  error: string;
  unreadCount: number;
  reload: (silent?: boolean) => Promise<void>;
  markRead: (id: string, read?: boolean) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearError: () => void;
}

const tabs: Array<{ key: NotificationFilter; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' }, { key: 'orders', label: 'Orders' }, { key: 'messages', label: 'Messages' }, { key: 'system', label: 'System' },
];

export default function NotificationCenter({ context, data }: { context: NotificationContext; data: NotificationCenterData }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [deleteTarget, setDeleteTarget] = useState<NotificationRecord | null>(null);
  const counts = useMemo(() => notificationCounts(data.notifications), [data.notifications]);
  const visible = useMemo(() => filterNotifications(data.notifications, filter), [data.notifications, filter]);
  const groups = useMemo(() => groupNotifications(visible), [visible]);

  const openNotification = (notification: NotificationRecord) => {
    if (!notification.read) void data.markRead(notification.id);
    navigate(notificationDestination(notification));
  };

  return (
    <section className={`notification-center notification-center--${context}`} aria-labelledby={`${context}-notification-heading`}>
      <header className="notification-center__header">
        <div><h1 id={`${context}-notification-heading`}>Notifications</h1><p>{data.unreadCount ? `${data.unreadCount} unread notification${data.unreadCount === 1 ? '' : 's'}` : 'All caught up'}</p></div>
        <button type="button" disabled={!data.unreadCount} onClick={() => void data.markAllRead()}><CheckCheck size={17} /> Mark all read</button>
      </header>

      {data.error ? <div className="notification-center__error" role="alert"><span>{data.error}</span><button type="button" onClick={data.clearError} aria-label="Dismiss notification error"><X size={16} /></button></div> : null}

      <div className="notification-center__stats"><div><Bell /><span>Unread<strong>{counts.unread}</strong></span></div><div><NotificationIcon notification={{ id: 'orders', user_id: '', type: 'order', title: '', message: '', recipient_context: context, read: true, created_at: '' }} /><span>Orders<strong>{counts.orders}</strong></span></div><div><NotificationIcon notification={{ id: 'messages', user_id: '', type: 'message', title: '', message: '', recipient_context: context, read: true, created_at: '' }} /><span>Messages<strong>{counts.messages}</strong></span></div></div>

      <div className="notification-center__tabs" role="tablist" aria-label="Notification categories">{tabs.map(tab => <button type="button" role="tab" aria-selected={filter === tab.key} className={filter === tab.key ? 'is-active' : ''} key={tab.key} onClick={() => setFilter(tab.key)}>{tab.label}{tab.key !== 'all' && counts[tab.key] ? <span>{counts[tab.key]}</span> : null}</button>)}</div>

      <div className="notification-center__feed">
        {data.loading ? <div className="notification-center__skeleton" aria-label="Loading notifications">{[1, 2, 3, 4].map(item => <div key={item}><i /><span><b /><small /></span></div>)}</div> : groups.length ? groups.map(([label, items]) => <section key={label} className="notification-center__group"><h2>{label}</h2>{items.map(notification => <article className={`notification-center__row is-${notificationCategory(notification)} ${notification.read ? '' : 'is-unread'}`} key={notification.id}>
          <button className="notification-center__main" type="button" onClick={() => openNotification(notification)}>
            {notification.product_image ? <img src={notification.product_image} alt="" /> : <span className="notification-center__icon"><NotificationIcon notification={notification} /></span>}
            <span className="notification-center__copy"><strong>{notification.title}{!notification.read ? <i aria-label="Unread" /> : null}</strong><span>{notification.message}</span><small>{relativeNotificationTime(notification.created_at)} · {notification.order_id ? 'View order' : notification.type === 'message' ? 'Open conversation' : 'View notification'}</small></span>
          </button>
          <div className="notification-center__row-actions"><button type="button" onClick={() => void data.markRead(notification.id, !notification.read)}>{notification.read ? 'Mark unread' : 'Mark read'}</button><button className="is-danger" type="button" aria-label={`Delete ${notification.title}`} onClick={() => setDeleteTarget(notification)}><Trash2 size={15} /></button></div>
        </article>)}</section>) : <div className="notification-center__empty"><Bell size={36} /><h2>{data.notifications.length ? 'Nothing in this category' : 'No notifications yet'}</h2><p>{data.notifications.length ? 'Choose another category to see more updates.' : 'Order, message, and account updates will appear here.'}</p>{data.error ? <button type="button" onClick={() => void data.reload()}>Try again</button> : null}</div>}
      </div>

      {deleteTarget ? <div className="notification-dialog-backdrop" role="presentation" onMouseDown={() => setDeleteTarget(null)}><div className="notification-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-notification-title" onMouseDown={event => event.stopPropagation()}><h2 id="delete-notification-title">Delete notification?</h2><p>This notification will be permanently removed from your activity history.</p><div><button type="button" onClick={() => setDeleteTarget(null)}>Cancel</button><button className="is-danger" type="button" onClick={() => { void data.deleteNotification(deleteTarget.id); setDeleteTarget(null); }}>Delete notification</button></div></div></div> : null}
    </section>
  );
}
