import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LikhAIMessage } from '../../../types/likhai';

const sendMessage = vi.fn();
const retryMessage = vi.fn();
const rateMessage = vi.fn();
const clearConversation = vi.fn();
let messages: LikhAIMessage[] = [];
let loading = false;
let loadingPhase: 'idle' | 'waking' | 'responding' = 'idle';

vi.mock('../../../hooks/useLikhAI', () => ({
  useLikhAI: () => ({ messages, loading, loadingPhase, sendMessage, retryMessage, rateMessage, clearConversation }),
}));

import LikhAIConversation from '../LikhAIConversation';

describe('LikhAIConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messages = [];
    loading = false;
    loadingPhase = 'idle';
  });

  it('renders verified cards, actions, suggestions, and feedback controls', () => {
    messages = [{
      id: 'assistant-1', role: 'assistant', content: 'Your paid order is ready for the seller.', timestamp: '2026-08-14T00:00:00Z',
      responseId: 'response-1', groundingStatus: 'grounded', generationStatus: 'fallback',
      resolution: { state: 'action_needed', label: 'Open the order to resume payment.' },
      cards: [{ type: 'order', id: 'order-1', shortId: 'order-1', status: 'to-ship', deliveryStatus: 'pending', total: 300, createdAt: '2026-08-14T00:00:00Z', itemCount: 1, trackingNumber: 'TRACK-123', deliveryProvider: 'LBC', href: '/dashboard?tab=purchases&order=order-1' }],
      actions: [{ id: 'purchases', label: 'View my purchases', href: '/dashboard?tab=purchases' }],
      suggestions: ['How do I contact the seller?'],
    }];
    render(<MemoryRouter><LikhAIConversation /></MemoryRouter>);
    expect(screen.getByText('Live summary unavailable — showing verified information.')).toBeInTheDocument();
    expect(screen.getByText('Open the order to resume payment.')).toBeInTheDocument();
    expect(screen.getByText('Tracking: TRACK-123')).toBeInTheDocument();
    expect(screen.getByText('To Ship')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute('href', '/dashboard?tab=purchases&order=order-1');
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

  it('renders a retry control for retryable failures', () => {
    messages = [{ id: 'assistant-error', role: 'assistant', content: 'LikhAI could not finish that request.', timestamp: '2026-08-14T00:00:00Z', errorKind: 'connection', retryText: 'Shipping info' }];
    render(<MemoryRouter><LikhAIConversation /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Retry message' }));
    expect(retryMessage).toHaveBeenCalledWith('assistant-error');
  });

  it('shows the standard typing status while loading', () => {
    loading = true;
    loadingPhase = 'waking';
    render(<MemoryRouter><LikhAIConversation /></MemoryRouter>);
    expect(screen.getByText('LikhAI is typing...')).toBeInTheDocument();
  });
});
