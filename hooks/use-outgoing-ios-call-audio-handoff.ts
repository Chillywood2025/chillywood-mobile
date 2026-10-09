import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding } from "../_lib/accountSessionAuthority";
import { claimChillyChatCallAudioHandoff, releaseChillyChatCallAudioHandoff } from "../_lib/chillyChatCallSoundAssets";
import type { ChillyChatCallInvite } from "../_lib/chillyChatCalls";
import { createIosOutgoingAudioHandoff, isIosNativeCallsRuntimeEnabled } from "../_lib/iosNativeCalls";

const AUDIO_HANDOFF_ERROR = "Call audio could not be prepared. End this call and try again.";
type Attempt = { binding: { callIdentity: string }; retired: boolean; native: ReturnType<typeof createIosOutgoingAudioHandoff> | null };
// Process-local explicit End intents survive screen replacement while the
// server request is pending/failed. Keys include the exact account session.
const endedOutgoingIosCallBindings = new Set<string>();

const createOwnerId = () => {
  if (typeof globalThis.crypto?.getRandomValues !== "function") throw new Error(AUDIO_HANDOFF_ERROR);
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** The incoming CallKit path retains its separate native ownership contract. */
export function useOutgoingIosCallAudioHandoff(input: {
  authority: AccountSessionAuthorityBinding | null;
  authenticatedUserId: string | null;
  invite: ChillyChatCallInvite | null;
  roomId: string | null;
  threadId: string;
}) {
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);
  const inviteId = input.invite?.id ?? "";
  const callType = input.invite?.callType ?? "voice";
  const { roomId, threadId } = input;
  const userId = input.authority?.userId ?? "";
  const accountId = input.authority?.accountId ?? "";
  const sessionGeneration = input.authority?.sessionGeneration ?? "";
  const restoreOnly = input.authority?.restoreOnly ?? true;
  const outgoing = Platform.OS === "ios" && isIosNativeCallsRuntimeEnabled() && !!input.invite
    && input.invite.mediaProvider !== "livekit" && input.invite.callerUserId === input.authenticatedUserId;
  const required = outgoing && input.invite?.status === "accepted";
  const exactOutgoingIdentity = outgoing && !!userId && !restoreOnly && userId === input.authenticatedUserId
    && accountId === userId && input.invite?.threadId === threadId
    && input.invite.communicationRoomId === roomId && !!roomId;
  const terminalIntentEligible = exactOutgoingIdentity
    && (input.invite?.status === "ringing" || input.invite?.status === "accepted");
  const eligible = required && exactOutgoingIdentity && appState === "active";
  const callIdentity = JSON.stringify([userId, accountId, sessionGeneration, inviteId, roomId, threadId]);
  const binding = useMemo(() => ({ eligible, inviteId, callType, roomId, threadId, callIdentity,
    authority: { userId, accountId, sessionGeneration, restoreOnly, state: "ACTIVE" as const } }),
  [eligible, inviteId, callType, roomId, threadId, callIdentity, userId, accountId, sessionGeneration, restoreOnly]);
  const latest = useRef(binding);
  latest.current = binding;
  const attemptRef = useRef<Attempt | null>(null);
  const [settled, setSettled] = useState<{ attempt: Attempt; ready: boolean; error: string | null } | null>(null);
  const retire = useCallback(() => {
    if (!terminalIntentEligible || latest.current.callIdentity !== binding.callIdentity
      || !sameAccountSessionAuthority(binding.authority, getCurrentAccountSessionAuthoritySnapshot())) return;
    // Cancel also retains intent before peer acceptance can win its server
    // race. Explicit terminal intent survives lifecycle rerenders/reopening.
    endedOutgoingIosCallBindings.add(binding.callIdentity);
    const attempt = attemptRef.current;
    if (!attempt || attempt.binding.callIdentity !== binding.callIdentity) return;
    attempt.retired = true;
    attempt.native?.retire();
    releaseChillyChatCallAudioHandoff(attempt);
    setSettled((previous) => previous?.attempt === attempt ? { ...previous, ready: false, error: null } : previous);
  }, [binding, terminalIntentEligible]);

  useEffect(() => {
    if (!binding.eligible || !binding.roomId || endedOutgoingIosCallBindings.has(binding.callIdentity)) return;
    const attempt: Attempt = { binding, retired: false, native: null };
    attemptRef.current = attempt;
    let ownerId: string;
    try { ownerId = createOwnerId(); }
    catch {
      attempt.retired = true;
      setSettled({ attempt, ready: false, error: AUDIO_HANDOFF_ERROR });
      return;
    }
    const isCurrent = () => latest.current === binding && attemptRef.current === attempt && !attempt.retired
      && AppState.currentState === "active"
      && sameAccountSessionAuthority(binding.authority, getCurrentAccountSessionAuthoritySnapshot());
    const native = createIosOutgoingAudioHandoff({
      ownerId, authority: binding.authority, inviteId: binding.inviteId,
      threadId: binding.threadId, roomId: binding.roomId, callType: binding.callType, isCurrent,
      onRevoked: () => {
        attempt.retired = true;
        if (latest.current === binding) setSettled({ attempt, ready: false, error: AUDIO_HANDOFF_ERROR });
      },
    });
    attempt.native = native;
    // Claims synchronously retire all shared call sounds, including pending preview/alert loads.
    const drained = claimChillyChatCallAudioHandoff(attempt, isCurrent);
    const deadline = setTimeout(() => {
      if (!isCurrent()) return;
      attempt.retired = true;
      native.retire();
      setSettled({ attempt, ready: false, error: AUDIO_HANDOFF_ERROR });
    }, 15_000);
    void native.prepare(drained).then(() => {
      if (isCurrent()) setSettled({ attempt, ready: true, error: null });
    }).catch(() => {
      if (isCurrent()) setSettled({ attempt, ready: false, error: AUDIO_HANDOFF_ERROR });
    }).finally(() => clearTimeout(deadline));
    return () => {
      clearTimeout(deadline);
      attempt.retired = true;
      native.retire();
      releaseChillyChatCallAudioHandoff(attempt);
      if (attemptRef.current === attempt) attemptRef.current = null;
    };
  }, [binding]);

  return {
    ready: !required || !!(eligible && !endedOutgoingIosCallBindings.has(binding.callIdentity) && settled?.attempt === attemptRef.current
      && settled.attempt.binding === binding && settled.ready && !settled.attempt.retired),
    error: required && endedOutgoingIosCallBindings.has(binding.callIdentity)
      ? "Call audio is stopped. Use End Call to finish closing the call."
      : required && appState === "active" && !eligible ? AUDIO_HANDOFF_ERROR
      : required && settled?.attempt.binding === binding ? settled.error : null,
    retire,
  };
}
