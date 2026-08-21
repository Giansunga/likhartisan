import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useLikhAI } from '../../hooks/useLikhAI';
import type { LikhAICard, LikhAIMessage } from '../../types/likhai';
import ChatOrderCard from './ChatOrderCard';
import ChatProductCard from './ChatProductCard';
import ChatShopCard from './ChatShopCard';
import './likhai.css';

const QUICK_ACTIONS = ['Track my order', 'Browse pottery', 'Shipping information', 'Freeform help', 'Returns and refunds'];

function ResultCard({ card }: { card: LikhAICard }) {
  if (card.type === 'order') return <ChatOrderCard order={card} />;
  if (card.type === 'product') return <ChatProductCard product={card} />;
  return <ChatShopCard shop={card} />;
}

function AssistantExtras({ message, compact }: { message: LikhAIMessage; compact: boolean }) {
  const { sendMessage, retryMessage, rateMessage, loading } = useLikhAI();
  const [ratingPending, setRatingPending] = useState(false);

  async function rate(rating: 'positive' | 'negative') {
    setRatingPending(true);
    try { await rateMessage(message.id, rating); }
    catch { toast.error('Could not save your feedback.'); }
    finally { setRatingPending(false); }
  }

  return (
    <>
      {message.generationStatus === 'fallback' && <div className="likhai-generation-note">Live summary unavailable — showing verified information.</div>}
      {message.groundingStatus === 'partial' && <div className="likhai-grounding-note">Some live information was unavailable.</div>}
      {message.resolution && (
        <div className={`likhai-resolution likhai-resolution--${message.resolution.state}`}>
          <span>Next step</span>
          <p>{message.resolution.label}</p>
        </div>
      )}
      {!!message.cards?.length && <div className="likhai-results">{message.cards.map(card => <ResultCard key={`${card.type}-${card.id}`} card={card} />)}</div>}
      {!!message.actions?.length && (
        <div className="likhai-actions">
          {message.actions.map(action => <Link key={action.id} to={action.href}>{action.label}</Link>)}
        </div>
      )}
      {!!message.suggestions?.length && (
        <div className="likhai-suggestions" aria-label="Suggested follow-up questions">
          {message.suggestions.map(suggestion => (
            <button key={suggestion} type="button" disabled={loading} onClick={() => void sendMessage(suggestion)}>{suggestion}</button>
          ))}
        </div>
      )}
      {message.retryText && (
        <div className="likhai-actions">
          <button type="button" disabled={loading} onClick={() => void retryMessage(message.id)}>Retry message</button>
        </div>
      )}
      {message.responseId && (
        <div className={`likhai-feedback ${compact ? 'likhai-feedback--compact' : ''}`} aria-label="Rate this response">
          <span>Helpful?</span>
          <button type="button" disabled={ratingPending} className={message.rating === 'positive' ? 'is-selected' : ''} onClick={() => void rate('positive')} aria-label="Helpful response">👍</button>
          <button type="button" disabled={ratingPending} className={message.rating === 'negative' ? 'is-selected' : ''} onClick={() => void rate('negative')} aria-label="Unhelpful response">👎</button>
        </div>
      )}
    </>
  );
}

export default function LikhAIConversation({ compact = false, autoFocus = false }: { compact?: boolean; autoFocus?: boolean }) {
  const { messages, loading, sendMessage, clearConversation } = useLikhAI();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  function submit(text: string) {
    if (!text.trim() || loading) return;
    setInput('');
    void sendMessage(text);
  }

  return (
    <div className={`likhai-conversation ${compact ? 'likhai-conversation--compact' : 'likhai-conversation--page'}`}>
      <div className="likhai-messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="likhai-welcome">
            <h2>Welcome to LikhAI</h2>
            <p>Ask about verified orders, pottery, shops, payments, delivery, or the Freeform Designer—in English, Filipino, or Taglish.</p>
            <div className="likhai-quick-actions">
              {QUICK_ACTIONS.map(action => <button key={action} type="button" onClick={() => submit(action)}>{action}</button>)}
            </div>
            {!compact && <Link className="likhai-human-link" to="/chat">Talk to a human seller</Link>}
          </div>
        )}

        {messages.map(message => (
          <article key={message.id} className={`likhai-message likhai-message--${message.role}`}>
            {message.role === 'assistant' && <img className="likhai-avatar" src="/images/likhai-logo.png" alt="LikhAI" />}
            <div className="likhai-message__content">
              <div className={`likhai-bubble ${message.errorKind ? `likhai-bubble--error likhai-bubble--${message.errorKind}` : ''}`}>{message.content}</div>
              {message.role === 'assistant' && <AssistantExtras message={message} compact={compact} />}
              <time>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
          </article>
        ))}
        {loading && (
          <div className="likhai-message likhai-message--assistant" aria-label="LikhAI is responding">
            <img className="likhai-avatar" src="/images/likhai-logo.png" alt="" />
            <div className="likhai-typing">
              <span className="likhai-typing__label">LikhAI is typing...</span>
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="likhai-composer" onSubmit={event => { event.preventDefault(); submit(input); }}>
        {messages.length > 0 && <button type="button" className="likhai-clear" onClick={clearConversation} aria-label="Clear LikhAI conversation">Clear</button>}
        <input ref={inputRef} value={input} maxLength={1000} onChange={event => setInput(event.target.value)} placeholder="Ask LikhAI…" disabled={loading} aria-label="Message LikhAI" />
        <button type="submit" className="likhai-send" disabled={!input.trim() || loading} aria-label="Send message">➤</button>
      </form>
    </div>
  );
}
