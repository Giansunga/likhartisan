import { useEffect } from 'react';
import { notificationCategory, relativeNotificationTime } from '../../lib/notifications';
import type { NotificationContext, NotificationRecord } from '../../types/notifications';
import NotificationIcon from './NotificationIcon';
import './notifications.css';

interface NotificationDropdownProps {
  context: NotificationContext;
  notifications: NotificationRecord[];
  unreadCount: number;
  loading: boolean;
  error: string;
  onClose: (restoreFocus?: boolean) => void;
  onRetry: () => void;
  onMarkAllRead: () => void;
  onViewAll: () => void;
  onOpenNotification: (notification: NotificationRecord) => void;
}

export default function NotificationDropdown({ context, notifications, unreadCount, loading, error, onClose, onRetry, onMarkAllRead, onViewAll, onOpenNotification }: NotificationDropdownProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <section id="navbar-notification-panel" className="notification-popover" role="region" aria-labelledby="navbar-notification-title">
      <header className="notification-popover__header">
        <div className="notification-popover__title">
          <strong id="navbar-notification-title">Notifications</strong>
          {unreadCount > 0 ? <span aria-label={`${unreadCount} unread`}>{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
        </div>
        <div className="notification-popover__actions">
          {unreadCount > 0 ? <button type="button" onClick={onMarkAllRead}>Mark all read</button> : null}
          <button type="button" onClick={onViewAll}>View all</button>
        </div>
      </header>

      <div className="notification-popover__body" aria-live="polite">
        {loading ? (
          <div className="notification-popover__skeleton" aria-label="Loading notifications">{[1, 2, 3].map(item => <div key={item}><i /><span><b /><small /></span></div>)}</div>
        ) : error ? (
          <div className="notification-popover__state" role="alert"><NotificationIcon notification={{ id: 'error', user_id: '', type: 'system', title: '', message: '', recipient_context: context, read: true, created_at: new Date().toISOString() }} /><strong>Notifications could not load</strong><p>{error}</p><button type="button" onClick={onRetry}>Try again</button></div>
        ) : notifications.length === 0 ? (
          <div className="notification-popover__state"><NotificationIcon notification={{ id: 'empty', user_id: '', type: 'notification', title: '', message: '', recipient_context: context, read: true, created_at: new Date().toISOString() }} /><strong>You're all caught up</strong><p>No notifications yet.</p></div>
        ) : notifications.map(notification => (
          <button className={`notification-popover__item ${notification.read ? '' : 'is-unread'}`} type="button" key={notification.id} onClick={() => onOpenNotification(notification)}>
            {notification.product_image ? <img src={notification.product_image} alt="" /> : <span className={`notification-popover__icon is-${notificationCategory(notification)}`}><NotificationIcon notification={notification} /></span>}
            <span className="notification-popover__copy"><strong>{notification.title}</strong><span>{notification.message}</span><time dateTime={notification.created_at}>{relativeNotificationTime(notification.created_at)}</time></span>
            {!notification.read ? <i className="notification-popover__unread" aria-label="Unread" /> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
