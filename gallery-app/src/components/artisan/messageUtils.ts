import type { ArtisanConversationSummary, ArtisanMessage } from '../../types/artisan';
import { getChatMessagePreview, parseChatMessage, type ParsedChatMessage } from '../../lib/chatMessages';

export type ConversationFilter = 'all' | 'unread';

export type ParsedMessageContent = ParsedChatMessage;

export function filterConversations(conversations: ArtisanConversationSummary[], search: string, filter: ConversationFilter) {
  const query = search.trim().toLocaleLowerCase();
  return conversations.filter(conversation => {
    if (filter === 'unread' && !conversation.artisan_unread) return false;
    if (!query) return true;
    return [conversation.buyer_name, conversation.buyer_id, getChatMessagePreview(conversation.last_message)]
      .some(value => value?.toLocaleLowerCase().includes(query));
  });
}

export function parseMessageContent(rawText: string): ParsedMessageContent {
  return parseChatMessage(rawText);
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
