import { describe, expect, it } from 'vitest';
import type { ArtisanConversationSummary, ArtisanMessage } from '../../../types/artisan';
import { filterConversations, groupMessages, parseMessageContent } from '../messageUtils';

const conversations: ArtisanConversationSummary[] = [
  { id: 'one', shop_id: 'shop', buyer_id: 'buyer-a', buyer_name: 'Ana Reyes', last_message: 'Is this vase available?', artisan_unread: 2 },
  { id: 'two', shop_id: 'shop', buyer_id: 'buyer-b', buyer_name: 'Marco Cruz', last_message: 'Thank you', artisan_unread: 0 },
];

describe('seller message helpers', () => {
  it('searches customer identity and message previews and filters unread threads', () => {
    expect(filterConversations(conversations, 'vase', 'all').map(item => item.id)).toEqual(['one']);
    expect(filterConversations(conversations, 'buyer-b', 'all').map(item => item.id)).toEqual(['two']);
    expect(filterConversations(conversations, '', 'unread').map(item => item.id)).toEqual(['one']);
  });

  it('parses product inquiries while leaving regular messages unchanged', () => {
    expect(parseMessageContent('Hello there')).toEqual({ text: 'Hello there' });
    expect(parseMessageContent(JSON.stringify({ type: 'product_inquiry', message: 'Can I order this?', productId: 'pot-1', productPrice: 950 }))).toMatchObject({
      text: 'Can I order this?',
      product: { productId: 'pot-1', productPrice: 950 },
    });
  });

  it('recognizes new request and response events while preserving legacy submissions', () => {
    const request = { type: 'design_request', version: 1, request_id: 'request-1', message: 'New design' };
    expect(parseMessageContent(JSON.stringify(request))).toEqual({ text: 'New design', design: request });
    const update = { type: 'design_request_update', version: 1, request_id: 'request-1', message: 'Quote sent' };
    expect(parseMessageContent(JSON.stringify(update))).toEqual({ text: 'Quote sent', design: update });
    const legacy = { type: 'design_submission', message: 'Old design', design: { model: 'Vase' } };
    expect(parseMessageContent(JSON.stringify(legacy))).toEqual({ text: 'Old design', design: legacy });
  });

  it('groups consecutive messages by sender and calendar day', () => {
    const messages: ArtisanMessage[] = [
      { id: '1', conversation_id: 'one', sender_id: 'buyer', text: 'One', created_at: '2026-08-10T08:00:00Z' },
      { id: '2', conversation_id: 'one', sender_id: 'buyer', text: 'Two', created_at: '2026-08-10T08:01:00Z' },
      { id: '3', conversation_id: 'one', sender_id: 'seller', text: 'Three', created_at: '2026-08-10T08:02:00Z' },
      { id: '4', conversation_id: 'one', sender_id: 'seller', text: 'Four', created_at: '2026-08-11T08:02:00Z' },
    ];
    expect(groupMessages(messages).map(group => group.messages.map(message => message.id))).toEqual([['1', '2'], ['3'], ['4']]);
  });
});
