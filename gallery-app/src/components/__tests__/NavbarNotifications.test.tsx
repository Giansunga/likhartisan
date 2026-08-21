import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationContext, NotificationRecord } from '../../types/notifications';

const markRead = vi.fn(async () => undefined);
const markAllRead = vi.fn(async () => undefined);
const reload = vi.fn(async () => undefined);
let requestedContext: NotificationContext | undefined;

const buyerOrder: NotificationRecord = { id: 'buyer-order', user_id: 'user-1', type: 'shipped', title: 'Shipped out', message: 'Order update', order_id: 'order / 1', recipient_context: 'buyer', read: false, created_at: '2026-08-15T08:00:00Z' };
const artisanMessage: NotificationRecord = { id: 'artisan-message', user_id: 'user-1', type: 'message', title: 'New message', message: 'Buyer replied', conversation_id: 'conversation / 1', recipient_context: 'artisan', read: false, created_at: '2026-08-15T08:00:00Z' };

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', email: 'buyer@example.test', user_metadata: {} } }) }));
vi.mock('../../hooks/useNotifications', () => ({
  useNotifications: (_userId: string, context: NotificationContext) => {
    requestedContext = context;
    const notifications = context === 'artisan' ? [artisanMessage] : [buyerOrder];
    return { notifications, unreadCount: 1, loading: false, error: '', reload, markRead, markAllRead, deleteNotification: vi.fn(), clearError: vi.fn() };
  },
}));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { signOut: vi.fn() },
    from: vi.fn(() => {
      const builder = { select: vi.fn(() => builder), eq: vi.fn(() => builder), maybeSingle: vi.fn(async () => ({ data: null, error: null })), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [] }).then(resolve) };
      return builder;
    }),
  },
}));

import Navbar from '../Navbar';

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current location">{location.pathname}{location.search}</output>;
}

function renderNavbar(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Navbar /><LocationProbe /></MemoryRouter>);
}

describe('Navbar notification routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestedContext = undefined;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  });

  it('opens a buyer order from public navigation using the exact URL', async () => {
    renderNavbar('/gallery');
    const bell = screen.getByRole('button', { name: 'Notifications' });
    fireEvent.click(bell);
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Shipped out/ }));
    await waitFor(() => expect(screen.getByLabelText('current location')).toHaveTextContent('/dashboard?tab=purchases&order=order%20%2F%201'));
    expect(markRead).toHaveBeenCalledWith('buyer-order');
    expect(requestedContext).toBe('buyer');
  });

  it('hides notification controls in the artisan surface top bar', () => {
    renderNavbar('/artisan-dashboard');
    expect(screen.queryByRole('button', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'User menu' })).not.toBeInTheDocument();
  });

  it('routes View all according to the current surface', async () => {
    renderNavbar('/gallery');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByRole('button', { name: 'View all' }));
    await waitFor(() => expect(screen.getByLabelText('current location')).toHaveTextContent('/dashboard?tab=notifications'));
  });
});
