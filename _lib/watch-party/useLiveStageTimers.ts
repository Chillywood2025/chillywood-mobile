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
    let current = true;
    const timeout = setTimeout(() => {
      if (current) onDue();
    }, getLiveStageRefreshDelay(timing.expiresInMillis, timing.skewMillis));
    return () => {
      // Native timers may already have queued their callback when cleared.
      // Retire its authority before cancelling the scheduled work.
      current = false;
      clearTimeout(timeout);
    };
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
    let current = true;
    timeoutRef.current = setTimeout(() => {
      if (current) hide();
    }, delayMillis);
    return () => {
      current = false;
      clear();
    };
  }, [enabled, blocked, activityVersion, mode, delayMillis, timeoutRef, clear, hide]);
}
