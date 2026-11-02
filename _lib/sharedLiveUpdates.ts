import { AppState } from 'react-native';
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from './accountSessionAuthority';
import { supabase } from './supabase';
import { getNotificationActivityOwnerKey, subscribeToNotificationActivity } from './notificationActivity';
import { mergeDiscoveryInvalidations, parseDiscoveryInvalidation, recordDiscoveryInvalidation, type DiscoveryLiveInvalidation } from './liveDiscoveryInvalidation';
export type { DiscoveryLiveInvalidation } from './liveDiscoveryInvalidation';

// Receive-only invalidation. Room settings and media channels are unchanged;
// canonical readers and fallback remain authoritative, never the hint payload.
export const LIVE_DISCOVERY_PUSH_ENABLED = process.env.EXPO_PUBLIC_LIVE_DISCOVERY_PUSH_ENABLED === 'true';
export const LIVE_UPDATE_COALESCE_MS = 100;
export const MAX_DISCOVERY_LIVE_INTERESTS = 4;
export type LiveUpdateScope = 'discovery';
export type DiscoveryLiveUpdateInterest = { surface: 'home' | 'profile' | 'channel' } | { creatorUserId: string } | { viewerUserId: string };
export function getDiscoveryLiveUpdateInterest(options: { surface?: string; creatorUserId?: string; creatorUserIds?: string[]; ownerUserId?: string; channelUserId?: string }): DiscoveryLiveUpdateInterest {
  const creatorUserId = options.creatorUserId ?? options.ownerUserId ?? options.channelUserId
    ?? (options.creatorUserIds?.length === 1 ? options.creatorUserIds[0] : undefined);
  if (creatorUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creatorUserId)) return { creatorUserId: creatorUserId.toLowerCase() };
  return { surface: options.surface === 'profile' || options.surface === 'channel' ? options.surface : 'home' };
}
type Listener = (invalidation?: DiscoveryLiveInvalidation) => void;
type Entry = { authority: AccountSessionAuthorityBinding; topic: string; connected: boolean; listeners: Set<Listener>; close: () => void };
const entries = new Map<string, Entry>();
const interestTopic = (interest: DiscoveryLiveUpdateInterest) => 'viewerUserId' in interest
  ? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(interest.viewerUserId) ? `discovery:v1:viewer:${interest.viewerUserId.toLowerCase()}` : '')
  : 'creatorUserId' in interest
  ? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(interest.creatorUserId) ? `discovery:v1:creator:${interest.creatorUserId.toLowerCase()}` : '')
  : (['home', 'profile', 'channel'].includes(interest.surface) ? `discovery:v1:surface:${interest.surface}` : '');

export function isDiscoveryLiveUpdateConnected(authority: AccountSessionAuthorityBinding | null | undefined, interest: DiscoveryLiveUpdateInterest) {
  if (!LIVE_DISCOVERY_PUSH_ENABLED || !authority || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return false;
  const topic = interestTopic(interest);
  return Array.from(entries.values()).some(entry => entry.topic === topic && entry.connected && sameAccountSessionAuthority(authority, entry.authority));
}
// supabase.channel(topic) may return an existing channel until asynchronous
// removal finishes. Never let the old generation remove its replacement.
let channelRetirement: Promise<void> | null = null;

/** One scoped channel per active account generation, shared by mounted readers.
 * Hints carry no records, counts or access grants. Consumers MUST reread current
 * authorized state. This is best-effort invalidation, not an event ledger.
 */
function subscribeToInterest(authority: AccountSessionAuthorityBinding | null | undefined, scope: LiveUpdateScope, listener: Listener,
  interest: DiscoveryLiveUpdateInterest) {
  if (!authority || authority.restoreOnly
    || scope !== 'discovery' || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return () => {};
  const topic = interestTopic(interest);
  const ownViewer = 'viewerUserId' in interest;
  if (ownViewer && interest.viewerUserId.toLowerCase() !== authority.userId.toLowerCase()) return () => {};
  if (!topic) return () => {};
  const key = JSON.stringify([scope, topic, authority.userId, authority.accountId, authority.sessionGeneration]);
  let entry = entries.get(key);
  if (!entry) {
    // A route may accidentally mount many creator rails. Do not turn that into
    // one subscription per creator; excess consumers retain canonical fallback.
    if (!ownViewer && Array.from(entries.values()).filter(value => !value.topic.startsWith('discovery:v1:viewer:')
      && sameAccountSessionAuthority(authority, value.authority)).length >= MAX_DISCOVERY_LIVE_INTERESTS) return () => {};
    const owned: Entry = { authority, topic, connected: false, listeners: new Set(), close: () => {} };
    entry = owned;
    entries.set(key, owned);
    let retired = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let queuedInvalidation: DiscoveryLiveInvalidation | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let connecting = false;
    const current = () => !retired && entries.get(key) === owned && AppState.currentState === 'active'
      && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    const invalidate = (invalidation: DiscoveryLiveInvalidation = { keys: null }) => {
      if (!current()) return;
      recordDiscoveryInvalidation(invalidation);
      queuedInvalidation = mergeDiscoveryInvalidations(queuedInvalidation, invalidation);
      if (timer !== undefined) return;
      // Jitter avoids synchronized reconnect/fanout reads; bounded and shared
      // across listeners. Each reader additionally budgets its automatic reads.
      timer = setTimeout(() => {
        timer = undefined;
        const delivered = queuedInvalidation; queuedInvalidation = undefined;
        if (!current()) return;
        for (const callback of owned.listeners) {
          if (!current()) break;
          try { callback(delivered); } catch { /* One consumer cannot break others. */ }
        }
      }, LIVE_UPDATE_COALESCE_MS + Math.floor(Math.random() * 100));
    };
    const disconnect = () => {
      generation += 1;
      owned.connected = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      queuedInvalidation = undefined;
      const previous = channel;
      channel = null;
      connecting = false;
      if (previous) {
        const retired = Promise.all([channelRetirement, supabase.removeChannel(previous).catch(() => {})]).then(() => {});
        channelRetirement = retired;
        void retired.then(() => { if (channelRetirement === retired) channelRetirement = null; });
      }
    };
    const connect = () => {
      if (!LIVE_DISCOVERY_PUSH_ENABLED || !current() || channel || connecting) return;
      const attempt = ++generation;
      connecting = true;
      const start = () => {
        if (attempt !== generation || !current()) return;
        connecting = false;
        try {
        channel = supabase.channel(topic, { config: { private: true } });
        channel.on('broadcast', { event: 'discovery:invalidate' }, message => {
          if (attempt === generation) invalidate(parseDiscoveryInvalidation(message?.payload));
        }).subscribe(status => {
          // Reconnection is a reason to reconcile, never proof of missing or
          // present rows. Delayed callbacks from removed channels are fenced.
          if (attempt === generation && current()) {
            owned.connected = status === 'SUBSCRIBED';
            invalidate();
          }
        });
        } catch { disconnect(); /* Periodic canonical reads still operate. */ }
      };
      if (channelRetirement) void channelRetirement.then(start); else start();
    };
    const account = subscribeToAccountSessionAuthority(next => {
      if (!sameAccountSessionAuthority(authority, next)) owned.close();
    });
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') connect(); else disconnect();
    });
    // Existing durable notification activity covers some creator-live/event
    // transitions. Reuse its sole app-owned subscription; never create another
    // notification CDC stream for each discovery screen. Coverage is partial.
    const activity = ownViewer ? () => {} : subscribeToNotificationActivity(getNotificationActivityOwnerKey(authority), () => invalidate({ keys: [] }));
    owned.close = () => {
      if (retired) return;
      retired = true;
      disconnect();
      account(); app.remove(); activity(); owned.listeners.clear();
      if (entries.get(key) === owned) entries.delete(key);
    };
    connect();
  }
  const owned = entry;
  owned.listeners.add(listener);
  return () => {
    owned.listeners.delete(listener);
    if (!owned.listeners.size) owned.close();
  };
}

/** Every active reader shares one additional receive-only OWN viewer channel.
 * Circle changes never ride public scopes or require one socket per friend.
 * The server independently checks exact current session/topic ownership. */
export function subscribeToLiveUpdates(authority: AccountSessionAuthorityBinding | null | undefined, scope: LiveUpdateScope, listener: Listener,
  interest: DiscoveryLiveUpdateInterest = { surface: 'home' }) {
  const publicInterest = subscribeToInterest(authority, scope, listener, interest);
  const viewerInterest = authority && !('viewerUserId' in interest)
    ? subscribeToInterest(authority, scope, listener, { viewerUserId: authority.userId }) : () => {};
  return () => { publicInterest(); viewerInterest(); };
}
