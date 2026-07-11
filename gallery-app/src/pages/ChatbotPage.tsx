import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../lib/api';
import ChatOrderCard from '../components/chat/ChatOrderCard';
import ChatProductCard from '../components/chat/ChatProductCard';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  orders?: any[];
  products?: any[];
}

const QUICK_ACTIONS = [
  { label: 'Track My Order', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Shipping Info', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
  { label: 'Browse Pottery', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { label: 'Freeform Help', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
  { label: 'Contact Artisan', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Returns & Refunds', icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
];

export default function ChatbotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id) setUserId(user.id);
    inputRef.current?.focus();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_BASE}/api/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), history, userId }),
      });

      const data = await res.json();
      const reply = data.reply || data.error || 'Sorry, I could not process your request.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date(), orders: data.orders || [], products: data.products || [] }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I apologize, but I am experiencing connection issues. Please try again in a moment.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-secondary)',
      paddingTop: 'var(--nav-height)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid var(--bg-tertiary)',
        padding: '20px 0',
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(130,62,11,0.2)',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: '24px', height: '24px' }}>
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0, fontFamily: 'var(--font-serif)' }}>LikhAI</h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Your LikhArtisan Customer Support Assistant</p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 0',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 24px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              {/* Avatar */}
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                boxShadow: '0 8px 24px rgba(130,62,11,0.15)',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{ width: '36px', height: '36px' }}>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)', margin: '0 0 8px', fontFamily: 'var(--font-serif)' }}>
                Welcome to LikhAI
              </h2>
              <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', margin: '0 0 28px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                I can help you with orders, products, shipping, the Freeform Designer, and more. Ask me anything!
              </p>

              {/* Quick Actions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '500px', margin: '0 auto' }}>
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.label)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '12px',
                      border: '1.5px solid var(--bg-tertiary)',
                      background: '#fff',
                      color: 'var(--text-dark)',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--primary-color)';
                      e.currentTarget.style.color = 'var(--primary-color)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--bg-tertiary)';
                      e.currentTarget.style.color = 'var(--text-dark)';
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                      <path d={action.icon} />
                    </svg>
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Talk to a human — handoff to live seller chat */}
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <button
                    onClick={() => navigate('/chat')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '12px',
                      border: '1.5px solid var(--primary-color)',
                      background: 'transparent',
                      color: 'var(--primary-color)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-color)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--primary-color)'; }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: '16px', height: '16px' }}>
                      <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Talk to a Human (Live Seller Chat)
                  </button>
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '16px',
            }}>
              {msg.role === 'assistant' && (
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginRight: '10px',
                  marginTop: '2px',
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
              )}
              <div style={{ maxWidth: '70%' }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? 'var(--primary-color)' : '#fff',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-dark)',
                  fontSize: '0.88rem',
                  lineHeight: 1.6,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: msg.role === 'assistant' ? '1px solid var(--bg-tertiary)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
                {msg.role === 'assistant' && msg.orders && msg.orders.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {msg.orders.map((o: any) => (
                      <ChatOrderCard key={o.id} order={o} />
                    ))}
                  </div>
                )}
                {msg.role === 'assistant' && msg.products && msg.products.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {msg.products.map((p: any) => (
                      <ChatProductCard key={p.id} product={p} />
                    ))}
                  </div>
                )}
                <div style={{
                  fontSize: '0.68rem',
                  color: 'var(--text-light)',
                  marginTop: '4px',
                  paddingLeft: msg.role === 'user' ? '0' : '4px',
                  paddingRight: msg.role === 'user' ? '4px' : '0',
                  textAlign: msg.role === 'user' ? 'right' : 'left',
                }}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginRight: '10px',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <div style={{
                padding: '12px 16px',
                borderRadius: '16px 16px 16px 4px',
                background: '#fff',
                border: '1px solid var(--bg-tertiary)',
                display: 'flex',
                gap: '4px',
                alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--primary-color)',
                    opacity: 0.4,
                    animation: `typingBounce 1.4s infinite ${i * 0.2}s`,
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div style={{
        background: '#fff',
        borderTop: '1px solid var(--bg-tertiary)',
        padding: '16px 0',
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 24px' }}>
          <form
            onSubmit={e => { e.preventDefault(); sendMessage(input); }}
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask LikhAI anything..."
              disabled={loading}
              style={{
                flex: 1,
                padding: '14px 18px',
                borderRadius: '14px',
                border: '1.5px solid var(--bg-tertiary)',
                fontSize: '0.88rem',
                color: 'var(--text-dark)',
                outline: 'none',
                background: 'var(--bg-secondary)',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--primary-color)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--bg-tertiary)'}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                border: 'none',
                background: input.trim() && !loading ? 'var(--primary-color)' : 'var(--bg-tertiary)',
                color: input.trim() && !loading ? '#fff' : 'var(--text-light)',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '20px', height: '20px' }}>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-light)', textAlign: 'center', marginTop: '8px', margin: '8px 0 0' }}>
            LikhAI may produce inaccurate information. Always verify important details.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
