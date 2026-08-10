import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import DesignMessageCard from '../chat/DesignMessageCard';
import { FALLBACK_BUYER_NAME } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { fmt, formatTime } from '../../lib/utils';
import { useSearchParams } from 'react-router-dom';
import type { ArtisanConversationSummary, ArtisanMessage } from '../../types/artisan';
import { SellerConfirmDialog } from './Overlay';
import { useArtisanPortal } from './artisanContextValue';
import { filterConversations, groupMessages, parseMessageContent, type ConversationFilter } from './messageUtils';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function BuyerAvatar({ conversation, size = 'medium' }: { conversation: ArtisanConversationSummary; size?: 'small' | 'medium' | 'large' }) {
  const name = conversation.buyer_name || FALLBACK_BUYER_NAME;
  return (
    <div className={`seller-message-avatar seller-message-avatar--${size}`}>
      {conversation.buyer_avatar ? <img src={conversation.buyer_avatar} alt={`${name} profile`} /> : <span>{name.charAt(0).toUpperCase()}</span>}
    </div>
  );
}

function ConversationSkeleton() {
  return <div className="seller-message-skeleton" aria-label="Loading conversations">{[1, 2, 3, 4, 5].map(item => <div key={item}><i /><span><b /><small /></span></div>)}</div>;
}

export default function SellerMessages() {
  const [searchParams] = useSearchParams();
  const { shop, userId, buyerActiveMap, loadingMessages, setLoadingMessages } = useArtisanPortal();
  const [conversations, setConversations] = useState<ArtisanConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ArtisanMessage[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ArtisanConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const messageAreaRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find(conversation => conversation.id === selectedId) || null;
  const visibleConversations = useMemo(() => filterConversations(conversations, search, filter), [conversations, filter, search]);
  const groupedMessages = useMemo(() => groupMessages(messages), [messages]);
  const unreadTotal = conversations.reduce((sum, conversation) => sum + (conversation.artisan_unread || 0), 0);

  useEffect(() => {
    const requestedConversation = searchParams.get('conversation');
    if (!requestedConversation || !conversations.length || selectedId === requestedConversation) return;
    const match = conversations.find(conversation => conversation.id === requestedConversation);
    if (match) queueMicrotask(() => chooseConversation(match));
  }, [conversations, searchParams, selectedId]);

  const loadConversations = useCallback(async (silent = false) => {
    setError('');
    if (!silent) setLoadingMessages(true);
    try {
      const { data, error: conversationError } = await supabase
        .from('conversations')
        .select('*')
        .eq('shop_id', shop.id)
        .order('last_message_at', { ascending: false });
      if (conversationError) throw conversationError;
      const rows = (data || []) as ArtisanConversationSummary[];
      const buyerIds = [...new Set(rows.filter(row => !row.buyer_name || row.buyer_name === FALLBACK_BUYER_NAME).map(row => row.buyer_id).filter((id): id is string => Boolean(id)))];
      const emailMap: Record<string, string> = {};
      if (buyerIds.length) {
        const { data: orders } = await supabase.from('orders').select('buyer_email, buyer_id').in('buyer_id', buyerIds);
        for (const order of orders || []) if (order.buyer_id && order.buyer_email && !emailMap[order.buyer_id]) emailMap[order.buyer_id] = order.buyer_email;
      }
      setConversations(rows.map(row => row.buyer_name && row.buyer_name !== FALLBACK_BUYER_NAME ? row : { ...row, buyer_name: (row.buyer_id && emailMap[row.buyer_id]) || FALLBACK_BUYER_NAME }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Conversations could not be loaded.');
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [setLoadingMessages, shop.id]);

  useEffect(() => { queueMicrotask(() => { void loadConversations(); }); }, [loadConversations]);

  useEffect(() => {
    const channel = supabase.channel(`seller-inbox:${shop.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `shop_id=eq.${shop.id}` }, () => { void loadConversations(true); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadConversations, shop.id]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    supabase.from('messages').select('*').eq('conversation_id', selectedId).order('created_at', { ascending: true })
      .then(({ data, error: messageError }) => {
        if (!active) return;
        if (messageError) setError(messageError.message);
        else setMessages((data || []) as ArtisanMessage[]);
        setMessagesLoading(false);
      });
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase.channel(`seller-messages:${selectedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` }, payload => {
        const incoming = payload.new as ArtisanMessage;
        setMessages(current => current.some(message => message.id === incoming.id) ? current : [...current, incoming]);
        if (incoming.sender_id !== userId) void supabase.from('conversations').update({ artisan_unread: 0 }).eq('id', selectedId).select('id').maybeSingle();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedId, userId]);

  useEffect(() => {
    const area = messageAreaRef.current;
    if (!area) return;
    requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
  }, [messages.length, selectedId]);

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  function chooseConversation(conversation: ArtisanConversationSummary) {
    setSelectedId(conversation.id);
    setMessages([]);
    setMessagesLoading(true);
    setError('');
    if (conversation.artisan_unread) {
      setConversations(current => current.map(item => item.id === conversation.id ? { ...item, artisan_unread: 0 } : item));
      void supabase.from('conversations').update({ artisan_unread: 0 }).eq('id', conversation.id).select('id').maybeSingle()
        .then(({ error: readError }) => { if (readError) setError(readError.message); });
    }
  }

  function closeConversation() {
    setSelectedId(null);
    setMessages([]);
    setMessagesLoading(false);
  }

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) {
      setError('Choose a JPG, PNG, WebP, or GIF image no larger than 5 MB.');
      return;
    }
    setPendingImage(file);
    setImagePreview(URL.createObjectURL(file));
    setError('');
  }

  function clearAttachment() {
    setPendingImage(null);
    setImagePreview(null);
  }

  async function sendMessage() {
    const text = draft.trim();
    if ((!text && !pendingImage) || !selected || sending) return;
    setSending(true);
    setError('');
    try {
      let imageUrl: string | null = null;
      if (pendingImage) {
        const safeName = pendingImage.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `chat/${selected.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('products').upload(path, pendingImage, { cacheControl: '3600', contentType: pendingImage.type, upsert: false });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from('products').getPublicUrl(path).data.publicUrl;
      }
      const { data, error: insertError } = await supabase.from('messages').insert({ conversation_id: selected.id, sender_id: userId, text, image_url: imageUrl }).select('*').single();
      if (insertError) throw insertError;
      const now = new Date().toISOString();
      const preview = text || 'Image attachment';
      const nextBuyerUnread = (selected.buyer_unread || 0) + 1;
      const { error: conversationError } = await supabase.from('conversations').update({ last_message: preview, last_message_at: now, buyer_unread: nextBuyerUnread }).eq('id', selected.id).select('id').single();
      setMessages(current => current.some(message => message.id === data.id) ? current : [...current, data as ArtisanMessage]);
      setConversations(current => current.map(conversation => conversation.id === selected.id ? { ...conversation, last_message: preview, last_message_at: now, buyer_unread: nextBuyerUnread } : conversation));
      setDraft('');
      clearAttachment();
      if (conversationError) setError('Your message was sent, but the inbox preview could not be refreshed.');
      await supabase.from('shops').update({ last_seen_at: now }).eq('id', shop.id);
    } catch (sendError) {
      setError(`${sendError instanceof Error ? sendError.message : 'Message could not be sent.'} Your draft is still here.`);
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function deleteConversation() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const { error: messagesError } = await supabase.from('messages').delete().eq('conversation_id', deleteTarget.id);
      if (messagesError) throw messagesError;
      const { error: conversationError } = await supabase.from('conversations').delete().eq('id', deleteTarget.id);
      if (conversationError) throw conversationError;
      setConversations(current => current.filter(conversation => conversation.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) closeConversation();
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Conversation could not be deleted.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="seller-messages-page">
      {error ? <div className="seller-message-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={16} /></button></div> : null}

      <div className={`seller-messages ${selected ? 'has-selection' : ''}`}>
        <aside className="seller-inbox" aria-label="Customer conversations">
          <div className="seller-inbox__toolbar">
            <div className="seller-inbox__search"><Search size={16} aria-hidden="true" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customers or messages" aria-label="Search conversations" /></div>
            <div className="seller-inbox__filters" aria-label="Conversation filters">{(['all', 'unread'] as ConversationFilter[]).map(value => <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : `Unread${unreadTotal ? ` (${unreadTotal})` : ''}`}</button>)}</div>
          </div>
          <div className="seller-inbox__list">
            {loadingMessages ? <ConversationSkeleton /> : visibleConversations.length ? visibleConversations.map(conversation => {
              const active = selectedId === conversation.id;
              const online = Boolean(conversation.buyer_id && buyerActiveMap[conversation.buyer_id]);
              return <div className={`seller-conversation ${active ? 'is-active' : ''} ${conversation.artisan_unread ? 'is-unread' : ''}`} key={conversation.id}>
                <button type="button" className="seller-conversation__select" onClick={() => chooseConversation(conversation)} aria-pressed={active}>
                  <div className="seller-message-avatar-wrap"><BuyerAvatar conversation={conversation} /><i className={online ? 'is-online' : ''} aria-label={online ? 'Online' : 'Offline'} /></div>
                  <div className="seller-conversation__copy"><div><strong>{conversation.buyer_name || FALLBACK_BUYER_NAME}</strong><time>{formatTime(conversation.last_message_at || '')}</time></div><p>{conversation.last_message || 'Start the conversation'}</p></div>
                  {conversation.artisan_unread ? <b className="seller-conversation__badge">{conversation.artisan_unread > 99 ? '99+' : conversation.artisan_unread}</b> : null}
                </button>
                <button type="button" className="seller-conversation__menu" onClick={() => setDeleteTarget(conversation)} aria-label={`Delete conversation with ${conversation.buyer_name || FALLBACK_BUYER_NAME}`}><Trash2 size={15} /></button>
              </div>;
            }) : <div className="seller-inbox-empty"><MessageCircle size={34} /><strong>{search || filter === 'unread' ? 'No matching conversations' : 'Your inbox is ready'}</strong><p>{search || filter === 'unread' ? 'Try another search or view all conversations.' : 'New customer messages will appear here.'}</p></div>}
          </div>
        </aside>

        <section className="seller-chat" aria-label={selected ? `Conversation with ${selected.buyer_name || FALLBACK_BUYER_NAME}` : 'Conversation'}>
          {selected ? <>
            <header className="seller-chat__header">
              <button className="seller-chat__back" type="button" onClick={closeConversation} aria-label="Back to conversations"><ArrowLeft size={19} /></button>
              <div className="seller-message-avatar-wrap"><BuyerAvatar conversation={selected} /><i className={selected.buyer_id && buyerActiveMap[selected.buyer_id] ? 'is-online' : ''} /></div>
              <div><strong>{selected.buyer_name || FALLBACK_BUYER_NAME}</strong><span>{selected.buyer_id && buyerActiveMap[selected.buyer_id] ? 'Active now' : 'Customer'}</span></div>
              <button className="seller-chat__delete" type="button" onClick={() => setDeleteTarget(selected)} aria-label="Delete this conversation"><Trash2 size={17} /></button>
            </header>
            <div className="seller-chat__messages" ref={messageAreaRef}>
              {messagesLoading ? <div className="seller-chat-loading"><LoaderCircle className="seller-spin" /> Loading messages…</div> : messages.length ? <div className="seller-chat__message-list">{groupedMessages.map((group, groupIndex) => {
                const outgoing = group.senderId === userId;
                const lastMessage = group.messages[group.messages.length - 1];
                const previousDate = groupedMessages[groupIndex - 1]?.dateKey;
                return <div key={`${group.dateKey}-${group.senderId}-${groupIndex}`}>
                  {previousDate !== group.dateKey ? <div className="seller-chat__date"><span>{new Date(group.dateKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div> : null}
                  <div className={`seller-chat-group is-${outgoing ? 'outgoing' : 'incoming'}`}>
                    {group.messages.map((message, messageIndex) => {
                      const content = parseMessageContent(message.text);
                      const isLast = messageIndex === group.messages.length - 1;
                      return <div className="seller-chat-row" key={message.id}>
                        {!outgoing ? isLast ? <BuyerAvatar conversation={selected} size="small" /> : <span className="seller-chat-avatar-space" /> : null}
                        <div className="seller-chat-bubble-wrap">
                          {content.design ? <DesignMessageCard data={content.design as Record<string, unknown>} audience="artisan" /> : null}
                          {content.product?.productId ? <a className="seller-message-product" href={`/product/${content.product.productId}`} target="_blank" rel="noreferrer">{content.product.productImage ? <img src={content.product.productImage} alt="" /> : <ImageIcon />}<span><strong>{content.product.productName || 'Product inquiry'}</strong>{content.product.variantDimensions ? <small>{content.product.variantDimensions}</small> : null}<b>{fmt(content.product.productPrice || 0)}</b></span></a> : null}
                          <div className="seller-chat-bubble">{message.image_url ? <a className="seller-chat-image" href={message.image_url} target="_blank" rel="noreferrer"><img src={message.image_url} alt="Customer attachment" /></a> : null}{content.text ? <span>{content.text}</span> : null}</div>
                        </div>
                      </div>;
                    })}
                    <div className="seller-chat-group__time"><time>{new Date(lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{outgoing ? <Check size={13} aria-label="Sent" /> : null}</div>
                  </div>
                </div>;
              })}</div> : <div className="seller-chat-empty"><BuyerAvatar conversation={selected} size="large" /><strong>Start the conversation</strong><p>Reply to {selected.buyer_name || FALLBACK_BUYER_NAME} below.</p></div>}
            </div>
            <footer className="seller-composer">
              {imagePreview ? <div className="seller-composer__attachment"><img src={imagePreview} alt="Attachment preview" /><span><strong>{pendingImage?.name}</strong><small>{pendingImage ? `${(pendingImage.size / 1024 / 1024).toFixed(1)} MB` : ''}</small></span><button type="button" onClick={clearAttachment} aria-label="Remove attachment"><X size={16} /></button></div> : null}
              <div className="seller-composer__row"><label className="seller-composer__attach" aria-label="Attach an image"><Paperclip size={18} /><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={pickImage} /></label><textarea rows={1} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Write a message…" aria-label="Message" /><button className="seller-composer__send" type="button" disabled={(!draft.trim() && !pendingImage) || sending} onClick={() => void sendMessage()} aria-label="Send message">{sending ? <LoaderCircle className="seller-spin" size={18} /> : <Send size={18} />}</button></div>
              <small>Enter to send · Shift + Enter for a new line</small>
            </footer>
          </> : <div className="seller-chat-placeholder"><div><MessageCircle size={31} /></div><strong>Select a conversation</strong><p>Choose a customer from your inbox to view and reply to their messages.</p></div>}
        </section>

        <aside className="seller-buyer-panel" aria-label="Customer details">
          {selected ? <><div className="seller-buyer-panel__identity"><BuyerAvatar conversation={selected} size="large" /><strong>{selected.buyer_name || FALLBACK_BUYER_NAME}</strong><span><i className={selected.buyer_id && buyerActiveMap[selected.buyer_id] ? 'is-online' : ''} />{selected.buyer_id && buyerActiveMap[selected.buyer_id] ? 'Active now' : 'Offline'}</span></div><div className="seller-buyer-panel__card"><h3>Conversation details</h3><dl><div><dt>Started</dt><dd>{selected.created_at ? new Date(selected.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not available'}</dd></div><div><dt>Messages</dt><dd>{messages.length}</dd></div><div><dt>Status</dt><dd>{selected.artisan_unread ? 'Unread' : 'Up to date'}</dd></div></dl></div><button className="seller-buyer-panel__danger" type="button" onClick={() => setDeleteTarget(selected)}><Trash2 size={16} /> Delete conversation</button></> : <div className="seller-buyer-placeholder"><UserRound size={30} /><p>Customer details appear when you select a conversation.</p></div>}
        </aside>
      </div>

      <SellerConfirmDialog open={Boolean(deleteTarget)} title="Delete conversation?" description="The conversation and every message in it will be permanently removed. This cannot be undone." confirmLabel="Delete conversation" busy={deleting} onClose={() => { if (!deleting) setDeleteTarget(null); }} onConfirm={() => void deleteConversation()} />
    </div>
  );
}
