import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationContext, NotificationRecord } from '../../types/notifications';

const markRead = vi.fn(async () => undefined);
const markAllRead = vi.fn(async () => undefined);
const reload = vi.fn(async () => undefined);
const openQuoteReview = vi.fn();
let requestedContext: NotificationContext | undefined;
let buyerNotifications: NotificationRecord[] = [];
let userForTest: { id: string; email: string; user_metadata: Record<string, unknown> } | null = { id: 'user-1', email: 'buyer@example.test', user_metadata: {} };
let resizeViewport = (_width: number) => {};

const buyerOrder: NotificationRecord = { id: 'buyer-order', user_id: 'user-1', type: 'shipped', title: 'Shipped out', message: 'Order update', order_id: 'order / 1', recipient_context: 'buyer', read: false, created_at: '2026-08-15T08:00:00Z' };
const artisanMessage: NotificationRecord = { id: 'artisan-message', user_id: 'user-1', type: 'message', title: 'New message', message: 'Buyer replied', conversation_id: 'conversation / 1', recipient_context: 'artisan', read: false, created_at: '2026-08-15T08:00:00Z' };
const buyerQuote: NotificationRecord = { id: 'buyer-quote', user_id: 'user-1', type: 'design_request', title: 'Your design has a quote', message: 'Review the shop quote in Messages.', design_request_id: 'request-1', recipient_context: 'buyer', read: false, created_at: '2026-08-15T08:00:00Z' };

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: userForTest }) }));
vi.mock('../chat/QuoteReviewContext', () => ({ useQuoteReview: () => openQuoteReview }));
vi.mock('../../hooks/useNotifications', () => ({
  useNotifications: (_userId: string, context: NotificationContext) => {
    requestedContext = context;
    const notifications = context === 'artisan' ? [artisanMessage] : buyerNotifications;
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
  function setWidth(initialWidth: number) {
    let width = initialWidth;
    const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn((query: string) => ({
      get matches() { return width <= Number(query.match(/max-width: (\d+)px/)?.[1] ?? 0); },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        const queryListeners = listeners.get(query) ?? new Set();
        queryListeners.add(listener);
        listeners.set(query, queryListeners);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.get(query)?.delete(listener),
    })) });
    resizeViewport = (nextWidth) => {
      width = nextWidth;
      listeners.forEach((queryListeners, query) => {
        const matches = width <= Number(query.match(/max-width: (\d+)px/)?.[1] ?? 0);
        queryListeners.forEach(listener => listener({ matches } as MediaQueryListEvent));
      });
    };
  }

  it.each([768, 769, 820, 834, 1024, 1194, 1199, 1200, 1280, 1366])('selects the navigation layout at %ipx', (width) => {
    setWidth(width);
    renderNavbar('/');
    expect(!!screen.queryByRole('button', { name: 'Navigation menu' })).toBe(width > 768 && width < 1200);
    expect(!!screen.queryByRole('link', { name: 'Gallery' })).toBe(width >= 1200);
  });

  it('closes tablet navigation with Escape, outside pointer, route change, and other panels', () => {
    setWidth(834);
    renderNavbar('/');
    const menu = screen.getByRole('button', { name: 'Navigation menu' });
    fireEvent.click(menu);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu).toHaveFocus();
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menu);
    fireEvent.pointerDown(document.body);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'My Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.queryByRole('link', { name: 'My Account' })).not.toBeInTheDocument();
    fireEvent.click(menu);
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('link', { name: 'Gallery' }));
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('current location')).toHaveTextContent('/gallery');
  });

  it('opens the desktop profile by button and restores focus on Escape', () => {
    renderNavbar('/');
    const profile = screen.getByRole('button', { name: 'User menu' });
    fireEvent.click(profile);
    expect(screen.getByRole('link', { name: 'My Account' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(profile).toHaveFocus();
    expect(profile).toHaveAttribute('aria-expanded', 'false');
  });
  it('closes the tablet menu and switches to desktop links when the viewport widens', () => {
    setWidth(834);
    renderNavbar('/');
    const menu = screen.getByRole('button', { name: 'Navigation menu' });
    fireEvent.click(menu);
    expect(screen.getByRole('navigation', { name: 'Tablet navigation menu' })).toContainElement(screen.getByRole('link', { name: 'Artisans' }));
    act(() => resizeViewport(1200));
    expect(screen.queryByRole('button', { name: 'Navigation menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Tablet navigation menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Artisans' })).toBeInTheDocument();
  });

  it('keeps tablet sign-in for guests and preserves shop and admin controls for eligible users', async () => {
    setWidth(834);
    userForTest = null;
    const { unmount } = renderNavbar('/');
    expect(screen.getByRole('button', { name: 'SIGN IN' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'User menu' })).not.toBeInTheDocument();
    unmount();

    userForTest = { id: 'admin-1', email: 'admin@example.test', user_metadata: {} };
    const { ADMIN_EMAILS } = await import('../../lib/constants');
    userForTest.email = ADMIN_EMAILS[0];
    const admin = renderNavbar('/');
    expect(await screen.findByRole('link', { name: 'Admin dashboard' })).toBeInTheDocument();
    admin.unmount();

    const { SHOP_EMAILS } = await import('../../lib/constants');
    userForTest = { id: 'shop-1', email: SHOP_EMAILS[0], user_metadata: {} };
    renderNavbar('/');
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    expect(screen.getByRole('link', { name: 'Shop Dashboard' })).toBeInTheDocument();
  });
  it.each([
    ['/?auth=signup', 'Create Account'],
    ['/?auth=verify', 'Verify your email'],
  ])('opens the account popup from %s', async (path, heading) => {
    userForTest = null;
    sessionStorage.clear();
    renderNavbar(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByLabelText('current location')).toHaveTextContent('/');
    expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    requestedContext = undefined;
    buyerNotifications = [buyerOrder];
    userForTest = { id: 'user-1', email: 'buyer@example.test', user_metadata: {} };
    resizeViewport = (_width: number) => {};
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

  it('opens the exact quoted request from the navbar and marks its notification read', () => {
    buyerNotifications = [buyerQuote];
    renderNavbar('/gallery');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByRole('button', { name: /Your design has a quote/ }));
    expect(openQuoteReview).toHaveBeenCalledWith('request-1');
    expect(markRead).toHaveBeenCalledWith('buyer-quote');
    expect(screen.getByLabelText('current location')).toHaveTextContent('/gallery');
  });

  it('routes View all according to the current surface', async () => {
    renderNavbar('/gallery');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByRole('button', { name: 'View all' }));
    await waitFor(() => expect(screen.getByLabelText('current location')).toHaveTextContent('/dashboard?tab=notifications'));
  });
});
