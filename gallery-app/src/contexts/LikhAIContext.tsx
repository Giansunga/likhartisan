import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { LikhAIContext } from './likhai-context';
import { LikhAIRequestError, submitLikhAIFeedback } from '../services/likhaiClient';
import { requestLikhAIWithSession } from '../services/likhaiAuthenticatedRequest';
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
  const { user, getAccessToken } = useAuth();
  const identity = user?.id || 'anonymous';
  const [messages, setMessages] = useState<LikhAIMessage[]>(() => readStored(identity));
  const [loadedIdentity, setLoadedIdentity] = useState(identity);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'waking' | 'responding'>('idle');
  const identityRef = useRef(identity);
  const pendingRef = useRef(false);
  const visibleMessages = useMemo(() => loadedIdentity === identity ? messages : [], [identity, loadedIdentity, messages]);

  useEffect(() => {
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      pendingRef.current = false;
      setLoading(false);
      setLoadingPhase('idle');
      setMessages(readStored(identity));
      setLoadedIdentity(identity);
    }
  }, [identity]);
  useEffect(() => {
    if (loadedIdentity === identity) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ identity, messages: messages.slice(-MAX_MESSAGES) }));
  }, [identity, loadedIdentity, messages]);
  useEffect(() => {
    if (loadingPhase !== 'waking') return undefined;
    const timer = window.setTimeout(() => setLoadingPhase('responding'), 4000);
    return () => window.clearTimeout(timer);
  }, [loadingPhase]);

  const requestReply = useCallback(async (text: string, history: LikhAIMessage[], retryAssistantId?: string) => {
    setLoading(true);
    setLoadingPhase('waking');
    try {
      const result = await requestLikhAIWithSession({
        message: text,
        history,
        signedIn: Boolean(user),
        getAccessToken,
      });
      const assistantMessage: LikhAIMessage = {
        id: makeId(), role: 'assistant', content: result.reply, timestamp: new Date().toISOString(),
        responseId: result.responseId, groundingStatus: result.groundingStatus, cards: result.cards,
        generationStatus: result.generationStatus,
        actions: result.actions, suggestions: result.suggestions, resolution: result.resolution,
      };
      setMessages(current => [
        ...current.filter(item => item.id !== retryAssistantId),
        assistantMessage,
      ].slice(-MAX_MESSAGES));
    } catch (error) {
      const requestError = error instanceof LikhAIRequestError ? error : new LikhAIRequestError('LikhAI is temporarily unavailable. Please try again.', 'provider');
      const errorMessage: LikhAIMessage = {
        id: retryAssistantId || makeId(), role: 'assistant', content: requestError.message, timestamp: new Date().toISOString(), errorKind: requestError.kind,
        retryText: requestError.kind === 'auth' ? undefined : text,
        actions: requestError.kind === 'auth' ? [{ id: 'sign-in', label: 'Sign in again', href: '/signin' }] : [],
      };
      setMessages(current => [
        ...current.filter(item => item.id !== retryAssistantId),
        errorMessage,
      ].slice(-MAX_MESSAGES));
    } finally {
      pendingRef.current = false;
      setLoading(false);
      setLoadingPhase('idle');
    }
  }, [getAccessToken, user]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || pendingRef.current) return;
    pendingRef.current = true;
    const history = visibleMessages.slice(-MAX_MESSAGES);
    const userMessage: LikhAIMessage = { id: makeId(), role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(current => [...current, userMessage].slice(-MAX_MESSAGES));
    await requestReply(text, history);
  }, [requestReply, visibleMessages]);

  const retryMessage = useCallback(async (messageId: string) => {
    if (pendingRef.current) return;
    const errorMessage = visibleMessages.find(item => item.id === messageId);
    const text = errorMessage?.retryText?.trim();
    if (!text) return;
    pendingRef.current = true;
    const history = visibleMessages.filter(item => item.id !== messageId).slice(-MAX_MESSAGES);
    await requestReply(text, history, messageId);
  }, [requestReply, visibleMessages]);

  const rateMessage = useCallback(async (messageId: string, rating: 'positive' | 'negative') => {
    const message = visibleMessages.find(item => item.id === messageId);
    if (!message?.responseId) return;
    await submitLikhAIFeedback(message.responseId, rating);
    setMessages(current => current.map(item => item.id === messageId ? { ...item, rating } : item));
  }, [visibleMessages]);

  const clearConversation = useCallback(() => setMessages([]), []);

  return <LikhAIContext.Provider value={{ messages: visibleMessages, loading, loadingPhase, sendMessage, retryMessage, rateMessage, clearConversation }}>{children}</LikhAIContext.Provider>;
}
