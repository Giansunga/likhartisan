import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../lib/api';
import ChatOrderCard from './chat/ChatOrderCard';
import ChatProductCard from './chat/ChatProductCard';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  orders?: any[];
  products?: any[];
}

const QUICK_ACTIONS = [
  { label: 'Track My Order' },
  { label: 'Shipping Info' },
  { label: 'Browse Pottery' },
  { label: 'Freeform Help' },
  { label: 'Returns & Refunds' },
];

export default function LikhAIDock() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) setUserId(user.id);
  }, [user]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
    <>
      {/* Chat Window */}
      {open && (
        <div className="likhai-dock-window">
          {/* Header */}
          <div className="likhai-dock-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                <img src="/images/likhai-logo.png" alt="LikhAI" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff', fontFamily: 'var(--font-serif)' }}>LikhAI</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
                  Online
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '2px' }}>
              <button
                onClick={() => setOpen(false)}
                className="likhai-dock-header-btn"
                title="Minimize"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                  <path d="M5 12h14" />
                </svg>
              </button>
              <button
                onClick={() => setOpen(false)}
                className="likhai-dock-header-btn"
                title="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="likhai-dock-messages">
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-dark)', margin: '0 0 6px', fontFamily: 'var(--font-serif)' }}>
                  Welcome to LikhAI
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>
                  Ask me about orders, products, shipping, and more.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {QUICK_ACTIONS.map(action => (
                    <button
                      key={action.label}
                      onClick={() => sendMessage(action.label)}
                      className="likhai-dock-quick-action"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`likhai-dock-msg-row ${msg.role === 'user' ? 'likhai-dock-msg-row--user' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="likhai-dock-msg-avatar">
                    <img src="/images/likhai-logo.png" alt="LikhAI" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div className={`likhai-dock-bubble ${msg.role === 'user' ? 'likhai-dock-bubble--user' : 'likhai-dock-bubble--ai'}`}>
                  {msg.content}
                </div>
                {msg.role === 'assistant' && msg.orders && msg.orders.length > 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column' }}>
                    {msg.orders.map((o: any) => (
                      <ChatOrderCard key={o.id} order={o} />
                    ))}
                  </div>
                )}
                {msg.role === 'assistant' && msg.products && msg.products.length > 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column' }}>
                    {msg.products.map((p: any) => (
                      <ChatProductCard key={p.id} product={p} />
                    ))}
                  </div>
                )}
                <div className={`likhai-dock-time ${msg.role === 'user' ? 'likhai-dock-time--user' : ''}`}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            ))}

            {loading && (
              <div className="likhai-dock-msg-row">
                <div className="likhai-dock-msg-avatar">
                  <img src="/images/likhai-logo.png" alt="LikhAI" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div className="likhai-dock-bubble likhai-dock-bubble--ai likhai-dock-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form className="likhai-dock-input-area" onSubmit={e => { e.preventDefault(); sendMessage(input); }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={loading}
              className="likhai-dock-input"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="likhai-dock-send"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Launcher Button */}
      {!open && (
        <button className="likhai-dock-launcher" onClick={() => setOpen(true)}>
          <div className="likhai-dock-launcher-icon">
            <img src="/images/likhai-logo.png" alt="LikhAI" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div className="likhai-dock-launcher-text">
            <span className="likhai-dock-launcher-label">LikhAI</span>
            <span className="likhai-dock-launcher-sub">Customer Support</span>
          </div>
        </button>
      )}

      <style>{`
        @keyframes likhaiSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes likhaiBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }

        .likhai-dock-launcher {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px 5px 5px;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #823E0B, #A85A22);
          color: #fff;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(130,62,11,0.35);
          transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
          font-family: var(--font-sans);
          animation: likhaiSlideUp 0.3s ease-out;
        }
        .likhai-dock-launcher:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 28px rgba(130,62,11,0.45);
        }
        .likhai-dock-launcher:active {
          transform: translateY(-1px);
        }
        .likhai-dock-launcher-icon {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
        }
        .likhai-dock-launcher-text {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1.2;
        }
        .likhai-dock-launcher-label {
          font-weight: 700;
          font-size: 0.72rem;
        }
        .likhai-dock-launcher-sub {
          font-size: 0.56rem;
          opacity: 0.8;
        }

        .likhai-dock-window {
          position: fixed;
          bottom: 0;
          right: 20px;
          z-index: 10000;
          width: 320px;
          height: 440px;
          max-height: calc(100vh - 40px);
          border-radius: 16px 16px 0 0;
          background: #fff;
          box-shadow: 0 8px 40px rgba(0,0,0,0.18);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: likhaiSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-family: var(--font-sans);
        }

        .likhai-dock-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 14px 14px 16px;
          background: linear-gradient(135deg, #823E0B, #A85A22);
          color: #fff;
          flex-shrink: 0;
        }
        .likhai-dock-header-btn {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: none;
          background: rgba(255,255,255,0.15);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
        }
        .likhai-dock-header-btn:hover {
          background: rgba(255,255,255,0.28);
        }

        .likhai-dock-messages {
          flex: 1;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 16px;
          background: #FAF8F5;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .likhai-dock-messages::-webkit-scrollbar { width: 5px; }
        .likhai-dock-messages::-webkit-scrollbar-track { background: transparent; }
        .likhai-dock-messages::-webkit-scrollbar-thumb { background: #E8E0D8; border-radius: 10px; }

        .likhai-dock-msg-row {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .likhai-dock-msg-row--user {
          align-items: flex-end;
        }

        .likhai-dock-msg-avatar {
          width: 26px;
          height: 26px;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
          align-self: flex-start;
          background: linear-gradient(135deg, #823E0B, #C1570D);
        }

        .likhai-dock-bubble {
          max-width: 80%;
          padding: 10px 14px;
          font-size: 0.82rem;
          line-height: 1.55;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .likhai-dock-bubble--user {
          background: #823E0B;
          color: #fff;
          border-radius: 16px 16px 4px 16px;
        }
        .likhai-dock-bubble--ai {
          background: #fff;
          color: var(--text-dark);
          border: 1px solid #E8E0D8;
          border-radius: 16px 16px 16px 4px;
        }

        .likhai-dock-time {
          font-size: 0.62rem;
          color: var(--text-light);
          padding: 0 2px;
        }
        .likhai-dock-time--user {
          text-align: right;
        }

        .likhai-dock-typing {
          display: flex;
          gap: 4px;
          align-items: center;
          padding: 12px 18px;
        }
        .likhai-dock-typing span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #823E0B;
          opacity: 0.4;
          animation: likhaiBounce 1.4s infinite;
        }
        .likhai-dock-typing span:nth-child(2) { animation-delay: 0.2s; }
        .likhai-dock-typing span:nth-child(3) { animation-delay: 0.4s; }

        .likhai-dock-quick-action {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1.5px solid #E8E0D8;
          background: #fff;
          color: var(--text-dark);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
          font-family: var(--font-sans);
        }
        .likhai-dock-quick-action:hover {
          border-color: #823E0B;
          color: #823E0B;
          background: rgba(130,62,11,0.04);
        }

        .likhai-dock-input-area {
          display: flex;
          gap: 8px;
          padding: 12px 14px;
          border-top: 1px solid #E8E0D8;
          background: #fff;
          flex-shrink: 0;
          align-items: center;
        }
        .likhai-dock-input {
          flex: 1;
          padding: 10px 14px;
          border-radius: 20px;
          border: 1.5px solid #E8E0D8;
          font-size: 0.82rem;
          color: var(--text-dark);
          outline: none;
          background: #FAF8F5;
          transition: border-color 0.15s;
          font-family: var(--font-sans);
        }
        .likhai-dock-input:focus {
          border-color: #823E0B;
        }
        .likhai-dock-input::placeholder {
          color: #8C7B6E;
        }
        .likhai-dock-send {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: none;
          background: #823E0B;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .likhai-dock-send:hover:not(:disabled) {
          background: #6B3209;
          transform: scale(1.05);
        }
        .likhai-dock-send:disabled {
          background: #E8E0D8;
          color: #8C7B6E;
          cursor: default;
        }

        @media (max-width: 480px) {
          .likhai-dock-window {
            width: 100vw;
            height: 100vh;
            max-height: 100vh;
            bottom: 0;
            right: 0;
            border-radius: 0;
          }
          .likhai-dock-launcher {
            bottom: calc(env(safe-area-inset-bottom) + 130px);
            right: 16px;
            padding: 5px 10px 5px 5px;
          }
          .likhai-dock-input-area {
            padding-bottom: calc(env(safe-area-inset-bottom) + 12px);
          }
        }
      `}</style>
    </>
  );
}
