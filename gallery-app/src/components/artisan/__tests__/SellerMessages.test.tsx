import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalRealtimeProvider } from '../../../realtime/PortalRealtimeProvider';
import SellerMessages from '../SellerMessages';

const mocks = vi.hoisted(() => ({
  conversations: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  broadcast: null as null | ((message: unknown) => void),
}));

vi.mock('../artisanContextValue', () => ({
  useArtisanPortal: () => ({
    shop: { id: 'shop-1', name: 'Test Shop' },
    userId: 'seller-1',
    buyerActiveMap: {},
    loadingMessages: false,
    setLoadingMessages: vi.fn(),
  }),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    realtime: { setAuth: vi.fn(async () => undefined) },
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn((_kind: string, _filter: unknown, handler: (message: unknown) => void) => {
          mocks.broadcast = handler;
          return channel;
        }),
        subscribe: vi.fn((handler: (status: string) => void) => {
          queueMicrotask(() => handler('SUBSCRIBED'));
          return channel;
        }),
      };
      return channel;
    }),
    removeChannel: vi.fn(async () => undefined),
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(async () => ({
          data: table === 'conversations' ? mocks.conversations : mocks.messages,
          error: null,
        })),
      };
      return builder;
    }),
  },
}));

function conversation(name: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'conversation-1',
    shop_id: 'shop-1',
    buyer_id: 'buyer-1',
    buyer_name: name,
    buyer_avatar: '',
    last_message: 'Is this available?',
    last_message_at: '2026-08-14T07:30:00.000Z',
    created_at: '2026-08-14T07:00:00.000Z',
    artisan_unread: 0,
    ...extra,
  };
}

function renderMessages() {
  return render(
    <MemoryRouter>
      <PortalRealtimeProvider topics={['shop:shop-1']}>
        <SellerMessages />
      </PortalRealtimeProvider>
    </MemoryRouter>,
  );
}

describe('SellerMessages buyer identity', () => {
  afterEach(() => {
    mocks.conversations = [];
    mocks.messages = [];
    mocks.broadcast = null;
    vi.clearAllMocks();
  });

  it('shows the saved account name throughout the open seller conversation', async () => {
    mocks.conversations = [conversation('Maria Santos')];
    renderMessages();

    const inboxName = await screen.findByText('Maria Santos');
    fireEvent.click(inboxName.closest('button')!);

    await waitFor(() => expect(screen.getAllByText('Maria Santos').length).toBeGreaterThanOrEqual(3));
  });

  it('uses Customer for an unnamed buyer without exposing email', async () => {
    mocks.conversations = [conversation('Customer', { buyer_email: 'private-buyer@example.test' })];
    renderMessages();

    expect(await screen.findByText('Customer')).toBeInTheDocument();
    expect(screen.queryByText('Buyer')).not.toBeInTheDocument();
    expect(screen.queryByText('private-buyer@example.test')).not.toBeInTheDocument();
  });

  it('shows readable structured-message previews instead of JSON code', async () => {
    const structuredMessage = JSON.stringify({
      type: 'product_inquiry',
      message: 'Is the large vase available?',
      productId: 'vase-1',
    });
    mocks.conversations = [conversation('Maria Santos', { last_message: structuredMessage })];
    const { container } = renderMessages();

    expect(await screen.findByText('Is the large vase available?')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('"type":"product_inquiry"');
  });

  it('refreshes a renamed buyer through Broadcast and keeps the conversation open', async () => {
    mocks.conversations = [conversation('Maria Santos')];
    renderMessages();

    const inboxName = await screen.findByText('Maria Santos');
    fireEvent.click(inboxName.closest('button')!);
    await waitFor(() => expect(screen.getAllByText('Maria Santos').length).toBeGreaterThanOrEqual(3));

    mocks.conversations = [conversation('Maria Cruz')];
    act(() => mocks.broadcast?.({
      payload: { table: 'conversations', operation: 'UPDATE', record_id: 'conversation-1' },
    }));

    await waitFor(() => expect(screen.getAllByText('Maria Cruz').length).toBeGreaterThanOrEqual(3));
    expect(screen.getByRole('button', { name: 'Delete this conversation' })).toBeInTheDocument();
  });
});
