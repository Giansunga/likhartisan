import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import type { NotificationRecord } from '../../../types/notifications';

const openQuoteReview = vi.fn();
const markRead = vi.fn(async () => undefined);
vi.mock('../../chat/QuoteReviewContext', () => ({ useQuoteReview: () => openQuoteReview }));
import NotificationCenter from '../NotificationCenter';

it('opens the exact quote from the Notifications page and marks it read', () => {
  const notification: NotificationRecord = { id: 'notice-1', user_id: 'buyer-1', type: 'design_request', title: 'Your design has a quote', message: 'Review the shop quote in Messages.', design_request_id: 'request-1', recipient_context: 'buyer', read: false, created_at: new Date().toISOString() };
  render(<MemoryRouter><NotificationCenter context="buyer" data={{ notifications: [notification], loading: false, error: '', unreadCount: 1, reload: vi.fn(), markRead, markAllRead: vi.fn(), deleteNotification: vi.fn(), clearError: vi.fn() }} /></MemoryRouter>);
  fireEvent.click(document.querySelector('.notification-center__main') as HTMLButtonElement);
  expect(openQuoteReview).toHaveBeenCalledWith('request-1');
  expect(markRead).toHaveBeenCalledWith('notice-1');
});
