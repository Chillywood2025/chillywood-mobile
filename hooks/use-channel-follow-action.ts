import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { getAccountNavigationTreeKey, getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "../_lib/accountSessionAuthority";

import {
  followChannel,
  readMyChannelFollowState,
  unfollowChannel,
  type ChannelViewerFollowState,
} from "../_lib/channelAudience";

type UseChannelFollowActionOptions = {
  channelUserId?: string | null;
  enabled?: boolean;
  alertTitle?: string;
  signedOutMessage?: string;
  errorMessage?: string;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

export function useChannelFollowAction({
  channelUserId,
  enabled = true,
  alertTitle = "Follow Platform",
  signedOutMessage = "Sign in to follow this Platform.",
  errorMessage = "Unable to update this follow relationship right now.",
}: UseChannelFollowActionOptions) {
  const normalizedChannelUserId = normalizeText(channelUserId);
  const [state, setState] = useState<ChannelViewerFollowState>("unavailable");
  const [busy, setBusy] = useState(false);
  const [, setAuthorityRevision] = useState(0);
  const key = `${enabled}:${normalizedChannelUserId}:${getAccountNavigationTreeKey(getCurrentAccountSessionAuthoritySnapshot())}`;
  const scope = useRef({ key, read: 0, locked: false });
  const stateScope = useRef("");
  if (scope.current.key !== key) scope.current = { key, read: 0, locked: false };
  const current = useCallback((operation: typeof scope.current) => (
    scope.current === operation
    && operation.key === `${enabled}:${normalizedChannelUserId}:${getAccountNavigationTreeKey(getCurrentAccountSessionAuthoritySnapshot())}`
  ), [enabled, normalizedChannelUserId]);
  useEffect(() => subscribeToAccountSessionAuthority(() => setAuthorityRevision(value => value + 1)), []);

  const refreshState = useCallback(async (afterMutation = false) => {
    const operation = scope.current;
    if (!current(operation)) return;
    if (operation.locked && !afterMutation) return;
    const read = ++operation.read;
    if (!enabled || !normalizedChannelUserId) {
      setState("unavailable");
      return;
    }
    const nextState = await readMyChannelFollowState(normalizedChannelUserId).catch(() => "unavailable" as const);
    if (current(operation) && read === operation.read) {
      stateScope.current = operation.key;
      setState(nextState);
    }
  }, [current, enabled, normalizedChannelUserId]);
  const refresh = useCallback(() => refreshState(), [refreshState]);

  useEffect(() => {
    if (scope.current.key !== key) scope.current = { key, read: 0, locked: false };
    const operation = scope.current;
    setState("unavailable");
    setBusy(false);
    void refresh();
    return () => {
      operation.read += 1;
      if (scope.current === operation) scope.current = { key: "unmounted", read: 0, locked: false };
    };
  }, [key, refresh]);

  const toggle = useCallback(async () => {
    const operation = scope.current;
    if (operation.key !== key || !current(operation) || stateScope.current !== key
      || !enabled || !normalizedChannelUserId || operation.locked || busy || state === "self" || state === "unavailable") return;

    if (state === "signed_out") {
      Alert.alert(alertTitle, signedOutMessage);
      return;
    }

    try {
      operation.locked = true;
      operation.read += 1;
      setBusy(true);
      const result = state === "following"
        ? await unfollowChannel(normalizedChannelUserId)
        : await followChannel(normalizedChannelUserId);
      if (!current(operation)) return;

      if (result.status === "completed" || result.status === "noop") {
        operation.read += 1;
        setState(result.action === "follow" ? "following" : "not_following");
        await refreshState(true);
        return;
      }

      if (result.reason === "signed_out") {
        setState("signed_out");
        Alert.alert(alertTitle, signedOutMessage);
        return;
      }

      Alert.alert(alertTitle, errorMessage);
    } catch {
      if (current(operation)) Alert.alert(alertTitle, errorMessage);
    } finally {
      operation.locked = false;
      if (current(operation)) setBusy(false);
    }
  }, [
    alertTitle,
    busy,
    current,
    key,
    enabled,
    errorMessage,
    normalizedChannelUserId,
    refreshState,
    signedOutMessage,
    state,
  ]);

  const visibleState = stateScope.current === key ? state : "unavailable";
  return useMemo(() => ({
    busy,
    canRender: enabled
      && !!normalizedChannelUserId
      && (visibleState === "following" || visibleState === "not_following" || visibleState === "signed_out"),
    label: busy ? "Updating" : visibleState === "following" ? "Following" : "Follow",
    state: visibleState,
    toggle,
    refresh,
  }), [busy, enabled, normalizedChannelUserId, refresh, visibleState, toggle]);
}
