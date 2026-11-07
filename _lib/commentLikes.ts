import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { getCurrentAccountSessionAuthoritySnapshot } from "./accountSessionAuthority";
import { assertAccountBoundSupabaseMutationSubjectCurrent, captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export type CommentLikeTarget = { kind: "profile_post_comment" | "creator_video_comment"; id: string };
export type CommentLikeState = { likeCount: number | null; liked: boolean; canLike: boolean };
export type CommentLikesMap = Record<string, CommentLikeState>;
export const commentLikeKey = (target: CommentLikeTarget) => `${target.kind}:${target.id.trim()}`;
export function commentLikeAuthorityKey() {
  const a = getCurrentAccountSessionAuthoritySnapshot();
  return a ? `${a.userId}:${a.accountId}:${a.sessionGeneration}:${a.restoreOnly}` : "signed-out";
}
const listeners = new Set<(key: string, authority: string) => void>();
export function subscribeToCommentLikes(listener: (key: string, authority: string) => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
const normalize = (targets: CommentLikeTarget[]) => {
  if (targets.length > 50) throw new Error("Read at most 50 comment likes at a time.");
  const map = new Map<string, CommentLikeTarget>();
  for (const target of targets) {
    const id = target.id.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      || !["profile_post_comment", "creator_video_comment"].includes(target.kind)) throw new Error("Invalid comment.");
    const next = { ...target, id }; map.set(commentLikeKey(next), next);
  }
  return [...map.values()];
};

async function boundedRead<T>(query: PromiseLike<T> & { abortSignal: (signal: AbortSignal) => PromiseLike<T> }, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(); rejectAbort(new Error("Comment request retired or timed out.")); };
  const timer = setTimeout(abort, 12_000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try { return await Promise.race([query.abortSignal(controller.signal), aborted]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

/** Bounded canonical totals. Missing/unauthorized rows remain unavailable. */
export async function readCommentLikesBatch(targets: CommentLikeTarget[], signal?: AbortSignal): Promise<CommentLikesMap> {
  const normalized = normalize(targets), authority = commentLikeAuthorityKey();
  const current = () => { if (signal?.aborted || authority !== commentLikeAuthorityKey()) throw new Error("Comment request retired."); };
  current();
  if (!normalized.length) return {};
  const subject = getCurrentAccountSessionAuthoritySnapshot() ? await captureAccountBoundSupabaseMutationSubject() : null;
  current();
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(subject ? { accessToken: async () => { current(); assertAccountBoundSupabaseMutationSubjectCurrent(subject); return subject.accessToken; } } : {}),
  });
  const result: CommentLikesMap = {};
  for (const kind of ["profile_post_comment", "creator_video_comment"] as const) {
    const ids = normalized.filter(t => t.kind === kind).map(t => t.id);
    if (!ids.length) continue;
    const query = client.rpc("read_comment_likes_batch", { p_kind: kind, p_comment_ids: ids });
    const { data, error } = await boundedRead(query, signal);
    current();
    if (error || !Array.isArray(data)) throw error ?? new Error("Comment likes unavailable.");
    for (const row of data) {
      // PostgREST may serialize bigint as a string despite generated number types.
      const rawCount: unknown = row.like_count;
      const count = typeof rawCount === "number" || typeof rawCount === "string" ? Number(rawCount) : NaN;
      const key = commentLikeKey({ kind, id: String(row.comment_id) });
      if (!ids.includes(row.comment_id) || result[key] || rawCount === "" || !Number.isSafeInteger(count) || count < 0
        || typeof row.liked_by_viewer !== "boolean" || typeof row.can_like !== "boolean") throw new Error("Comment likes unavailable.");
      result[key] = { likeCount: count, liked: row.liked_by_viewer, canLike: row.can_like };
    }
  }
  return result;
}
export async function setCommentLike(target: CommentLikeTarget, liked: boolean) {
  const [normalized] = normalize([target]);
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<boolean>(subject, "set_comment_like", {
    p_kind: normalized.kind, p_comment_id: normalized.id, p_liked: liked,
  });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (error || data !== liked) throw error ?? new Error("Like not confirmed. Refresh before retrying.");
  listeners.forEach(listener => listener(commentLikeKey(normalized), commentLikeAuthorityKey()));
}

type Request = { targets: CommentLikeTarget[]; authority: string; resolve: (value: CommentLikesMap) => void; reject: (reason: unknown) => void };
let queued: Request[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
/** Mounted comment rows share bounded reads rather than one network call per row. */
export function readCoalescedCommentLikes(targets: CommentLikeTarget[]): Promise<CommentLikesMap> {
  const normalized = normalize(targets);
  return new Promise((resolve, reject) => {
    queued.push({ targets: normalized, authority: commentLikeAuthorityKey(), resolve, reject });
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const requests = queued; queued = [];
      void (async () => {
        const authority = commentLikeAuthorityKey();
        const active = requests.filter(r => { if (r.authority === authority) return true; r.reject(new Error("Comment request retired.")); return false; });
        const unique = [...new Map(active.flatMap(r => r.targets).map(t => [commentLikeKey(t), t])).values()];
        try {
          const all: CommentLikesMap = {};
          for (let start = 0; start < unique.length; start += 50) {
            if (authority !== commentLikeAuthorityKey()) throw new Error("Comment request retired.");
            Object.assign(all, await readCommentLikesBatch(unique.slice(start, start + 50)));
          }
          if (authority !== commentLikeAuthorityKey()) throw new Error("Comment request retired.");
          active.forEach(r => r.resolve(Object.fromEntries(r.targets.map(t => [commentLikeKey(t), all[commentLikeKey(t)]]).filter(([, value]) => value)) as CommentLikesMap));
        } catch (error) { active.forEach(r => r.reject(error)); }
      })();
    }, 0);
  });
}
