import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationRecord } from '../../types/notifications';
import NotificationDropdown from './NotificationDropdown';

const item: NotificationRecord = {
  id: 'notification-1', user_id: 'buyer-1', type: 'shipped', title: 'Shipped out', message: 'Your order is on its way.', order_id: 'order-1', recipient_context: 'buyer', read: false, created_at: '2026-08-15T08:00:00Z',
};

describe('NotificationDropdown', () => {
  it('exposes accessible controls and opens an unread notification', () => {
    const onClose = vi.fn();
    const onMarkAllRead = vi.fn();
    const onViewAll = vi.fn();
    const onOpenNotification = vi.fn();
    render(<NotificationDropdown context="buyer" notifications={[item]} unreadCount={1} loading={false} error="" onClose={onClose} onRetry={vi.fn()} onMarkAllRead={onMarkAllRead} onViewAll={onViewAll} onOpenNotification={onOpenNotification} />);

    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByLabelText('1 unread')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Shipped out/ }));
    expect(onOpenNotification).toHaveBeenCalledWith(item);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    fireEvent.click(screen.getByRole('button', { name: 'View all' }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
    expect(onViewAll).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('renders loading, error, and retry states', () => {
    const props = { context: 'buyer' as const, notifications: [], unreadCount: 0, onClose: vi.fn(), onRetry: vi.fn(), onMarkAllRead: vi.fn(), onViewAll: vi.fn(), onOpenNotification: vi.fn() };
    const { rerender } = render(<NotificationDropdown {...props} loading error="" />);
    expect(screen.getByLabelText('Loading notifications')).toBeInTheDocument();
    rerender(<NotificationDropdown {...props} loading={false} error="Network unavailable" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });
});
