import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fmt, formatTime } from '../lib/utils';
import DesignMessageCard from '../components/chat/DesignMessageCard';

interface Shop {
  id: string;
  name: string;
  email: string;
  description: string;
  about: string;
  banner: string;
  image: string;
}

interface Conversation {
  id: string;
  shop_id: string;
  shop_name: string;
  buyer_id: string;
  last_message: string;
  last_message_at: string;
  created_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  created_at: string;
}

function ShopAvatar({ shopId: _shopId, shopName, image, size, style }: { shopId: string; shopName: string; image?: string; size: number; style?: React.CSSProperties }) {
  const imgSrc = image || undefined;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      {imgSrc ? (
        <img src={imgSrc} alt={shopName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: '#fff', fontWeight: 700, fontSize: size * 0.4 }}>{shopName?.charAt(0) || 'S'}</span>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [shopSearch, setShopSearch] = useState('');
  const [convSearch, setConvSearch] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopImageMap, setShopImageMap] = useState<Record<string, string>>({});
  const [shopStats, setShopStats] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const lastMsgCountRef = useRef(0);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv.id);
      fetchShop(selectedConv.shop_id);
      fetchShopStats(selectedConv.shop_id);
      // Scroll to bottom after switching conversation
      setTimeout(() => {
        const container = document.querySelector('.chat-messages-area');
        if (container) container.scrollTop = container.scrollHeight;
      }, 100);
    }
  }, [selectedConv]);

  // Real-time: subscribe to messages for active conversation
  useEffect(() => {
    if (!selectedConv) return;
    const channel = supabase
      .channel(`messages:${selectedConv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConv.id}` }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        // Update conversation sidebar
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, last_message: newMsg.text, last_message_at: newMsg.created_at } : c));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConv?.id]);

  // Real-time: subscribe to conversation updates (for sidebar last message)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('conversations-list')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
        const updated = payload.new as Conversation;
        setConversations(prev => prev.map(c => c.id === updated.id ? { ...c, last_message: updated.last_message, last_message_at: updated.last_message_at } : c));
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

  // Show typing indicator briefly when a new message arrives from the other person
  useEffect(() => {
    if (messages.length > lastMsgCountRef.current && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender_id !== userId) {
        setIsTyping(true);
        const t = setTimeout(() => setIsTyping(false), 2000);
        lastMsgCountRef.current = messages.length;
        return () => clearTimeout(t);
      }
    }
    lastMsgCountRef.current = messages.length;
  }, [messages, userId]);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUserId(session.user.id);
      await fetchConversations(session.user.id);
    }
    await fetchShops();
    setLoading(false);
  }

  async function fetchShops() {
    const { data } = await supabase.from('shops').select('*').order('name');
    if (data) {
      setShops(data);
      const map: Record<string, string> = {};
      data.forEach((s: any) => { if (s.image) map[s.id] = s.image; });
      setShopImageMap(prev => ({ ...prev, ...map }));
    }
  }

  async function fetchShop(shopId: string) {
    const { data } = await supabase.from('shops').select('*').eq('id', shopId).single();
    if (data) {
      setSelectedShop(data);
      if (data.image) setShopImageMap(prev => ({ ...prev, [shopId]: data.image }));
    }
  }

  async function fetchShopStats(shopId: string) {
    const { data: products } = await supabase
      .from('products').select('id').eq('shop_id', shopId).eq('status', 'active');
    if (!products || products.length === 0) { setShopStats({ avg: 0, count: 0 }); return; }
    const productIds = products.map((p: any) => p.id);
    const { data: reviews } = await supabase
      .from('product_reviews').select('rating').in('product_id', productIds);
    if (!reviews || reviews.length === 0) { setShopStats({ avg: 0, count: 0 }); return; }
    const total = reviews.reduce((s: number, r: any) => s + r.rating, 0);
    setShopStats({ avg: total / reviews.length, count: reviews.length });
  }

  async function fetchConversations(uid: string) {
    const { data } = await supabase
      .from('conversations').select('*').eq('buyer_id', uid)
      .order('last_message_at', { ascending: false });
    if (data) {
      setConversations(data);
      const shopIds = [...new Set(data.map((c: any) => c.shop_id).filter(Boolean))];
      if (shopIds.length > 0) {
        const { data: shopData } = await supabase.from('shops').select('id, image').in('id', shopIds);
        if (shopData) {
          const map: Record<string, string> = {};
          shopData.forEach((s: any) => { if (s.image) map[s.id] = s.image; });
          setShopImageMap(prev => ({ ...prev, ...map }));
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
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) { alert('Please sign in to start a conversation.'); return; }

    const meta = session?.user?.user_metadata || {};
    const buyerName = meta.name || session?.user?.email || 'Buyer';
    const buyerAvatar = meta.avatar_url || '';

    const existing = conversations.find(c => c.shop_id === shop.id);
    if (existing) { setSelectedConv(existing); setShowNewChat(false); return; }

    const { data, error } = await supabase
      .from('conversations')
      .insert({ buyer_id: uid, shop_id: shop.id, shop_name: shop.name, buyer_name: buyerName, buyer_avatar: buyerAvatar, last_message: '', last_message_at: new Date().toISOString() })
      .select().single();

    if (error) { alert('Failed: ' + error.message); return; }
    if (data) { setConversations(prev => [data, ...prev]); setSelectedConv(data); setShowNewChat(false); }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedConv || !userId) return;
    const text = newMessage.trim();
    setNewMessage('');

    const { data } = await supabase
      .from('messages')
      .insert({ conversation_id: selectedConv.id, sender_id: userId, text })
      .select().single();

    if (data) {
      setMessages(prev => [...prev, data]);
      await supabase.from('conversations').update({ last_message: text, last_message_at: new Date().toISOString() }).eq('id', selectedConv.id);
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, last_message: text, last_message_at: new Date().toISOString() } : c));
    }
  }

  async function deleteConversation(convId: string) {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    await supabase.from('messages').delete().eq('conversation_id', convId);
    await supabase.from('conversations').delete().eq('id', convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (selectedConv?.id === convId) { setSelectedConv(null); setMessages([]); }
  }

  const filteredShops = shops.filter(s => s.name.toLowerCase().includes(shopSearch.toLowerCase()) || s.description?.toLowerCase().includes(shopSearch.toLowerCase()));
  const filteredConvs = conversations.filter(c => c.shop_name?.toLowerCase().includes(convSearch.toLowerCase()));

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
    <div className="chat-page">
      <div className="chat-wrapper">
        <div className="chat-layout">

          {/* === LEFT SIDEBAR === */}
          <div className="chat-sidebar">
            <div className="sidebar-header">
              <h2>Messages</h2>
              <button className="btn-new-chat" onClick={() => { setShopSearch(''); setShowNewChat(true); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
            <div className="sidebar-search" style={{ padding: '0 16px 12px' }}>
              <span className="sidebar-search-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input type="text" placeholder="Search conversations..." value={convSearch} onChange={e => setConvSearch(e.target.value)} />
            </div>
            <div className="conversation-list">
              {filteredConvs.length === 0 ? (
                <div className="chat-empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '56px', height: '56px' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <h3>No Conversations</h3>
                  <p>Start a conversation with a shop to see it here.</p>
                </div>
              ) : (
                filteredConvs.map(conv => (
                  <div
                    key={conv.id}
                    className={`conversation-item ${selectedConv?.id === conv.id ? 'active' : ''}`}
                    onClick={() => setSelectedConv(conv)}
                    style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', cursor: 'pointer', transition: 'background 0.15s', borderBottom: '1px solid rgba(130,62,11,0.05)' }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <ShopAvatar shopId={conv.shop_id} shopName={conv.shop_name} image={shopImageMap[conv.shop_id]} size={48} />
                      <div style={{ position: 'absolute', bottom: '1px', right: '1px', width: '12px', height: '12px', borderRadius: '50%', background: '#2E7D32', border: '2.5px solid var(--bg-primary)' }}></div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-dark)' }}>{conv.shop_name}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', flexShrink: 0, marginLeft: '8px' }}>{formatTime(conv.last_message_at)}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '20px' }}>
                        {conv.last_message || 'Start a conversation'}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                      title="Delete conversation"
                      style={{ position: 'absolute', top: '10px', right: '10px', width: '22px', height: '22px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s, color 0.15s, background 0.15s', padding: 0, zIndex: 1 }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#d32f2f'; e.currentTarget.style.background = '#fdecea'; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.color = 'var(--text-light)'; e.currentTarget.style.background = 'none'; }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* === MAIN CHAT === */}
          <div className="chat-main">
            {selectedConv ? (
              <>
                <div className="chat-header-bar">
                  <div className="chat-header-left">
                    <div className="chat-header-avatar-wrap">
                      <ShopAvatar shopId={selectedConv.shop_id} shopName={selectedConv.shop_name} image={shopImageMap[selectedConv.shop_id]} size={44} />
                      <span className="chat-header-online-dot"></span>
                    </div>
                    <div className="chat-header-info-block">
                      <h3 className="chat-header-shop-name">{selectedConv.shop_name}</h3>
                      <div className="chat-header-status-row">
                        <span className="chat-header-active-now">
                          <span className="chat-header-status-dot-green"></span>
                          Active Now
                        </span>
                        <span className="chat-header-sep">&bull;</span>
                        <span className="chat-header-response-text">Replies within 30 mins</span>
                      </div>
                    </div>
                  </div>
                  <div className="chat-header-center">
                    {shopStats.count > 0 && (
                      <>
                        <span className="chat-header-stat">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="#E8A541" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          {shopStats.avg.toFixed(1)}
                        </span>
                        <span className="chat-header-stat-sep">|</span>
                        <span className="chat-header-stat">{shopStats.count} Review{shopStats.count !== 1 ? 's' : ''}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* ── MESSAGE LIST ── */}
                <div className="chat-messages-area">
                  {messages.length === 0 && (
                    <div className="chat-empty-state-inner">
                      <ShopAvatar
                        shopId={selectedConv.shop_id}
                        shopName={selectedConv.shop_name}
                        image={shopImageMap[selectedConv.shop_id]}
                        size={64}
                        style={{ marginBottom: '12px' }}
                      />
                      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', color: 'var(--primary-color)', marginBottom: '4px' }}>
                        Chat with {selectedConv.shop_name}
                      </h3>
                      <p style={{ fontSize: '0.85rem' }}>Send a message to start the conversation.</p>
                    </div>
                  )}

                  <div className="msg-list">
                    {(() => {
                      // ── Build groups of consecutive messages from the same sender ──
                      const groups: { senderId: string; msgs: Message[] }[] = [];
                      for (const msg of messages) {
                        const last = groups[groups.length - 1];
                        if (last && last.senderId === msg.sender_id) {
                          last.msgs.push(msg);
                        } else {
                          groups.push({ senderId: msg.sender_id, msgs: [msg] });
                        }
                      }

                      return groups.map((group, gi) => {
                        const isOut = group.senderId === userId;
                        const dir   = isOut ? 'out' : 'in';
                        const lastMsg = group.msgs[group.msgs.length - 1];
                        const timestamp = new Date(lastMsg.created_at)
                          .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        return (
                          <div key={`g-${gi}`} className={`msg-group msg-group--${dir}`}>

                            {/* ── Bubbles ── */}
                            {group.msgs.map((msg, mi) => {
                              // Parse product inquiry if JSON
                              let productData: any = null;
                              let designData: any = null;
                              let text = msg.text;
                              try {
                                const p = JSON.parse(msg.text);
                                if (p.type === 'design_submission' || p.design) {
                                  designData = p;
                                  text = p.message;
                                } else if (p.type === 'product_inquiry') {
                                  productData = p;
                                  text = p.message;
                                }
                              } catch {}

                              const isLast = mi === group.msgs.length - 1;

                              return (
                                <div key={msg.id} className={`msg-row msg-row--${dir} msg-fade-in`}>

                                  {/* Avatar column — incoming only */}
                                  {!isOut && (
                                    isLast
                                      ? (
                                        <div className="msg-avatar">
                                          {shopImageMap[selectedConv.shop_id]
                                            ? <img src={shopImageMap[selectedConv.shop_id]} alt={selectedConv.shop_name} />
                                            : <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.75rem' }}>{selectedConv.shop_name?.charAt(0)}</span>
                                          }
                                        </div>
                                      )
                                      : <div className="msg-avatar-spacer" />
                                  )}

                                  {/* Product card + bubble */}
                                  <div className={`msg-bubble-wrap msg-bubble-wrap--${dir}`}>
                                    {designData ? (
                                      <DesignMessageCard data={designData} />
                                    ) : productData?.productId ? (
                                      <a
                                        href={`/product/${productData.productId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="chat-product-card"
                                      >
                                        <img src={productData.productImage} alt={productData.productName} className="chat-product-img" />
                                        <div className="chat-product-info">
                                          <span className="chat-product-name">{productData.productName}</span>
                                          {productData.variantDimensions && <span className="chat-product-variant">{productData.variantDimensions}</span>}
                                          <span className="chat-product-price">{fmt(productData.productPrice || 0)}</span>
                                        </div>
                                      </a>
                                    ) : null}
                                    <div className={`msg-bubble msg-bubble--${dir}`}>{text}</div>
                                  </div>

                                </div>
                              );
                            })}

                            {/* ── Timestamp — once per group, after last bubble ── */}
                            <div className={`msg-ts msg-ts--${dir}`}>
                              <span>{timestamp}</span>
                              {isOut && (
                                <span className="msg-ts-check">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                </span>
                              )}
                            </div>

                          </div>
                        );
                      });
                    })()}

                    {/* ── Typing indicator ── */}
                    {isTyping && (
                      <div className="msg-typing-row msg-fade-in">
                        <div className="msg-avatar">
                          {shopImageMap[selectedConv.shop_id]
                            ? <img src={shopImageMap[selectedConv.shop_id]} alt={selectedConv.shop_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.75rem' }}>{selectedConv.shop_name?.charAt(0)}</span>
                          }
                        </div>
                        <div className="chat-typing-bubble">
                          <div className="chat-typing-dots">
                            <span className="chat-typing-dot" />
                            <span className="chat-typing-dot" />
                            <span className="chat-typing-dot" />
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 24px', background: '#fff', borderTop: '1px solid #E8E0D8' }}>
                  <input
                    type="text" placeholder="Type a message..." value={newMessage}
                    onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    style={{ flex: 1, padding: '10px 16px', border: '1.5px solid #E8E0D8', borderRadius: '24px', fontSize: '0.9rem', outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-dark)' }}
                  />
                  <button onClick={sendMessage} disabled={!newMessage.trim()} style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: newMessage.trim() ? 'var(--primary-color)' : '#D4C8BB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newMessage.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, transition: 'background 0.15s' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  </button>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '64px', height: '64px', opacity: 0.25, marginBottom: '16px' }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', color: 'var(--primary-color)', marginBottom: '4px' }}>Select a Conversation</h3>
                <p style={{ fontSize: '0.9rem' }}>Choose a shop from the left sidebar to start chatting.</p>
              </div>
            )}
          </div>

          {/* === RIGHT DETAILS PANEL === */}
          <div className="chat-details">
            {selectedConv && selectedShop ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="details-header" style={{ textAlign: 'center', padding: '24px 20px 12px' }}>
                  <h3>Shop Details</h3>
                </div>

                <div style={{ padding: '0 16px' }}>
                  <div className="shop-detail-banner" style={{ position: 'relative', borderRadius: '8px', overflow: 'visible' }}>
                    <div style={{ width: '100%', height: '110px', borderRadius: '8px', background: `url(${selectedShop.banner || '/images/vases_collection.png'}) center/cover no-repeat` }}></div>
                    <div style={{ position: 'absolute', bottom: '-28px', left: '16px', width: '56px', height: '56px', borderRadius: '50%', border: '3px solid var(--bg-primary)', overflow: 'hidden', background: 'var(--primary-color)', flexShrink: 0 }}>
                      {selectedShop.image ? (
                        <img src={selectedShop.image} alt={selectedShop.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '1.2rem' }}>{selectedShop.name.charAt(0)}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '36px 20px 0' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>{selectedShop.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.78rem', color: '#2E7D32', fontWeight: 500, marginBottom: '16px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2E7D32', display: 'inline-block' }}></span>
                    Active Artisan
                  </div>
                </div>

                <div className="shop-about-section">
                  <h4>About</h4>
                  <p>{selectedShop.about || selectedShop.description || 'Traditional Filipino pottery shop dedicated to preserving local craftsmanship.'}</p>
                </div>

                <div className="shop-about-section">
                  <h4>Contact</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', lineHeight: 1.6 }}>{selectedShop.email}</p>
                </div>

                <div className="shop-about-section" style={{ margin: '12px 16px 20px' }}>
                  <h4>Quick Actions</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Link to={`/shop/${selectedShop.id}`} style={{ display: 'block', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
                      View Shop Page
                    </Link>
                    <button style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-light)', fontWeight: 500, border: 'none', cursor: 'pointer', textAlign: 'center' }}>
                      Report Issue
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="chat-empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '60px', height: '60px' }}>
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                <h3>No Shop Selected</h3>
                <p>Select a conversation to view shop details.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === NEW CHAT MODAL === */}
      {showNewChat && (
        <div className="new-chat-modal" onClick={() => setShowNewChat(false)}>
          <div className="new-chat-modal-content" onClick={e => e.stopPropagation()} style={{ width: '420px' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', textAlign: 'center' }}>Start a Conversation</h3>
            <div className="sidebar-search" style={{ margin: '8px 0' }}>
              <span className="sidebar-search-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input type="text" placeholder="Search shops..." value={shopSearch} onChange={e => setShopSearch(e.target.value)} autoFocus />
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {filteredShops.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '24px', fontSize: '0.9rem' }}>No shops found.</p>
              ) : (
                filteredShops.map(shop => (
                  <div
                    key={shop.id}
                    onClick={() => startConversation(shop)}
                    style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', borderRadius: '10px', cursor: 'pointer', transition: 'background 0.15s', borderBottom: '1px solid rgba(130,62,11,0.05)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fdf5ed')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <ShopAvatar shopId={shop.id} shopName={shop.name} image={shop.image} size={44} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-dark)', marginBottom: '2px' }}>{shop.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', lineHeight: 1.4 }}>{shop.description || 'Traditional pottery shop'}</div>
                    </div>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2E7D32', flexShrink: 0 }}></div>
                  </div>
                ))
              )}
            </div>
            <div className="new-chat-actions" style={{ marginTop: '8px', justifyContent: 'center' }}>
              <button type="button" className="new-chat-cancel" onClick={() => setShowNewChat(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
