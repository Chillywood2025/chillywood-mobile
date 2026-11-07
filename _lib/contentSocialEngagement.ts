import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { getCurrentAccountSessionAuthoritySnapshot } from "./accountSessionAuthority";
import { assertAccountBoundSupabaseMutationSubjectCurrent, captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { setTitleLike } from "./contentEngagement";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export type ContentSocialTarget = { kind: "creator_video" | "title"; id: string };
export type ContentSocialEngagement = {
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  viewCount: number | null;
  liked: boolean;
  canLike: boolean;
  reposted: boolean;
  canRepost: boolean;
};
export type ContentSocialEngagementMap = Record<string, ContentSocialEngagement>;
export const contentSocialKey = ({ kind, id }: ContentSocialTarget) => `${kind}:${kind === "creator_video" ? id.trim().toLowerCase() : id.trim()}`;
const invalidationListeners = new Set<(key: string, authority: string) => void>();
export function subscribeToContentSocialEngagement(listener: (key: string, authority: string) => void) {
  invalidationListeners.add(listener);
  return () => { invalidationListeners.delete(listener); };
}
/** Call after a confirmed comment/like mutation, never on attempted sharing. */
export function invalidateContentSocialEngagement(target: ContentSocialTarget) {
  invalidationListeners.forEach(listener => listener(contentSocialKey(target), contentSocialAuthorityKey()));
}
export function contentSocialAuthorityKey() {
  const value = getCurrentAccountSessionAuthoritySnapshot();
  return value ? `${value.userId}:${value.accountId}:${value.sessionGeneration}:${value.restoreOnly}` : "signed-out";
}
const count = (value: unknown) => {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) throw new Error("Engagement count unavailable.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Engagement count unavailable.");
  return parsed;
};
const normalizeTargets = (targets: ContentSocialTarget[]) => {
  if (targets.length > 50) throw new Error("Read engagement for at most 50 items at a time.");
  const unique = new Map<string, ContentSocialTarget>();
  for (const target of targets) {
    const id = target.kind === "creator_video" ? target.id.trim().toLowerCase() : target.id.trim();
    if (!id || id.length > 128 || !["creator_video", "title"].includes(target.kind)) throw new Error("Invalid content target.");
    if (target.kind === "creator_video" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid video target.");
    unique.set(contentSocialKey({ ...target, id }), { ...target, id });
  }
  return [...unique.values()];
};

async function boundedSocialRead<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let cancel = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(new Error("Engagement request retired.")); };
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new Error("Engagement read timed out.")); }, 12_000);
  });
  try {
    // The deadline bounds UI even when a transport ignores AbortSignal. A late
    // response cannot settle this promise again or populate a cross-user cache.
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/** One page-sized read. Missing keys mean unavailable, never zero engagement. */
export async function readContentSocialEngagementBatch(targets: ContentSocialTarget[], signal?: AbortSignal): Promise<ContentSocialEngagementMap> {
  return boundedSocialRead(activeSignal => readContentSocialEngagementBatchInternal(targets, activeSignal), signal);
}
async function readContentSocialEngagementBatchInternal(targets: ContentSocialTarget[], signal?: AbortSignal): Promise<ContentSocialEngagementMap> {
  const normalized = normalizeTargets(targets);
  const key = contentSocialAuthorityKey();
  const current = () => {
    if (signal?.aborted || key !== contentSocialAuthorityKey()) throw new Error("Engagement request retired.");
  };
  current();
  if (!normalized.length) return {};
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const subject = authority ? await captureAccountBoundSupabaseMutationSubject() : null;
  current();
  // Never let an in-flight read silently inherit a new account's token.
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(subject ? { accessToken: async () => { current(); assertAccountBoundSupabaseMutationSubjectCurrent(subject); return subject.accessToken; } } : {}),
  });
  const result: ContentSocialEngagementMap = {};
  const videos = normalized.filter(target => target.kind === "creator_video").map(target => target.id);
  if (videos.length) {
    let query = client.rpc("read_creator_video_engagement_batch", { p_video_ids: videos });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    current();
    if (error || !data) throw error ?? new Error("Engagement unavailable.");
    for (const row of data) {
      if (!videos.includes(row.video_id)) throw new Error("Unexpected engagement target.");
      if (typeof row.liked_by_viewer !== "boolean" || typeof row.can_like !== "boolean" || typeof row.reposted_by_viewer !== "boolean" || typeof row.can_repost !== "boolean") throw new Error("Engagement state unavailable.");
      result[contentSocialKey({ kind: "creator_video", id: row.video_id })] = {
        likeCount: count(row.like_count), commentCount: count(row.comment_count),
        shareCount: count(row.repost_count), viewCount: null, liked: row.liked_by_viewer, canLike: row.can_like,
        reposted: row.reposted_by_viewer, canRepost: row.can_repost,
      };
    }
  }
  const titles = normalized.filter(target => target.kind === "title").map(target => target.id);
  if (titles.length) {
    let query = client.from("titles").select("id").in("id", titles).eq("is_published", true).eq("status", "published");
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    current();
    if (error || !data) throw error ?? new Error("Content unavailable.");
    const visible = data.map(row => row.id);
    const liked = new Set<string>();
    if (subject && visible.length) {
      let relationships = client.from("user_content_relationships").select("title_id").in("title_id", visible)
        .eq("user_id", subject.authority.userId).eq("relationship_type", "like");
      if (signal) relationships = relationships.abortSignal(signal);
      const response = await relationships;
      current();
      if (response.error || !response.data) throw response.error ?? new Error("Your likes are unavailable.");
      response.data.forEach(row => liked.add(row.title_id));
    }
    visible.forEach(id => {
      // Existing title likes/shares have per-user visibility controls. Do not
      // bypass them to invent a public aggregate or expose private activity.
      result[contentSocialKey({ kind: "title", id })] = {
        likeCount: null, commentCount: null, shareCount: null, viewCount: null,
        liked: liked.has(id), canLike: !!subject, reposted: false, canRepost: false,
      };
    });
  }
  current();
  return result;
}

export async function setContentSocialLike(target: ContentSocialTarget, liked: boolean) {
  const [normalized] = normalizeTargets([target]);
  if (normalized.kind === "title") { await setTitleLike(normalized.id, liked); invalidateContentSocialEngagement(normalized); return; }
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<boolean>(subject, "set_creator_video_like", {
    p_video_id: normalized.id, p_liked: liked,
  });
  if (error || data !== liked) throw error ?? new Error("Like could not be confirmed. Refresh before retrying.");
  invalidateContentSocialEngagement(normalized);
}

/** Public repost only. This does not claim delivery through a native share sheet. */
export async function setContentSocialRepost(target: ContentSocialTarget, reposted: boolean) {
  const [normalized] = normalizeTargets([target]);
  if (normalized.kind !== "creator_video") throw new Error("Public reposts are available for creator videos.");
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<boolean>(subject, "set_creator_video_repost", {
    p_video_id: normalized.id, p_reposted: reposted,
  });
  if (error || data !== reposted) throw error ?? new Error("Repost could not be confirmed. Refresh before retrying.");
  invalidateContentSocialEngagement(normalized);
}

export type CreatorVideoRepostCursor = { createdAt: string; videoId: string };
export type CreatorVideoRepostsPage = { available: boolean; items: CreatorVideoRepostCursor[]; nextCursor: CreatorVideoRepostCursor | null };
export async function readCreatorVideoRepostsPage(profileUserId: string, options: { limit?: number; cursor?: CreatorVideoRepostCursor | null; signal?: AbortSignal } = {}): Promise<CreatorVideoRepostsPage> {
  return boundedSocialRead(signal => readCreatorVideoRepostsPageInternal(profileUserId, { ...options, signal }), options.signal);
}
async function readCreatorVideoRepostsPageInternal(profileUserId: string, options: { limit?: number; cursor?: CreatorVideoRepostCursor | null; signal?: AbortSignal }): Promise<CreatorVideoRepostsPage> {
  const key = contentSocialAuthorityKey();
  const current = () => { if (options.signal?.aborted || key !== contentSocialAuthorityKey()) throw new Error("Reposts request retired."); };
  current();
  const subject = getCurrentAccountSessionAuthoritySnapshot() ? await captureAccountBoundSupabaseMutationSubject() : null;
  current();
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(subject ? { accessToken: async () => { current(); assertAccountBoundSupabaseMutationSubjectCurrent(subject); return subject.accessToken; } } : {}),
  });
  let request = client.rpc("read_creator_video_reposts", {
    p_user_id: profileUserId, p_limit: options.limit ?? 24,
    p_before_created_at: options.cursor?.createdAt ?? null, p_before_video_id: options.cursor?.videoId ?? null,
  });
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error } = await request;
  current();
  if (error) throw error;
  if (data === null) return { available: false, items: [], nextCursor: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Reposts are unavailable.");
  const parse = (value: unknown): CreatorVideoRepostCursor => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid repost page.");
    const row = value as Record<string, unknown>;
    if (typeof row.videoId !== "string" || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) throw new Error("Invalid repost cursor.");
    normalizeTargets([{ kind: "creator_video", id: row.videoId }]);
    return { videoId: row.videoId, createdAt: row.createdAt };
  };
  if (!Array.isArray(data.items) || data.items.length > 50 || !("nextCursor" in data)) throw new Error("Invalid repost page.");
  return { available: true, items: data.items.map(parse), nextCursor: data.nextCursor === null ? null : parse(data.nextCursor) };
}

type Pending = { targets: ContentSocialTarget[]; resolve: (value: ContentSocialEngagementMap) => void; reject: (error: unknown) => void };
const queues = new Map<string, Pending[]>();
/** Coalesce card mounts in one tick without storing results across sessions. */
export function readCoalescedContentSocialEngagement(targets: ContentSocialTarget[]): Promise<ContentSocialEngagementMap> {
  const normalized = normalizeTargets(targets);
  const authority = contentSocialAuthorityKey();
  return new Promise((resolve, reject) => {
    const existing = queues.get(authority);
    const pending = { targets: normalized, resolve, reject };
    if (existing) { existing.push(pending); return; }
    queues.set(authority, [pending]);
    setTimeout(() => { void (async () => {
      const batch = queues.get(authority) ?? [];
      queues.delete(authority);
      try {
        if (authority !== contentSocialAuthorityKey()) throw new Error("Engagement request retired.");
        const all = [...new Map(batch.flatMap(item => item.targets).map(target => [contentSocialKey(target), target])).values()];
        const values: ContentSocialEngagementMap = {};
        // Sequential page-sized chunks bound request fanout for larger grids.
        for (let offset = 0; offset < all.length; offset += 50) {
          if (authority !== contentSocialAuthorityKey()) throw new Error("Engagement request retired.");
          Object.assign(values, await readContentSocialEngagementBatch(all.slice(offset, offset + 50)));
        }
        if (authority !== contentSocialAuthorityKey()) throw new Error("Engagement request retired.");
        batch.forEach(item => item.resolve(Object.fromEntries(item.targets.flatMap(target => {
          const key = contentSocialKey(target); return values[key] ? [[key, values[key]]] : [];
        }))));
      } catch (error) { batch.forEach(item => item.reject(error)); }
    })(); }, 0);
  });
}
