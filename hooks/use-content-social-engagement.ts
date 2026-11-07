import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { subscribeToAccountSessionAuthority } from "../_lib/accountSessionAuthority";
import {
  contentSocialAuthorityKey, contentSocialKey, readCoalescedContentSocialEngagement, setContentSocialLike, setContentSocialRepost, subscribeToContentSocialEngagement,
  type ContentSocialEngagement, type ContentSocialTarget,
} from "../_lib/contentSocialEngagement";

const empty: ContentSocialEngagement = { likeCount: null, commentCount: null, shareCount: null, viewCount: null, liked: false, canLike: false, reposted: false, canRepost: false };

/** Cards coalesce reads in the API; background/inactive surfaces do not poll. */
export function useContentSocialEngagement({ kind, id, enabled = true }: ContentSocialTarget & { enabled?: boolean }) {
  const [, setAuthorityRevision] = useState(0);
  useEffect(() => subscribeToAccountSessionAuthority(() => setAuthorityRevision(value => value + 1)), []);
  const key = `${contentSocialAuthorityKey()}:${kind}:${id}:${enabled}`;
  const scope = useRef({ key, sequence: 0, locked: false });
  if (scope.current.key !== key) scope.current = { key, sequence: 0, locked: false };
  const [model, setModel] = useState<{ key: string; value: ContentSocialEngagement; loading: boolean; busy: boolean; error: string | null }>({ key, value: empty, loading: enabled, busy: false, error: null });
  const current = useCallback((operation: typeof scope.current) => scope.current === operation
    && operation.key === `${contentSocialAuthorityKey()}:${kind}:${id}:${enabled}`, [kind, id, enabled]);
  const refreshState = useCallback(async (afterMutation = false) => {
    const operation = scope.current;
    if (!current(operation) || !enabled || !id || AppState.currentState !== "active" || (operation.locked && !afterMutation)) return;
    const sequence = ++operation.sequence;
    setModel(previous => ({ key: operation.key, value: previous.key === operation.key ? previous.value : empty, loading: true, busy: operation.locked, error: null }));
    try {
      const rows = await readCoalescedContentSocialEngagement([{ kind, id }]);
      if (!current(operation) || sequence !== operation.sequence) return;
      const value = rows[contentSocialKey({ kind, id })];
      if (!value) throw new Error("This content's engagement is unavailable.");
      setModel({ key: operation.key, value, loading: false, busy: operation.locked, error: null });
    } catch {
      if (current(operation) && sequence === operation.sequence) {
        setModel({ key: operation.key, value: empty, loading: false, busy: operation.locked, error: "Engagement unavailable. Tap retry." });
      }
    }
  }, [current, enabled, id, kind]);
  const refresh = useCallback(() => refreshState(), [refreshState]);
  useEffect(() => {
    if (scope.current.key !== key) scope.current = { key, sequence: 0, locked: false };
    const operation = scope.current;
    setModel({ key, value: empty, loading: enabled, busy: false, error: null });
    void refresh();
    // Counts are private projections, not a public raw-reaction subscription.
    // Revalidate after foreground and on a modest active-surface cadence.
    const timer = enabled ? setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 30_000) : null;
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    const unsubscribe = subscribeToContentSocialEngagement((target, authority) => {
      if (target === contentSocialKey({ kind, id }) && authority === contentSocialAuthorityKey()) void refresh();
    });
    return () => {
      if (timer) clearInterval(timer);
      subscription.remove();
      unsubscribe();
      operation.sequence += 1;
      if (scope.current === operation) scope.current = { key: "retired", sequence: 0, locked: false };
    };
  }, [key, enabled, refresh, kind, id]);
  const mutate = useCallback(async (action: "like" | "repost") => {
    const operation = scope.current;
    if (!current(operation) || !enabled || operation.locked || model.key !== key || model.loading || model.error
      || (action === "like" ? !model.value.canLike : !model.value.canRepost)) return;
    operation.locked = true;
    operation.sequence += 1;
    setModel(previous => ({ ...previous, busy: true }));
    try {
      // Desired state is idempotent. No optimistic count and no blind retry.
      if (action === "like") await setContentSocialLike({ kind, id }, !model.value.liked);
      else await setContentSocialRepost({ kind, id }, !model.value.reposted);
      if (current(operation)) await refreshState(true);
    } catch {
      if (current(operation)) setModel({ key, value: empty, loading: false, busy: true, error: "Action not confirmed. Refresh to check before retrying." });
    } finally {
      operation.locked = false;
      if (current(operation)) setModel(previous => previous.key === key ? { ...previous, busy: false } : previous);
    }
  }, [current, enabled, model, key, kind, id, refreshState]);
  const toggleLike = useCallback(() => mutate("like"), [mutate]);
  const toggleRepost = useCallback(() => mutate("repost"), [mutate]);
  const visible = model.key === key ? model : { key, value: empty, loading: enabled, busy: false, error: null };
  return { ...visible.value, loading: visible.loading, busy: visible.busy, error: visible.error, toggleLike, toggleRepost, refresh };
}
