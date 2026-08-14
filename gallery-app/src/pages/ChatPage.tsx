import { useCallback, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../lib/api';
import { FALLBACK_BUYER_NAME } from '../lib/constants';
import { getChatMessagePreview } from '../lib/chatMessages';
import { useMediaQuery } from '../hooks/useMediaQuery';
import BuyerMessageList from '../components/chat/BuyerMessageList';
import {
  BuyerChatHeader,
  BuyerConversationList,
  BuyerMessageComposer,
  BuyerNewConversationDialog,
  BuyerShopAvatar,
  BuyerShopDetails,
  type BuyerConversation as Conversation,
  type BuyerMessage as Message,
  type BuyerShop as Shop,
} from '../components/chat/BuyerChatUI';
import './ChatPage.css';

type ShopSeenRow = { id: string; image?: string | null; last_seen_at?: string | null };
type ProductIdRow = { id: string };
type ReviewRow = { rating: number };

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [shopSearch, setShopSearch] = useState('');
  const [convSearch, setConvSearch] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopImageMap, setShopImageMap] = useState<Record<string, string>>({});
  const [shopStats, setShopStats] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const remoteTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showShopDetails, setShowShopDetails] = useState(false);
  const [shopPresenceMap, setShopPresenceMap] = useState<Record<string, boolean>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});
  const { user } = useAuth();
  const closeShopDetails = useCallback(() => setShowShopDetails(false), []);
  const closeNewChat = useCallback(() => setShowNewChat(false), []);

  async function init() {
    if (user) {
      setUserId(user.id);
      await fetchConversations(user.id);
    }
    await fetchShops();
    setLoading(false);
  }

  async function fetchShops() {
    const { data } = await supabase.from('shops').select('*').order('name');
    if (data) {
      setShops(data);
      const map: Record<string, string> = {};
      const seenMap: Record<string, string> = {};
      data.forEach((s: ShopSeenRow) => { if (s.image) map[s.id] = s.image; if (s.last_seen_at) seenMap[s.id] = s.last_seen_at; });
      setShopImageMap(prev => ({ ...prev, ...map }));
      setLastSeenMap(prev => ({ ...prev, ...seenMap }));
    }
  }

  async function fetchShop(shopId: string) {
    const { data } = await supabase.from('shops').select('*').eq('id', shopId).single();
    if (data) {
      setSelectedShop(data);
      if (data.image) setShopImageMap(prev => ({ ...prev, [shopId]: data.image }));
      if (data.last_seen_at) setLastSeenMap(prev => ({ ...prev, [shopId]: data.last_seen_at }));
    }
  }

  async function fetchShopStats(shopId: string) {
    const { data: products } = await supabase
      .from('products').select('id').eq('shop_id', shopId).eq('status', 'active');
    if (!products || products.length === 0) { setShopStats({ avg: 0, count: 0 }); return; }
    const productIds = products.map((p: ProductIdRow) => p.id);
    const { data: reviews } = await supabase
      .from('product_reviews').select('rating').in('product_id', productIds);
    if (!reviews || reviews.length === 0) { setShopStats({ avg: 0, count: 0 }); return; }
    const total = reviews.reduce((s: number, r: ReviewRow) => s + r.rating, 0);
    setShopStats({ avg: total / reviews.length, count: reviews.length });
  }

  async function fetchConversations(uid: string) {
    const { data } = await supabase
      .from('conversations').select('*').eq('buyer_id', uid)
      .order('last_message_at', { ascending: false });
    if (data) {
      setConversations(data);
      const shopIds = [...new Set(data.map((c: Conversation) => c.shop_id).filter(Boolean))];
      if (shopIds.length > 0) {
        const { data: shopData } = await supabase.from('shops').select('id, image, last_seen_at').in('id', shopIds);
        if (shopData) {
          const map: Record<string, string> = {};
          const seenMap: Record<string, string> = {};
          shopData.forEach((s: ShopSeenRow) => { if (s.image) map[s.id] = s.image; if (s.last_seen_at) seenMap[s.id] = s.last_seen_at; });
          setShopImageMap(prev => ({ ...prev, ...map }));
          setLastSeenMap(prev => ({ ...prev, ...seenMap }));
        }
      }
    }
  }

  async function fetchMessages(convId: string) {
    const { data } = await supabase
      .from('messages').select('*').eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  }

  async function startConversation(shop: Shop) {
    const uid = user?.id;
    if (!uid) { toast.error('Please sign in to start a conversation.'); return; }

    const existing = conversations.find(c => c.shop_id === shop.id);
    if (existing) {
      setSelectedConv(existing);
      setMobileShowChat(true);
      setShowNewChat(false);
      return;
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({ buyer_id: uid, shop_id: shop.id, shop_name: shop.name, last_message: '', last_message_at: new Date().toISOString() })
      .select().single();

    if (error) { toast.error('Failed: ' + error.message); return; }
    if (data) {
      setConversations(prev => {
        if (prev.some(c => c.id === data.id)) return prev;
        return [data, ...prev];
      });
      setSelectedConv(data);
      setMobileShowChat(true);
      setShowNewChat(false);
    }
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPendingImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
    if (e.target) e.target.value = '';
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setPendingImage(null);
    setImagePreview(null);
  }

  async function uploadImage(file: File): Promise<string | null> {
    const path = `chat/${selectedConv!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const { error: upErr } = await supabase.storage.from('products').upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) { toast.error('Upload failed: ' + upErr.message); return null; }
    const { data } = supabase.storage.from('products').getPublicUrl(path);
    return data.publicUrl;
  }

  async function sendMessage() {
    if ((!newMessage.trim() && !pendingImage) || !selectedConv || !userId) return;
    const text = newMessage.trim();
    setNewMessage('');
    setUploading(true);
    try {
      let imageUrl: string | null = null;
      if (pendingImage) {
        imageUrl = await uploadImage(pendingImage);
        if (imageUrl === null) { setUploading(false); return; }
      }
      const { data } = await supabase
        .from('messages')
        .insert({ conversation_id: selectedConv.id, sender_id: userId, text, image_url: imageUrl })
        .select().single();
      if (data) {
        setMessages(prev => [...prev, data]);
        await supabase.from('conversations').update({ last_message: text || '📷 Image', last_message_at: new Date().toISOString(), artisan_unread: (selectedConv.artisan_unread || 0) + 1 }).eq('id', selectedConv.id);
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, last_message: text || '📷 Image', last_message_at: new Date().toISOString(), artisan_unread: (selectedConv.artisan_unread || 0) + 1 } : c));
        // Create real notification for shop owner via backend API to bypass RLS
        try {
          const meta = user?.user_metadata || {};
          const buyerName = meta.name || FALLBACK_BUYER_NAME;
          const { data: { session } } = await supabase.auth.getSession();
          await fetch(`${API_BASE}/api/notifications`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session ? { Authorization: `Bearer ${session.access_token}` } : {})
            },
            body: JSON.stringify({
              type: 'message',
              title: 'New Message',
              message: `${buyerName}: ${(text || '📷 Image').substring(0, 80)}`,
              conversation_id: selectedConv.id,
              product_image: '',
            })
          });
        } catch (e) { console.error('Failed to create message notification:', e); }
      }
    } finally {
      removeImage();
      setUploading(false);
    }
  }

  async function deleteConversation(convId: string) {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    await supabase.from('messages').delete().eq('conversation_id', convId);
    await supabase.from('conversations').delete().eq('id', convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (selectedConv?.id === convId) {
      setSelectedConv(null);
      setMessages([]);
      setShowShopDetails(false);
    }
  }

  function selectConversation(conversation: Conversation) {
    setSelectedConv(conversation);
    setShowShopDetails(false);
    if (isMobile) setMobileShowChat(true);
  }

  const filteredShops = shops.filter(s => s.name.toLowerCase().includes(shopSearch.toLowerCase()) || s.description?.toLowerCase().includes(shopSearch.toLowerCase()));
  const filteredConvs = conversations.filter(c => c.shop_name?.toLowerCase().includes(convSearch.toLowerCase()));

  function getShopActiveStatus(shopId: string): { active: boolean; text: string } {
    if (shopPresenceMap[shopId]) {
      return { active: true, text: 'Active Now' };
    }
    const lastSeen = lastSeenMap[shopId];
    if (lastSeen) {
      const mins = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000);
      if (mins > 0 && mins <= 1440) {
        if (mins < 2) return { active: false, text: 'Active 1m ago' };
        if (mins < 60) return { active: false, text: `Active ${mins}m ago` };
        const hrs = Math.floor(mins / 60);
        if (hrs === 1) return { active: false, text: 'Active 1h ago' };
        if (hrs <= 24) return { active: false, text: `Active ${hrs}h ago` };
      }
    }
    return { active: false, text: '' };
  }

  useEffect(() => {
    const requestedConversation = searchParams.get('conversation');
    if (!requestedConversation || !conversations.length) return;
    const match = conversations.find(conversation => conversation.id === requestedConversation);
    if (match && match.id !== selectedConv?.id) queueMicrotask(() => { setSelectedConv(match); setMobileShowChat(true); });
  }, [conversations, searchParams, selectedConv?.id]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { queueMicrotask(() => void init()); }, [user]);

  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile]);

  useEffect(() => {
    if (!selectedConv) return;
    queueMicrotask(() => setShowShopDetails(false));
    queueMicrotask(() => {
      void fetchMessages(selectedConv.id);
      void fetchShop(selectedConv.shop_id);
      void fetchShopStats(selectedConv.shop_id);
    });
    const timeout = setTimeout(() => {
      const container = document.querySelector('.chat-messages-area');
      if (container) container.scrollTop = container.scrollHeight;
    }, 100);
    return () => clearTimeout(timeout);
  }, [selectedConv]);

  // Real-time: subscribe to messages for active conversation
  useEffect(() => {
    if (!selectedConv) return;
    const channel = supabase
      .channel(`messages:${selectedConv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConv.id}` }, async (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        // Conversation is actively viewed - keep buyer_unread at 0 in DB
        if (newMsg.sender_id !== userId) {
          await supabase.from('conversations').update({ buyer_unread: 0 }).eq('id', selectedConv.id);
        }
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? {
          ...c,
          last_message: getChatMessagePreview(newMsg.text) || (newMsg.image_url ? 'Image attachment' : ''),
          last_message_at: newMsg.created_at,
        } : c));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConv, userId]);

  // Real-time typing indicator (broadcast - no DB writes).
  useEffect(() => {
    if (!selectedConv) return;
    const ch = supabase
      .channel(`typing:${selectedConv.id}`)
      .on('broadcast', { event: 'typing' }, () => {
        setRemoteTyping(true);
        if (remoteTypingRef.current) clearTimeout(remoteTypingRef.current);
        remoteTypingRef.current = setTimeout(() => setRemoteTyping(false), 3000);
      })
      .subscribe();
    typingChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); typingChannelRef.current = null; };
  }, [selectedConv]);

  // Listen for artisan presence on all conversation shops.
  useEffect(() => {
    if (conversations.length === 0) return;
    const shopIds = [...new Set(conversations.map(c => c.shop_id).filter(Boolean))];
    const channels = shopIds.map(sid => {
      const ch = supabase.channel(`shop:${sid}`);
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        setShopPresenceMap(prev => ({ ...prev, [sid]: Object.keys(state).length > 0 }));
      }).subscribe();
      return ch;
    });
    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [conversations]);

  // Poll shops.last_seen_at every 60s for all conversation shops.
  useEffect(() => {
    if (conversations.length === 0) return;
    const shopIds = [...new Set(conversations.map(c => c.shop_id).filter(Boolean))];
    if (shopIds.length === 0) return;
    const poll = async () => {
      const { data } = await supabase.from('shops').select('id, last_seen_at').in('id', shopIds);
      if (data) {
        const seenMap: Record<string, string> = {};
        data.forEach((s: ShopSeenRow) => { if (s.last_seen_at) seenMap[s.id] = s.last_seen_at; });
        setLastSeenMap(prev => ({ ...prev, ...seenMap }));
      }
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [conversations]);

  // Track buyer presence (auto-detects join/leave)
  useEffect(() => {
    if (!userId) return;
    const buyerChannel = supabase.channel('buyers-online', {
      config: { presence: { key: userId } }
    });
    buyerChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await buyerChannel.track({ user_id: userId, online_at: new Date().toISOString() });
      }
    });
    return () => { supabase.removeChannel(buyerChannel); };
  }, [userId]);

  function broadcastTyping() {
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing' });
  }

  // When a conversation is opened, mark it read for the buyer.
  useEffect(() => {
    if (!selectedConv || selectedConv.buyer_unread <= 0) return;
    queueMicrotask(() => {
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, buyer_unread: 0 } : c));
    });
    supabase.from('conversations').update({ buyer_unread: 0 }).eq('id', selectedConv.id).then(({ error }) => {
      if (error) console.error('Failed to mark buyer conversation read:', error);
    });
  }, [selectedConv]);

  // Real-time: subscribe to conversation updates (for sidebar last message) and new conversations.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('conversations-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations', filter: `buyer_id=eq.${userId}` }, (payload) => {
        const newConv = payload.new as Conversation;
        setConversations(prev => {
          if (prev.some(c => c.id === newConv.id)) return prev;
          return [newConv, ...prev];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `buyer_id=eq.${userId}` }, (payload) => {
        const updated = payload.new as Conversation;
        setConversations(prev => prev.map(c => c.id === updated.id ? { ...c, last_message: updated.last_message, last_message_at: updated.last_message_at, buyer_unread: updated.buyer_unread } : c));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    const container = document.querySelector('.chat-messages-area');
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom || messages.length <= 1) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    }
  }, [messages]);

  if (loading) {
      return <div className="chat-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'var(--text-light)' }}>Loading...</div></div>;
  }

  if (!userId) {
    return (
      <div className="chat-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-light)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '64px', height: '64px', opacity: 0.3, margin: '0 auto 16px' }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', color: 'var(--primary-color)', marginBottom: '8px' }}>Sign in required</h3>
          <p style={{ fontSize: '0.9rem' }}>Please sign in to access messages.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page buyer-chat-page">
      <div className="chat-wrapper buyer-chat-wrapper">
        <div className="chat-layout buyer-chat-layout">
          <div className={isMobile && mobileShowChat ? 'buyer-chat-sidebar-slot is-hidden' : 'buyer-chat-sidebar-slot'}>
            <BuyerConversationList
              conversations={filteredConvs}
              selectedId={selectedConv?.id}
              search={convSearch}
              shopImages={shopImageMap}
              getActivity={getShopActiveStatus}
              onSearchChange={setConvSearch}
              onSelect={selectConversation}
              onNewConversation={() => { setShopSearch(''); setShowNewChat(true); }}
              onDelete={deleteConversation}
            />
          </div>

          <main className={`chat-main buyer-chat-main${isMobile && mobileShowChat ? ' mobile-active' : ''}`}>
            {selectedConv ? (
              <>
                <BuyerChatHeader
                  conversation={selectedConv}
                  image={shopImageMap[selectedConv.shop_id]}
                  activity={getShopActiveStatus(selectedConv.shop_id)}
                  stats={shopStats}
                  showBack={isMobile}
                  onBack={() => setMobileShowChat(false)}
                  onShowDetails={() => setShowShopDetails(true)}
                />

                <div className="chat-messages-area buyer-chat-messages">
                  {messages.length === 0 ? (
                    <div className="chat-empty-state-inner buyer-chat-thread-empty">
                      <BuyerShopAvatar image={shopImageMap[selectedConv.shop_id]} name={selectedConv.shop_name} size="lg" />
                      <h3>Chat with {selectedConv.shop_name}</h3>
                      <p>Send a message to start the conversation.</p>
                    </div>
                  ) : null}
                  <BuyerMessageList
                    messages={messages}
                    userId={userId}
                    shopName={selectedConv.shop_name}
                    shopImage={shopImageMap[selectedConv.shop_id]}
                    remoteTyping={remoteTyping}
                    endRef={messagesEndRef}
                  />
                </div>

                <BuyerMessageComposer
                  value={newMessage}
                  imagePreview={imagePreview}
                  pendingImage={pendingImage}
                  uploading={uploading}
                  fileInputRef={fileInputRef}
                  onValueChange={setNewMessage}
                  onTyping={broadcastTyping}
                  onPickImage={pickImage}
                  onRemoveImage={removeImage}
                  onSend={() => void sendMessage()}
                />
              </>
            ) : (
              <div className="buyer-chat-no-selection">
                <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg></span>
                <h2>Select a conversation</h2>
                <p>Choose a shop from your messages to continue chatting.</p>
              </div>
            )}
          </main>
        </div>
      </div>

      <BuyerShopDetails
        open={showShopDetails}
        mobile={isMobile}
        shop={selectedShop}
        activity={selectedConv ? getShopActiveStatus(selectedConv.shop_id) : { active: false, text: '' }}
        onClose={closeShopDetails}
      />

      <BuyerNewConversationDialog
        open={showNewChat}
        shops={filteredShops}
        search={shopSearch}
        getActivity={getShopActiveStatus}
        onSearchChange={setShopSearch}
        onSelect={shop => void startConversation(shop)}
        onClose={closeNewChat}
      />
    </div>
  );
}
