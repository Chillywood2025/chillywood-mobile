import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";

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

  const refresh = useCallback(async () => {
    if (!enabled || !normalizedChannelUserId) {
      setState("unavailable");
      return;
    }
    const nextState = await readMyChannelFollowState(normalizedChannelUserId).catch(() => "unavailable" as const);
    setState(nextState);
  }, [enabled, normalizedChannelUserId]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !normalizedChannelUserId) {
      setState("unavailable");
      return () => {
        cancelled = true;
      };
    }

    void readMyChannelFollowState(normalizedChannelUserId)
      .then((nextState) => {
        if (!cancelled) setState(nextState);
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, normalizedChannelUserId]);

  const toggle = useCallback(async () => {
    if (!enabled || !normalizedChannelUserId || busy || state === "self" || state === "unavailable") return;

    if (state === "signed_out") {
      Alert.alert(alertTitle, signedOutMessage);
      return;
    }

    try {
      setBusy(true);
      const result = state === "following"
        ? await unfollowChannel(normalizedChannelUserId)
        : await followChannel(normalizedChannelUserId);

      if (result.status === "completed" || result.status === "noop") {
        setState(result.action === "follow" ? "following" : "not_following");
        await refresh();
        return;
      }

      if (result.reason === "signed_out") {
        setState("signed_out");
        Alert.alert(alertTitle, signedOutMessage);
        return;
      }

      Alert.alert(alertTitle, errorMessage);
    } catch {
      Alert.alert(alertTitle, errorMessage);
    } finally {
      setBusy(false);
    }
  }, [
    alertTitle,
    busy,
    enabled,
    errorMessage,
    normalizedChannelUserId,
    refresh,
    signedOutMessage,
    state,
  ]);

  return useMemo(() => ({
    busy,
    canRender: enabled
      && !!normalizedChannelUserId
      && (state === "following" || state === "not_following" || state === "signed_out"),
    label: busy ? "Updating" : state === "following" ? "Following" : "Follow",
    state,
    toggle,
    refresh,
  }), [busy, enabled, normalizedChannelUserId, refresh, state, toggle]);
}
