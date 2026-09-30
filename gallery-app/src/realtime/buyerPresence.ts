import { supabase } from '../lib/supabase';

type BuyerPresenceListener = (activeBuyers: Record<string, boolean>) => void;
type BuyerChannel = ReturnType<typeof supabase.channel>;

const listeners = new Set<BuyerPresenceListener>();
const trackers = new Map<symbol, string>();
let channel: BuyerChannel | null = null;
let subscribed = false;
let removalTimer: ReturnType<typeof setTimeout> | null = null;
let untrackTimer: ReturnType<typeof setTimeout> | null = null;
let removal: Promise<void> | null = null;

function hasConsumers() {
  return listeners.size > 0 || trackers.size > 0;
}

function activeBuyers(): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  if (!channel) return next;
  for (const presences of Object.values(channel.presenceState())) {
    for (const presence of presences as Array<{ user_id?: string }>) {
      if (presence.user_id) next[presence.user_id] = true;
    }
  }
  return next;
}

function trackCurrentBuyer() {
  const userId = trackers.values().next().value;
  if (subscribed && channel && userId) {
    void channel.track({ user_id: userId, online_at: new Date().toISOString() })
      .catch(error => console.error('Buyer presence tracking failed:', error));
  }
}

function ensureChannel() {
  if (removalTimer) {
    clearTimeout(removalTimer);
    removalTimer = null;
  }
  if (channel || removal || !hasConsumers()) return;

  const next = supabase.channel('buyers-online');
  channel = next;
  next.on('presence', { event: 'sync' }, () => {
    const active = activeBuyers();
    for (const listener of listeners) listener(active);
  });
  next.subscribe(status => {
    if (channel !== next) return;
    subscribed = status === 'SUBSCRIBED';
    if (subscribed) trackCurrentBuyer();
  });
}

function scheduleRemoval() {
  if (hasConsumers() || removalTimer) return;
  // Supabase reuses topics, so keep the subscribed channel through a quick effect remount.
  removalTimer = setTimeout(() => {
    removalTimer = null;
    if (hasConsumers() || !channel) return;
    const previous = channel;
    channel = null;
    subscribed = false;
    removal = Promise.resolve(supabase.removeChannel(previous))
      .then(() => undefined)
      .catch(error => console.error('Buyer presence cleanup failed:', error))
      .finally(() => {
        removal = null;
        ensureChannel();
      });
  }, 0);
}

export function listenToBuyerPresence(listener: BuyerPresenceListener): () => void {
  listeners.add(listener);
  ensureChannel();
  listener(activeBuyers());
  return () => {
    listeners.delete(listener);
    scheduleRemoval();
  };
}

export function trackBuyerPresence(userId: string): () => void {
  if (untrackTimer) {
    clearTimeout(untrackTimer);
    untrackTimer = null;
  }
  const token = Symbol('buyer-presence');
  trackers.set(token, userId);
  ensureChannel();
  trackCurrentBuyer();
  return () => {
    trackers.delete(token);
    if (!trackers.size && listeners.size && subscribed && channel) {
      // A remount may start tracking again before this reaches the server.
      untrackTimer = setTimeout(() => {
        untrackTimer = null;
        if (!trackers.size && channel) {
          void channel.untrack().catch(error => console.error('Buyer presence cleanup failed:', error));
        }
      }, 0);
    } else if (trackers.size) {
      trackCurrentBuyer();
    }
    scheduleRemoval();
  };
}
