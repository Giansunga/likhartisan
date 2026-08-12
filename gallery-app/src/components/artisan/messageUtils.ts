import type { ArtisanConversationSummary, ArtisanMessage } from '../../types/artisan';

export type ConversationFilter = 'all' | 'unread';

export interface ParsedMessageContent {
  text: string;
  product?: {
    productId?: string;
    productName?: string;
    productImage?: string;
    productPrice?: number;
    variantDimensions?: string;
  };
  design?: Record<string, unknown>;
}

export function filterConversations(conversations: ArtisanConversationSummary[], search: string, filter: ConversationFilter) {
  const query = search.trim().toLocaleLowerCase();
  return conversations.filter(conversation => {
    if (filter === 'unread' && !conversation.artisan_unread) return false;
    if (!query) return true;
    return [conversation.buyer_name, conversation.buyer_id, conversation.last_message]
      .some(value => value?.toLocaleLowerCase().includes(query));
  });
}

export function parseMessageContent(rawText: string): ParsedMessageContent {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if (parsed.type === 'design_submission' || parsed.type === 'design_request' || parsed.type === 'design_request_update' || parsed.design) {
      return { text: typeof parsed.message === 'string' ? parsed.message : '', design: parsed };
    }
    if (parsed.type === 'product_inquiry') {
      return {
        text: typeof parsed.message === 'string' ? parsed.message : '',
        product: {
          productId: typeof parsed.productId === 'string' ? parsed.productId : undefined,
          productName: typeof parsed.productName === 'string' ? parsed.productName : undefined,
          productImage: typeof parsed.productImage === 'string' ? parsed.productImage : undefined,
          productPrice: typeof parsed.productPrice === 'number' ? parsed.productPrice : undefined,
          variantDimensions: typeof parsed.variantDimensions === 'string' ? parsed.variantDimensions : undefined,
        },
      };
    }
  } catch {
    // Regular messages are intentionally not JSON.
  }
  return { text: rawText };
}

export interface MessageGroup {
  senderId: string;
  dateKey: string;
  messages: ArtisanMessage[];
}

export function groupMessages(messages: ArtisanMessage[]) {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const dateKey = new Date(message.created_at).toDateString();
    const previous = groups[groups.length - 1];
    if (previous?.senderId === message.sender_id && previous.dateKey === dateKey) previous.messages.push(message);
    else groups.push({ senderId: message.sender_id, dateKey, messages: [message] });
  }
  return groups;
}
