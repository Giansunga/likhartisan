import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { BuyerConversationList, type BuyerConversation, type BuyerMessage } from '../BuyerChatUI';
import BuyerMessageList from '../BuyerMessageList';

const inquiryPayload = JSON.stringify({
  type: 'product_inquiry',
  message: 'Can this be made in blue?',
  productId: 'pot-1',
  productName: 'Clay Pot',
  productPrice: 850,
});

const conversation: BuyerConversation = {
  id: 'conversation-1',
  shop_id: 'shop-1',
  shop_name: 'Test Studio',
  buyer_id: 'buyer-1',
  buyer_unread: 0,
  artisan_unread: 0,
  last_message: inquiryPayload,
  last_message_at: '2026-08-14T07:30:00.000Z',
  created_at: '2026-08-14T07:00:00.000Z',
};

describe('structured chat message rendering', () => {
  it('shows a readable inbox preview instead of the serialized payload', () => {
    const { container } = render(
      <BuyerConversationList
        conversations={[conversation]}
        search=""
        shopImages={{}}
        getActivity={() => ({ active: false, text: 'Offline' })}
        onSearchChange={vi.fn()}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Can this be made in blue?')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('"type":"product_inquiry"');
  });

  it('shows the product card and message when a legacy payload is code-fenced', () => {
    const message: BuyerMessage = {
      id: 'message-1',
      conversation_id: 'conversation-1',
      sender_id: 'buyer-1',
      text: `\`\`\`json\n${inquiryPayload}\n\`\`\``,
      created_at: '2026-08-14T07:30:00.000Z',
    };
    const { container } = render(
      <MemoryRouter>
        <BuyerMessageList
          messages={[message]}
          userId="buyer-1"
          shopName="Test Studio"
          remoteTyping={false}
          endRef={createRef<HTMLDivElement>()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Clay Pot')).toBeInTheDocument();
    expect(screen.getByText('Can this be made in blue?')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('```json');
  });
});
