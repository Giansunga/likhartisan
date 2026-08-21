import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { LikhAIContext } from './likhai-context';
import { LikhAIRequestError, requestLikhAI, submitLikhAIFeedback } from '../services/likhaiClient';
import type { LikhAIMessage } from '../types/likhai';

const STORAGE_KEY = 'likhai:conversation:v1';
const MAX_MESSAGES = 20;
type StoredConversation = { identity: string; messages: LikhAIMessage[] };
function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function readStored(identity: string): LikhAIMessage[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as StoredConversation | null;
    return parsed?.identity === identity && Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_MESSAGES) : [];
  } catch { return []; }
}

export function LikhAIProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const accessToken = session?.access_token as string | undefined;
  const identity = user?.id || 'anonymous';
  const [messages, setMessages] = useState<LikhAIMessage[]>(() => readStored(identity));
  const [loadedIdentity, setLoadedIdentity] = useState(identity);
  const [loading, setLoading] = useState(false);
  const identityRef = useRef(identity);
  const pendingRef = useRef(false);
  const visibleMessages = useMemo(() => loadedIdentity === identity ? messages : [], [identity, loadedIdentity, messages]);

  useEffect(() => {
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      pendingRef.current = false;
      setLoading(false);
      setMessages(readStored(identity));
      setLoadedIdentity(identity);
    }
  }, [identity]);
  useEffect(() => {
    if (loadedIdentity === identity) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ identity, messages: messages.slice(-MAX_MESSAGES) }));
  }, [identity, loadedIdentity, messages]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || pendingRef.current) return;
    pendingRef.current = true;
    const history = visibleMessages.slice(-MAX_MESSAGES);
    const userMessage: LikhAIMessage = { id: makeId(), role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(current => [...current, userMessage].slice(-MAX_MESSAGES));
    setLoading(true);
    try {
      const result = await requestLikhAI(text, history, accessToken);
      const assistantMessage: LikhAIMessage = {
        id: makeId(), role: 'assistant', content: result.reply, timestamp: new Date().toISOString(),
        responseId: result.responseId, groundingStatus: result.groundingStatus, cards: result.cards,
        generationStatus: result.generationStatus,
        actions: result.actions, suggestions: result.suggestions,
      };
      setMessages(current => [...current, assistantMessage].slice(-MAX_MESSAGES));
    } catch (error) {
      const requestError = error instanceof LikhAIRequestError ? error : new LikhAIRequestError('LikhAI is temporarily unavailable. Please try again.', 'provider');
      const errorMessage: LikhAIMessage = {
        id: makeId(), role: 'assistant', content: requestError.message, timestamp: new Date().toISOString(), errorKind: requestError.kind,
        actions: requestError.kind === 'auth' ? [{ id: 'sign-in', label: 'Sign in again', href: '/signin' }] : [],
      };
      setMessages(current => [...current, errorMessage].slice(-MAX_MESSAGES));
    } finally { pendingRef.current = false; setLoading(false); }
  }, [accessToken, visibleMessages]);

  const rateMessage = useCallback(async (messageId: string, rating: 'positive' | 'negative') => {
    const message = visibleMessages.find(item => item.id === messageId);
    if (!message?.responseId) return;
    await submitLikhAIFeedback(message.responseId, rating);
    setMessages(current => current.map(item => item.id === messageId ? { ...item, rating } : item));
  }, [visibleMessages]);

  const clearConversation = useCallback(() => setMessages([]), []);

  return <LikhAIContext.Provider value={{ messages: visibleMessages, loading, sendMessage, rateMessage, clearConversation }}>{children}</LikhAIContext.Provider>;
}
