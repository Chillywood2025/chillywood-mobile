import type { DiscoveryFeedItem, DiscoveryFeedRankingSignals } from './discoveryFeed';
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from './accountSessionAuthority';
import { supabase } from './supabase';

// Two bounded source lanes (50 public +50 Circle), three actor fields each.
export const DISCOVERY_RANKING_CANDIDATE_LIMIT = 300;
type Candidate = Pick<DiscoveryFeedItem, 'owner_user_id' | 'channel_user_id' | 'host_user_id'>;
type Pair = { user_low_id: string; user_high_id: string; status: string };
type Block = { channel_user_id: string; blocked_user_id: string };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const empty = (): DiscoveryFeedRankingSignals => ({ followedChannelIds: [], chillyCircleUserIds: [], categoryKeys: [] });

/** Ranking only, never access authority. Five bounded reads independent of the
 * viewer's graph degree; every result still passes existing table RLS. */
export async function readDiscoveryCandidateRankingSignals(items: readonly Candidate[], signal?: AbortSignal): Promise<DiscoveryFeedRankingSignals> {
  if (signal?.aborted) throw new Error('Discovery ranking read aborted.');
  if (items.length > DISCOVERY_RANKING_CANDIDATE_LIMIT) throw new Error('Too many discovery ranking candidates.');
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || authority.state !== 'ACTIVE' || authority.restoreOnly || !authority.sessionGeneration) return empty();
  const viewer = text(authority.userId);
  if (!viewer || viewer !== authority.userId || viewer !== authority.accountId) return empty();
  const candidates = new Set<string>();
  for (const item of items) {
    for (const value of [item.owner_user_id, item.channel_user_id, item.host_user_id]) {
      const id = text(value);
      if (id && id !== viewer) {
        if (id.length > 128) throw new Error('Invalid discovery ranking candidate.');
        candidates.add(id);
      }
    }
  }
  if (candidates.size > DISCOVERY_RANKING_CANDIDATE_LIMIT) throw new Error('Too many discovery ranking candidates.');
  if (!candidates.size) return empty();
  const ids = [...candidates];
  const followerQuery = supabase.from('channel_followers').select('channel_user_id,follower_user_id')
    .eq('follower_user_id', viewer).in('channel_user_id', ids).limit(DISCOVERY_RANKING_CANDIDATE_LIMIT);
  const lowQuery = supabase.from('user_friendships').select('user_low_id,user_high_id,status')
    .eq('user_low_id', viewer).eq('status', 'active').in('user_high_id', ids).limit(DISCOVERY_RANKING_CANDIDATE_LIMIT);
  const highQuery = supabase.from('user_friendships').select('user_low_id,user_high_id,status')
    .eq('user_high_id', viewer).eq('status', 'active').in('user_low_id', ids).limit(DISCOVERY_RANKING_CANDIDATE_LIMIT);
  const outgoingBlockQuery = supabase.from('channel_audience_blocks').select('channel_user_id,blocked_user_id')
    .eq('channel_user_id', viewer).in('blocked_user_id', ids).limit(DISCOVERY_RANKING_CANDIDATE_LIMIT);
  const incomingBlockQuery = supabase.from('channel_audience_blocks').select('channel_user_id,blocked_user_id')
    .eq('blocked_user_id', viewer).in('channel_user_id', ids).limit(DISCOVERY_RANKING_CANDIDATE_LIMIT);
  if (signal) for (const query of [followerQuery, lowQuery, highQuery, outgoingBlockQuery, incomingBlockQuery]) query.abortSignal(signal);
  const results = await Promise.all([
    followerQuery.returns<{ channel_user_id: string; follower_user_id: string }[]>(),
    lowQuery.returns<Pair[]>(), highQuery.returns<Pair[]>(),
    outgoingBlockQuery.returns<Block[]>(), incomingBlockQuery.returns<Block[]>(),
  ]);
  if (signal?.aborted) throw new Error('Discovery ranking read aborted.');
  if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new Error('Discovery ranking account changed.');
  if (results.some(result => result.error || !Array.isArray(result.data))) throw new Error('Discovery ranking is unavailable.');
  const [follows, lows, highs, outgoingBlocks, incomingBlocks] = results;
  const blocked = new Set<string>();
  for (const row of outgoingBlocks.data!) if (row.channel_user_id === viewer && candidates.has(row.blocked_user_id)) blocked.add(row.blocked_user_id);
  for (const row of incomingBlocks.data!) if (row.blocked_user_id === viewer && candidates.has(row.channel_user_id)) blocked.add(row.channel_user_id);
  const followed = new Set<string>();
  for (const row of follows.data!) if (row.follower_user_id === viewer && candidates.has(row.channel_user_id) && !blocked.has(row.channel_user_id)) followed.add(row.channel_user_id);
  const friends = new Set<string>();
  for (const row of [...lows.data!, ...highs.data!]) {
    if (row.status !== 'active') continue;
    const other = row.user_low_id === viewer ? row.user_high_id : row.user_high_id === viewer ? row.user_low_id : '';
    if (candidates.has(other) && !blocked.has(other)) friends.add(other);
  }
  return { followedChannelIds: [...followed], chillyCircleUserIds: [...friends], categoryKeys: [] };
}
