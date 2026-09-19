import { createContext, useContext, useState, type ReactNode } from 'react';
import QuoteReviewModal from './QuoteReviewModal';

const QuoteReviewContext = createContext<(requestId: string) => void>(() => undefined);

// The hook and provider share this context by design.
// eslint-disable-next-line react-refresh/only-export-components
export function useQuoteReview() {
  return useContext(QuoteReviewContext);
}

export function QuoteReviewProvider({ children }: { children: ReactNode }) {
  const [requestId, setRequestId] = useState<string | null>(null);
  return <QuoteReviewContext.Provider value={setRequestId}>
    {children}
    {requestId ? <QuoteReviewModal key={requestId} requestId={requestId} onClose={() => setRequestId(null)} /> : null}
  </QuoteReviewContext.Provider>;
}
