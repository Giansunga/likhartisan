import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesignMessageCard from '../DesignMessageCard';
import BuyerMessageList from '../BuyerMessageList';
import type { DesignRequestMessagePayload } from '../../../types/designRequest';

type Row = Record<string, unknown>;
type Result = { data: Row | null; error: Error | null };
const mocks = vi.hoisted(() => ({
  live: null as Row | null, revisions: {} as Record<string, Row>, revisionError: false,
  loadRevision: null as null | ((key: string) => Promise<Result>),
  loadRequest: null as null | (() => Promise<Result>),
  listeners: new Map<string, (() => void)[]>(), openQuoteReview: vi.fn(), checkout: vi.fn(), channel: vi.fn(),
}));
vi.mock('../QuoteReviewContext', () => ({ useQuoteReview: () => mocks.openQuoteReview }));
vi.mock('../../../lib/designQuoteCheckout', () => ({ checkoutDesignOrder: mocks.checkout }));
vi.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      maybeSingle: async () => {
        if (table === 'design_requests') return mocks.loadRequest ? mocks.loadRequest() : { data: structuredClone(mocks.live), error: null };
        const key = `${filters.request_id}:${filters.revision_number}`;
        return mocks.loadRevision ? mocks.loadRevision(key) : { data: structuredClone(mocks.revisions[key] ?? null), error: mocks.revisionError ? new Error('Unavailable') : null };
      },
    };
    return query;
  },
  channel: (name: string) => {
    mocks.channel(name);
    const listeners: (() => void)[] = [];
    mocks.listeners.set(name, listeners);
    const channel = { on: (_kind: string, _filter: unknown, handler: () => void) => { listeners.push(handler); return channel; }, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
} }));

const submitted: DesignRequestMessagePayload = { type: 'design_request', version: 1, request_id: 'request-1', revision_number: 1, event_type: 'submitted', message: 'Design sent', summary: { model: 'Original vase', finish: 'matte', quantity: 100, status: 'pending' } };
const quoteA: DesignRequestMessagePayload = { type: 'design_request_update', version: 1, request_id: 'request-1', revision_number: 1, event_type: 'quoted', status: 'quoted', message: 'Quote A', quoted_price: 2500, lead_time_days: 10, shop_response: 'First artisan quote' };
const quoteB: DesignRequestMessagePayload = { ...quoteA, message: 'Quote B', quoted_price: 3000, lead_time_days: 12, shop_response: 'Second artisan quote' };
const approved: DesignRequestMessagePayload = { ...quoteA, event_type: 'approved', status: 'approved', message: 'Approved quote', order_id: 'order-1', quoted_price: undefined, lead_time_days: undefined, shop_response: undefined };
function revision(number: number, name: string, height: number, quantity: number, finish: string, pattern: string): Row {
  return { request_id: 'request-1', revision_number: number, quantity, design_snapshot: { version: 1, model: { name, thumbnail: `/${name}.png` }, shape: { unit: 'in', height, bodyWidth: 9 }, material: { finish, color: '#315A9F' }, decoration: { patternId: pattern }, dimensions: { heightIn: height, widthIn: 9, unit: 'in' } } };
}
function makeLive(payload: DesignRequestMessagePayload) {
  mocks.live = { id: payload.request_id, current_revision: payload.revision_number, status: payload.status, quoted_price: payload.quoted_price ?? null, lead_time_days: payload.lead_time_days ?? null, shop_response: payload.shop_response ?? '', order_id: payload.order_id ?? null, order: payload.order_id ? { id: payload.order_id, payment_status: 'pending' } : null, design_snapshot: { model: { name: 'LATEST DESIGN MUST NOT REPLACE HISTORY' } } };
}
function cards(payloads: DesignRequestMessagePayload[], audience: 'buyer' | 'artisan' = 'buyer') {
  return <>{payloads.map((data, index) => <section key={`${data.request_id}-${index}`} data-testid={`card-${index}`}><DesignMessageCard data={data as unknown as Row} audience={audience} isLatestForRequest={index === payloads.length - 1} /></section>)}</>;
}
async function settle() { await waitFor(() => expect(screen.queryAllByText('Loading original design…')).toHaveLength(0)); }
async function updateLive(payload: DesignRequestMessagePayload) {
  makeLive(payload);
  await act(async () => mocks.listeners.get(`design-request-card:${payload.request_id}`)?.forEach(callback => callback()));
}
beforeEach(() => {
  mocks.revisions = { 'request-1:1': revision(1, 'Original vase', 15, 100, 'matte', 'wave'), 'request-1:2': revision(2, 'Revised planter', 20, 150, 'glazed', 'floral-orchid') };
  mocks.revisionError = false; mocks.loadRevision = null; mocks.loadRequest = null; mocks.listeners.clear();
  vi.clearAllMocks(); mocks.checkout.mockResolvedValue(undefined); makeLive(quoteA);
});
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); });

describe('immutable design-message history', () => {
  it.each(['buyer', 'artisan'] as const)('preserves separate submission and quote messages after approval and reopening for %s', async audience => {
    const view = render(cards([submitted, quoteA], audience));
    await settle();
    await updateLive(quoteB); view.rerender(cards([submitted, quoteA, quoteB], audience)); await settle();
    await updateLive(approved); view.rerender(cards([submitted, quoteA, quoteB, approved], audience)); await settle();
    const verify = () => {
      expect(within(screen.getByTestId('card-0')).getByText('Pending')).toBeInTheDocument();
      for (const [index, price, days, response] of [[1, '₱2,500.00', '10 days', 'First artisan quote'], [2, '₱3,000.00', '12 days', 'Second artisan quote']] as const) {
        const card = within(screen.getByTestId(`card-${index}`));
        for (const text of [price, days, response, 'Quoted']) expect(card.getByText(text)).toBeInTheDocument();
      }
      expect(within(screen.getByTestId('card-3')).getByText('Approved')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Review Shop Quote' })).not.toBeInTheDocument();
      expect(screen.queryByText('LATEST DESIGN MUST NOT REPLACE HISTORY')).not.toBeInTheDocument();
    };
    verify(); view.unmount(); render(cards([submitted, quoteA, quoteB, approved], audience)); await settle(); verify();
  });

  it('preserves requested changes and revision-specific designs when a newer design is quoted', async () => {
    const changes: DesignRequestMessagePayload = { ...quoteA, event_type: 'changes_requested', status: 'changes_requested', shop_response: 'Make the vase taller', quoted_price: null, lead_time_days: null };
    const revised: DesignRequestMessagePayload = { ...submitted, type: 'design_request_update', revision_number: 2, event_type: 'revised', status: 'pending', summary: undefined };
    const newQuote = { ...quoteB, revision_number: 2 }; makeLive(newQuote);
    render(cards([submitted, changes, revised, newQuote])); await settle();
    const old = within(screen.getByTestId('card-1')), next = within(screen.getByTestId('card-2'));
    for (const text of ['Changes Requested', 'Make the vase taller', 'Original vase', 'Matte', 'Waves', '100', 'H 15.00 in · W 9.00 in']) expect(old.getByText(text)).toBeInTheDocument();
    for (const text of ['Revised planter', 'Glossy', 'Sampaguita', '150', 'H 20.00 in · W 9.00 in']) expect(next.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Revise Design' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Review Shop Quote' })).toBeInTheDocument();
  });

  it('allows only the latest matching quote and hides the action when a realtime quote supersedes it', async () => {
    makeLive(quoteB); render(cards([submitted, quoteA, quoteB]));
    fireEvent.click(await screen.findByRole('button', { name: 'Review Shop Quote' }));
    expect(mocks.openQuoteReview).toHaveBeenCalledWith('request-1'); expect(mocks.channel).toHaveBeenCalledTimes(1);
    await updateLive({ ...quoteB, quoted_price: 3500 });
    expect(screen.queryByRole('button', { name: 'Review Shop Quote' })).not.toBeInTheDocument();
    expect(screen.getByText('₱3,000.00')).toBeInTheDocument(); expect(screen.queryByText('₱3,500.00')).not.toBeInTheDocument();
  });

  it('offers revision only for the newest matching changes-requested event', async () => {
    const changes = { ...quoteA, status: 'changes_requested' as const, event_type: 'changes_requested' as const, shop_response: 'Change the pattern' };
    makeLive(changes); render(cards([submitted, changes]));
    expect(await screen.findByRole('link', { name: 'Revise Design' })).toHaveAttribute('href', '/freeform?revise=1&requestId=request-1');
    await updateLive({ ...submitted, revision_number: 2, status: 'pending' });
    expect(screen.queryByRole('link', { name: 'Revise Design' })).not.toBeInTheDocument(); expect(screen.getByText('Change the pattern')).toBeInTheDocument();
  });

  it('updates payment eligibility without changing the approval or older quotes', async () => {
    makeLive(approved); render(cards([quoteB, approved]));
    fireEvent.click(await screen.findByRole('button', { name: 'Pay now' })); expect(mocks.checkout).toHaveBeenCalledWith('order-1');
    mocks.live = { ...mocks.live, order: { id: 'order-1', payment_status: 'paid' } };
    await act(async () => mocks.listeners.get('design-request-card:request-1')?.forEach(callback => callback()));
    expect(screen.queryByRole('button', { name: 'Pay now' })).not.toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument(); expect(screen.getByText('₱3,000.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View approved order' })).toHaveAttribute('href', '/dashboard?tab=purchases&order=order-1');
  });

  it.each(['missing', 'error', 'rejection', 'no revision number'])('preserves available payload content when history has %s', async failure => {
    mocks.revisions = {}; mocks.revisionError = failure === 'error';
    if (failure === 'rejection') mocks.loadRevision = async () => { throw new Error('Network failed'); };
    render(cards([{ ...submitted, revision_number: failure === 'no revision number' ? undefined : 1 }]));
    expect(await screen.findByText('Original design details unavailable')).toBeInTheDocument();
    for (const text of ['Original vase', '100', 'Pending']) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText('LATEST DESIGN MUST NOT REPLACE HISTORY')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Review Shop Quote' })).not.toBeInTheDocument();
  });

  it('discards delayed revision responses when the same card switches to another revision', async () => {
    let finish!: (result: Result) => void;
    mocks.loadRevision = key => key === 'request-1:1' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ data: mocks.revisions[key], error: null });
    const view = render(cards([quoteA])); await waitFor(() => expect(finish).toBeTypeOf('function'));
    const revised = { ...quoteB, revision_number: 2 }; makeLive(revised); view.rerender(cards([revised]));
    await screen.findByText('Revised planter'); await act(async () => finish({ data: mocks.revisions['request-1:1'], error: null }));
    expect(screen.queryByText('Original vase')).not.toBeInTheDocument(); expect(screen.getByText('Revised planter')).toBeInTheDocument();
  });

  it('discards delayed history and live responses after switching to another request', async () => {
    let finishRevision!: (result: Result) => void, finishLive!: (result: Result) => void;
    mocks.loadRevision = () => new Promise(resolve => { finishRevision = resolve; }); mocks.loadRequest = () => new Promise(resolve => { finishLive = resolve; });
    const view = render(<DesignMessageCard data={quoteA as unknown as Row} isLatestForRequest />);
    await waitFor(() => expect(finishLive).toBeTypeOf('function')); const oldLive = structuredClone(mocks.live);
    const next = { ...quoteB, request_id: 'request-2', revision_number: 2 }; makeLive(next);
    mocks.revisions['request-2:2'] = revision(2, 'Other request planter', 20, 150, 'glazed', ''); mocks.loadRevision = null; mocks.loadRequest = null;
    view.rerender(<DesignMessageCard data={next as unknown as Row} isLatestForRequest />); await screen.findByText('Other request planter');
    await act(async () => { finishRevision({ data: mocks.revisions['request-1:1'], error: null }); finishLive({ data: oldLive, error: null }); });
    expect(screen.queryByText('Original vase')).not.toBeInTheDocument(); fireEvent.click(await screen.findByRole('button', { name: 'Review Shop Quote' })); expect(mocks.openQuoteReview).toHaveBeenLastCalledWith('request-2');
  });

  it('ignores an older live fetch after a newer realtime response arrives', async () => {
    let finish!: (result: Result) => void; const stale = structuredClone(mocks.live);
    mocks.loadRequest = () => new Promise(resolve => { finish = resolve; }); render(cards([quoteA])); await waitFor(() => expect(finish).toBeTypeOf('function'));
    mocks.loadRequest = null; await updateLive(quoteB); await act(async () => finish({ data: stale, error: null }));
    expect(screen.queryByRole('button', { name: 'Review Shop Quote' })).not.toBeInTheDocument(); expect(screen.getByText('₱2,500.00')).toBeInTheDocument();
  });

  it('keeps buyer-chat history and the latest action when ordinary messages arrive', async () => {
    makeLive(quoteB);
    const messages = [submitted, quoteA, quoteB].map((payload, i) => ({ id: `message-${i}`, conversation_id: 'conversation-1', sender_id: i ? 'shop-1' : 'buyer-1', text: JSON.stringify(payload), created_at: '2026-10-01T01:00:00Z' }));
    const tree = (rows: typeof messages) => <BuyerMessageList messages={rows} userId="buyer-1" shopName="Artisan" remoteTyping={false} endRef={createRef<HTMLDivElement>()} />;
    const view = render(tree(messages)); await screen.findByRole('button', { name: 'Review Shop Quote' }); await settle();
    const originalCard = screen.getByText('First artisan quote').closest('.chat-design-request-card');
    view.rerender(tree([...messages, { ...messages[2], id: 'plain-text', text: 'Let me know what you think.' }])); await screen.findByText('Let me know what you think.');
    expect(screen.getByText('First artisan quote').closest('.chat-design-request-card')).toBe(originalCard);
    expect(screen.queryAllByText('Loading original design…')).toHaveLength(0);
    expect(await screen.findAllByRole('button', { name: 'Review Shop Quote' })).toHaveLength(1);
    for (const text of ['Pending', '₱2,500.00', '₱3,000.00']) expect(screen.getByText(text)).toBeInTheDocument();
  });
});
