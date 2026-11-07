import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const BUYER_INBOX_CHANGED_EVENT = 'buyer-inbox-changed';
const PAGE_SIZE = 500;
let channelSequence = 0;

export function useBuyerUnreadMessages(userId?: string): number {
  const [unread, setUnread] = useState<{ userId: string; count: number } | null>(null);

  useEffect(() => {
    if (!userId) return;
    const buyerId = userId;
    let active = true;
    let request = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      const currentRequest = ++request;
      let count = 0;
      try {
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error } = await supabase.from('conversations')
            .select('buyer_unread')
            .eq('buyer_id', buyerId)
            .gt('buyer_unread', 0)
            .order('id')
            .range(offset, offset + PAGE_SIZE - 1);
          if (!active || currentRequest !== request || error || !data) return;
          count += data.reduce((total, row) => total + row.buyer_unread, 0);
          if (data.length < PAGE_SIZE) break;
        }
        setUnread({ userId: buyerId, count });
      } catch {
        // Keep the last confirmed total until the next refresh succeeds.
      }
    }

    function scheduleRefresh() {
      if (!active) return;
      ++request;
      clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, 150);
    }

    const filter = { schema: 'public', table: 'conversations', filter: `buyer_id=eq.${buyerId}` };
    const channel = supabase.channel(`buyer-inbox:${buyerId}:${++channelSequence}`)
      .on('postgres_changes', { ...filter, event: 'INSERT' }, scheduleRefresh)
      .on('postgres_changes', { ...filter, event: 'UPDATE' }, scheduleRefresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') scheduleRefresh(); });

    void refresh();
    window.addEventListener(BUYER_INBOX_CHANGED_EVENT, scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    }, 30_000);
    return () => {
      active = false;
      clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener(BUYER_INBOX_CHANGED_EVENT, scheduleRefresh);
      window.removeEventListener('focus', scheduleRefresh);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return unread && unread.userId === userId ? unread.count : 0;
}
