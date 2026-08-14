import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LikhAIMessage } from '../../../types/likhai';

const sendMessage = vi.fn();
const rateMessage = vi.fn();
const clearConversation = vi.fn();
let messages: LikhAIMessage[] = [];

vi.mock('../../../hooks/useLikhAI', () => ({
  useLikhAI: () => ({ messages, loading: false, sendMessage, rateMessage, clearConversation }),
}));

import LikhAIConversation from '../LikhAIConversation';

describe('LikhAIConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messages = [];
  });

  it('renders verified cards, actions, suggestions, and feedback controls', () => {
    messages = [{
      id: 'assistant-1', role: 'assistant', content: 'Your paid order is ready for the seller.', timestamp: '2026-08-14T00:00:00Z',
      responseId: 'response-1', groundingStatus: 'grounded',
      cards: [{ type: 'order', id: 'order-1', shortId: 'order-1', status: 'to-ship', deliveryStatus: 'pending', total: 300, createdAt: '2026-08-14T00:00:00Z', itemCount: 1, href: '/dashboard?tab=purchases&order=order-1' }],
      actions: [{ id: 'purchases', label: 'View my purchases', href: '/dashboard?tab=purchases' }],
      suggestions: ['How do I contact the seller?'],
    }];
    render(<MemoryRouter><LikhAIConversation /></MemoryRouter>);
    expect(screen.getByText('To Ship')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View my purchases' })).toHaveAttribute('href', '/dashboard?tab=purchases');
    fireEvent.click(screen.getByRole('button', { name: 'How do I contact the seller?' }));
    expect(sendMessage).toHaveBeenCalledWith('How do I contact the seller?');
    fireEvent.click(screen.getByRole('button', { name: 'Helpful response' }));
    expect(rateMessage).toHaveBeenCalledWith('assistant-1', 'positive');
  });

  it('submits a new message once and can clear the session conversation', () => {
    messages = [{ id: 'old', role: 'user', content: 'Hello', timestamp: '2026-08-14T00:00:00Z' }];
    render(<MemoryRouter><LikhAIConversation /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message LikhAI' }), { target: { value: 'Magkano ang paso?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(sendMessage).toHaveBeenCalledWith('Magkano ang paso?');
    fireEvent.click(screen.getByRole('button', { name: 'Clear LikhAI conversation' }));
    expect(clearConversation).toHaveBeenCalledOnce();
  });
});
