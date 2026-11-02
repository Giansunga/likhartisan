import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalRealtimeProvider } from '../../../realtime/PortalRealtimeProvider';
import SellerMessages from '../SellerMessages';

vi.mock('../../chat/DesignMessageCard', () => ({ default: ({ data, isLatestForRequest }: { data: Record<string, unknown>; isLatestForRequest?: boolean }) => <div data-testid={String(data.message)} data-latest={String(isLatestForRequest)}>{String(data.message)}</div> }));

interface Query { table: string; operation: string; filters: Record<string, unknown>; payload?: Record<string, unknown> }
interface QueryResult { data: unknown; error: { message: string } | null }

const mocks = vi.hoisted(() => ({
  query: vi.fn<(query: Query) => Promise<QueryResult> | QueryResult | undefined>(),
  setLoadingMessages: vi.fn(),
  getAccessToken: vi.fn(async () => 'seller-token'),
  conversations: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  broadcast: null as null | ((message: unknown) => void),
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ getAccessToken: mocks.getAccessToken }) }));

vi.mock('../artisanContextValue', () => ({
  useArtisanPortal: () => ({
    shop: { id: 'shop-1', name: 'Test Shop' },
    userId: 'seller-1',
    buyerActiveMap: {},
    loadingMessages: false,
    setLoadingMessages: mocks.setLoadingMessages,
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
      const query: Query = { table, operation: 'select', filters: {} };
      const execute = async (): Promise<QueryResult> => {
        const override = mocks.query({ ...query, filters: { ...query.filters } });
        if (override) return override;
        if (query.operation === 'insert') {
          const message = { ...query.payload, id: 'sent-message', created_at: '2026-10-01T01:00:00Z' };
          mocks.messages.push(message);
          return { data: message, error: null };
        }
        if (query.operation !== 'select') return { data: { id: query.filters.id }, error: null };
        return { data: table === 'conversations' ? mocks.conversations : mocks.messages, error: null };
      };
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((key: string, value: unknown) => { query.filters[key] = value; return builder; }),
        update: vi.fn((payload: Record<string, unknown>) => { query.operation = 'update'; query.payload = payload; return builder; }),
        insert: vi.fn((payload: Record<string, unknown>) => { query.operation = 'insert'; query.payload = payload; return builder; }),
        delete: vi.fn(() => { query.operation = 'delete'; return builder; }),
        order: vi.fn(execute),
        single: vi.fn(execute),
        maybeSingle: vi.fn(execute),
        then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => execute().then(resolve, reject),
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

describe('SellerMessages buyer identity and recovery', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.getAccessToken.mockResolvedValue('seller-token');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  });
  afterEach(() => {
    mocks.conversations = [];
    mocks.messages = [];
    mocks.broadcast = null;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

  it('marks only the latest design event per request and preserves that selection after a plain-message refresh', async () => {
    mocks.conversations = [conversation('Maria Santos')];
    const message = (id: string, requestId: string, text: string) => ({ id, conversation_id: 'conversation-1', sender_id: 'seller-1', created_at: '2026-10-01T01:00:00Z', text: JSON.stringify({ type: 'design_request_update', version: 1, request_id: requestId, message: text }) });
    mocks.messages = [message('m1', 'request-1', 'First quote'), message('m2', 'request-1', 'Second quote'), message('m3', 'request-2', 'Other design')];
    renderMessages();
    fireEvent.click((await screen.findByText('Maria Santos')).closest('button')!);
    expect(await screen.findByTestId('First quote')).toHaveAttribute('data-latest', 'false');
    expect(screen.getByTestId('Second quote')).toHaveAttribute('data-latest', 'true');
    expect(screen.getByTestId('Other design')).toHaveAttribute('data-latest', 'true');
    mocks.messages = [...mocks.messages, { ...mocks.messages[2], id: 'm4', text: 'A new ordinary message' }];
    act(() => mocks.broadcast?.({ payload: { table: 'messages', operation: 'INSERT', record_id: 'm4' } }));
    await screen.findByText('A new ordinary message');
    expect(screen.getByTestId('First quote')).toHaveAttribute('data-latest', 'false');
    expect(screen.getByTestId('Second quote')).toHaveAttribute('data-latest', 'true');
    mocks.messages = [...mocks.messages, message('m5', 'request-1', 'Approved design')];
    act(() => mocks.broadcast?.({ payload: { table: 'messages', operation: 'INSERT', record_id: 'm5' } }));
    expect(await screen.findByTestId('Approved design')).toHaveAttribute('data-latest', 'true');
    expect(screen.getByTestId('Second quote')).toHaveAttribute('data-latest', 'false');
    expect(screen.getByTestId('Other design')).toHaveAttribute('data-latest', 'true');
  });

  it('treats a thrown preview update as secondary after a confirmed send', async () => {
    mocks.conversations = [conversation('Maria Santos')];
    mocks.query.mockImplementation(query => {
      if (query.table === 'conversations' && query.operation === 'update') return Promise.reject(new Error('Preview offline'));
    });
    renderMessages();
    fireEvent.click((await screen.findByText('Maria Santos')).closest('button')!);
    await waitFor(() => expect(screen.queryByText('Loading messages…')).not.toBeInTheDocument());
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Confirmed reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Your message was sent, but the inbox preview/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(mocks.query.mock.calls.filter(([query]) => query.operation === 'insert')).toHaveLength(1);
    expect(mocks.getAccessToken).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/notifications'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer seller-token' }) }));
  });

  it('shows failed notification delivery as partial success without restoring the sent draft', async () => {
    mocks.conversations = [conversation('Maria Santos')];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    renderMessages();
    fireEvent.click((await screen.findByText('Maria Santos')).closest('button')!);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Already sent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Your message was sent, but the buyer notification/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(within(screen.getByRole('region', { name: 'Conversation with Maria Santos' })).getByText('Already sent')).toBeInTheDocument();
  });

  it('releases the message loader after a rejected request', async () => {
    mocks.conversations = [conversation('Maria Santos')];
    mocks.query.mockImplementation(query => {
      if (query.table === 'messages' && query.operation === 'select') return Promise.reject(new Error('Message network unavailable'));
    });
    renderMessages();
    fireEvent.click((await screen.findByText('Maria Santos')).closest('button')!);
    expect(await screen.findByText('Message network unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Loading messages…')).not.toBeInTheDocument();
  });

  it('ignores an old conversation response after selecting another customer', async () => {
    mocks.conversations = [conversation('Maria Santos'), conversation('Juan Cruz', { id: 'conversation-2' })];
    let finishFirst: ((value: QueryResult) => void) | undefined;
    mocks.query.mockImplementation(query => {
      if (query.table !== 'messages') return;
      if (query.filters.conversation_id === 'conversation-1') return new Promise(resolve => { finishFirst = resolve; });
      return { data: [{ id: 'new-message', sender_id: 'buyer-2', text: 'Juan current message', created_at: '2026-10-01T01:00:00Z' }], error: null };
    });
    renderMessages();
    fireEvent.click((await screen.findByText('Maria Santos')).closest('button')!);
    await waitFor(() => expect(finishFirst).toBeDefined());
    fireEvent.click(screen.getByText('Juan Cruz').closest('button')!);
    expect(await screen.findByText('Juan current message')).toBeInTheDocument();
    await act(async () => { finishFirst?.({ data: [{ id: 'old-message', sender_id: 'buyer-1', text: 'Maria stale message', created_at: '2026-10-01T01:00:00Z' }], error: null }); });
    expect(screen.queryByText('Maria stale message')).not.toBeInTheDocument();
    expect(screen.getByText('Juan current message')).toBeInTheDocument();
  });

  it('keeps separate drafts when changing customers', async () => {
    mocks.conversations = [conversation('Maria Santos'), conversation('Juan Cruz', { id: 'conversation-2' })];
    renderMessages();
    fireEvent.click((await screen.findByText('Maria Santos')).closest('button')!);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Draft for Maria' } });
    fireEvent.click(screen.getByText('Juan Cruz').closest('button')!);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Draft for Juan' } });
    fireEvent.click(screen.getByText('Maria Santos').closest('button')!);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Draft for Maria');
    await waitFor(() => expect(screen.queryByText('Loading messages…')).not.toBeInTheDocument());
  });

  it('blocks switching and editing while a message send is in progress', async () => {
    mocks.conversations = [conversation('Maria Santos'), conversation('Juan Cruz', { id: 'conversation-2' })];
    let finishSend: ((value: QueryResult) => void) | undefined;
    mocks.query.mockImplementation(query => {
      if (query.operation === 'insert') return new Promise(resolve => { finishSend = resolve; });
    });
    renderMessages();
    fireEvent.click((await screen.findByText('Maria Santos')).closest('button')!);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'In progress' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByText('Juan Cruz').closest('button')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
    await act(async () => { finishSend?.({ data: { id: 'confirmed', sender_id: 'seller-1', text: 'In progress', created_at: '2026-10-01T01:00:00Z' }, error: null }); });
    await waitFor(() => expect(screen.getByText('Juan Cruz').closest('button')).not.toBeDisabled());
  });

  it.each([
    { data: null, error: { message: 'Delete denied' }, expected: 'Delete denied' },
    { data: null, error: null, expected: 'Conversation could not be deleted. Refresh and try again.' },
  ])('preserves a conversation after denied or zero-row parent deletion: $expected', async result => {
    mocks.conversations = [conversation('Maria Santos')];
    mocks.query.mockImplementation(query => query.operation === 'delete' ? result : undefined);
    renderMessages();
    fireEvent.click((await screen.findByText('Maria Santos')).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Delete this conversation' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete conversation?' })).getByRole('button', { name: 'Delete conversation' }));
    expect(await screen.findByText(result.expected)).toBeInTheDocument();
    expect(screen.getAllByText('Maria Santos').length).toBeGreaterThan(1);
    const deletes = mocks.query.mock.calls.map(([query]) => query).filter(query => query.operation === 'delete');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatchObject({ table: 'conversations', filters: { id: 'conversation-1', shop_id: 'shop-1' } });
  });
});
