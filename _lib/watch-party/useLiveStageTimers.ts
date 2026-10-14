import { useEffect, type MutableRefObject } from "react";
import { getLiveKitParticipantTokenExpiryState } from "../livekit/token-contract";
import { getLiveStageRefreshDelay } from "./live-stage-lifecycle";

export function useLiveStageTokenRenewal(options: {
  enabled: boolean;
  token: string;
  onDue: () => void;
}) {
  const { enabled, token, onDue } = options;
  useEffect(() => {
    if (!enabled || !token) return;
    const timing = getLiveKitParticipantTokenExpiryState(token);
    if (timing.isExpired) return;
    const timeout = setTimeout(onDue, getLiveStageRefreshDelay(timing.expiresInMillis, timing.skewMillis));
    return () => clearTimeout(timeout);
  }, [enabled, token, onDue]);
}

export function useLiveStageOverlayTimer(options: {
  enabled: boolean;
  blocked: boolean;
  activityVersion: number;
  mode: string;
  delayMillis: number;
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  clear: () => void;
  hide: () => void;
}) {
  const { enabled, blocked, activityVersion, mode, delayMillis, timeoutRef, clear, hide } = options;
  useEffect(() => {
    clear();
    if (!enabled || blocked) return;
    timeoutRef.current = setTimeout(hide, delayMillis);
    return clear;
  }, [enabled, blocked, activityVersion, mode, delayMillis, timeoutRef, clear, hide]);
}
