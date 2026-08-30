import {
  isAttestedForegroundAuthenticatedUiCallIntent,
  isAttestedNativeCallTransitionClaim,
} from "./nativeCallTransitionProvenance.mjs";
import { normalizeCommunicationRoomIdentifier } from "./communicationRoomIdentifier.mjs";

const CALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IOS_CALL_MEDIA_PROVIDERS = new Set(["legacy_webrtc", "livekit"]);
const IOS_TERMINAL_CALL_STATUSES = new Set(["busy", "canceled", "declined", "ended", "missed"]);
const iosAcceptedMediaDescriptorStates = new WeakMap();
const iosAcceptedMediaClaimStates = new WeakMap();
const callId = (value) => String(value ?? "").trim().toLowerCase();

export function canAttemptNativeCallBackgroundAudio(input) {
  return String(input?.appState ?? "") !== "active"
    && input?.allowBackgroundAudio === true
    && input?.micRequested === true;
}

export function shouldPreserveNativeCallBackgroundAudio(input) {
  return canAttemptNativeCallBackgroundAudio(input)
    && input?.hasUsableAudioTrack === true;
}

export function setActiveCommunicationTracksEnabled(tracks, enabled) {
  let updatedCount = 0;
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!track || String(track.readyState ?? "").trim().toLowerCase() === "ended") continue;
    track.enabled = enabled === true;
    updatedCount += 1;
  }
  return updatedCount;
}

export function resolveIncomingCallRoomJoinAction(input) {
  if (input?.currentUserIsRoomHost === true) return "host";
  if (input?.inviteBelongsToCurrentCallee !== true) return "blocked";
  if (input?.inviteStatus === "ringing") return "accept";
  if (input?.inviteStatus === "accepted") return "resume";
  return "blocked";
}

export function doesNativeCallActionOwnTransition(input) {
  if (input?.authority !== "trusted_native_claim") return false;
  const claim = input?.trustedNativeClaim;
  if (!claim || claim.consumed !== true) return false;
  const monotonicNowMs = Number(input?.monotonicNowMs);
  const platform = String(input?.platform ?? "").trim().toLowerCase();
  const expectedSource = platform === "ios"
    ? "ios_callkit_native_event"
    : platform === "android"
      ? "android_native_action_store"
      : "";
  const threadId = String(input?.threadId ?? "").trim().toLowerCase();
  const currentUserId = String(input?.currentUserId ?? "").trim().toLowerCase();
  const callInviteId = String(input?.callInviteId ?? "").trim();
  const nativeCallAction = String(input?.nativeCallAction ?? "").trim().toLowerCase();
  const nativeIdentity = String(input?.nativeIdentity ?? "").trim().toLowerCase();
  return !!expectedSource
    && threadId.length > 0
    && currentUserId.length > 0
    && callInviteId.length > 0
    && nativeIdentity.length > 0
    && isAttestedNativeCallTransitionClaim(claim)
    && Object.isFrozen(claim)
    && claim.platform === platform
    && claim.source === expectedSource
    && claim.authenticatedUserId === currentUserId
    && claim.threadId === threadId
    && claim.inviteId === callInviteId.toLowerCase()
    && claim.action === nativeCallAction
    && claim.nativeIdentity === nativeIdentity
    && Number.isFinite(monotonicNowMs)
    && Number.isFinite(claim.consumedAtMonotonicMs)
    && Number.isFinite(claim.expiresAtMonotonicMs)
    && monotonicNowMs >= claim.consumedAtMonotonicMs
    && monotonicNowMs < claim.expiresAtMonotonicMs
    && Number.isSafeInteger(claim.nativeEventGeneration)
    && claim.nativeEventGeneration > 0;
}

export function createIosAcceptedCallKitMediaDescriptor(input) {
  const claim = input?.trustedNativeClaim;
  const ids = [input?.authenticatedUserId, input?.threadId, input?.inviteId, input?.callUuid].map(callId);
  const roomId = normalizeCommunicationRoomIdentifier(input?.roomId);
  const mediaProvider = String(input?.mediaProvider ?? "").trim().toLowerCase();
  const now = Number(input?.monotonicNowMs);
  if (input?.serverAccepted !== true || input?.callKitAnswerQueued !== true || input?.inviteStatus !== "accepted"
    || iosAcceptedMediaClaimStates.get(claim) !== "completing" || !ids.every((id) => CALL_ID_PATTERN.test(id)) || !roomId || !IOS_CALL_MEDIA_PROVIDERS.has(mediaProvider)
    || !isAttestedNativeCallTransitionClaim(claim) || !Object.isFrozen(claim) || claim.action !== "answer"
    || claim.platform !== "ios" || claim.source !== "ios_callkit_native_event"
    || [claim.authenticatedUserId, claim.threadId, claim.inviteId, claim.nativeIdentity].some((id, index) => id !== ids[index])
    || !Number.isFinite(now) || now < claim.consumedAtMonotonicMs || now >= claim.expiresAtMonotonicMs) return null;
  const descriptor = Object.freeze({
    authenticatedUserId: ids[0], callUuid: ids[3], claimId: claim.claimId, inviteId: ids[2], mediaProvider,
    nativeEventGeneration: claim.nativeEventGeneration, platform: "ios", roomId, source: claim.source, threadId: ids[1],
  });
  iosAcceptedMediaClaimStates.set(claim, descriptor); iosAcceptedMediaDescriptorStates.set(descriptor, "active");
  return descriptor;
}

function canSettleIosAcceptedCallKitMediaFailure(input) {
  const descriptor = input?.descriptor;
  const state = iosAcceptedMediaDescriptorStates.get(descriptor);
  const exactIds = [input?.authenticatedUserId, input?.threadId, input?.inviteId, input?.callUuid, input?.mediaProvider]
    .map(callId).every((value, index) => value === [descriptor?.authenticatedUserId, descriptor?.threadId, descriptor?.inviteId, descriptor?.callUuid, descriptor?.mediaProvider][index]);
  const exactRoom = normalizeCommunicationRoomIdentifier(input?.roomId) === descriptor?.roomId;
  return !!descriptor && input?.platform === "ios" && exactIds && exactRoom && ((state === "active" && input?.channelState === "error"
    && input?.inviteStatus === "accepted") || state === "terminal_confirmed" || state === "room_left");
}

const exactIosAcceptedInvite = (invite, expected) => !!invite
  && [invite.id, invite.threadId, invite.calleeUserId].map(callId)
    .every((value, index) => value === [expected.inviteId, expected.threadId, expected.authenticatedUserId][index])
  && normalizeCommunicationRoomIdentifier(invite.communicationRoomId) === expected.roomId
  && callId(invite.callerUserId) !== expected.authenticatedUserId && callId(invite.mediaProvider) === expected.mediaProvider;
const exactIosAnswerClaim = (claim, expected) => isAttestedNativeCallTransitionClaim(claim) && claim.action === "answer" && claim.platform === "ios" && claim.source === "ios_callkit_native_event"
  && [claim.authenticatedUserId, claim.threadId, claim.inviteId, claim.nativeIdentity].every((value, index) => value === [expected.authenticatedUserId, expected.threadId, expected.inviteId, expected.callUuid][index]);

export async function terminateIosAcceptedNativeAnswer(input, operations) {
  const expected = {authenticatedUserId: callId(input?.authenticatedUserId), callUuid: callId(input?.callUuid), inviteId: callId(input?.invite?.id), mediaProvider: callId(input?.invite?.mediaProvider), roomId: normalizeCommunicationRoomIdentifier(input?.invite?.communicationRoomId), threadId: callId(input?.threadId)};
  const claim = input?.trustedNativeClaim; const descriptor = input?.descriptor;
  const descriptorTrusted = iosAcceptedMediaDescriptorStates.has(descriptor) && [descriptor.authenticatedUserId, descriptor.threadId, descriptor.inviteId, descriptor.roomId, descriptor.callUuid, descriptor.mediaProvider]
    .every((value, index) => value === [expected.authenticatedUserId, expected.threadId, expected.inviteId, expected.roomId, expected.callUuid, expected.mediaProvider][index]);
  const trusted = exactIosAnswerClaim(claim, expected)
    || descriptorTrusted;
  if (![expected.authenticatedUserId, expected.callUuid, expected.inviteId, expected.threadId].every((id) => CALL_ID_PATTERN.test(id)) || !expected.roomId
    || !trusted || !IOS_CALL_MEDIA_PROVIDERS.has(expected.mediaProvider) || !exactIosAcceptedInvite(input?.invite, expected)
    || (input?.invite?.status !== "accepted" && !(descriptorTrusted && IOS_TERMINAL_CALL_STATUSES.has(input?.invite?.status)))
    || typeof operations?.endNative !== "function" || typeof operations?.readInvite !== "function" || typeof operations?.updateInvite !== "function" || typeof operations?.delay !== "function") return false;
  let latest = input.invite; let nativeEnded = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!nativeEnded) nativeEnded = await Promise.resolve(operations.endNative(expected.callUuid, String(input?.reason ?? "").slice(0, 80))).then((value) => value === true, () => false);
    const exact = exactIosAcceptedInvite(latest, expected);
    if (nativeEnded && exact && IOS_TERMINAL_CALL_STATUSES.has(latest.status)) return true;
    if (exact && latest.status === "accepted") await Promise.resolve(operations.updateInvite(latest)).catch(() => null);
    latest = await Promise.resolve(operations.readInvite(expected.inviteId)).catch(() => null);
    if (attempt < 2) await Promise.resolve(operations.delay(200)).catch(() => undefined);
  }
  return nativeEnded && exactIosAcceptedInvite(latest, expected) && IOS_TERMINAL_CALL_STATUSES.has(latest.status);
}

export async function completeIosAcceptedNativeAnswer(input, operations) {
  const expected = {authenticatedUserId: callId(input?.authenticatedUserId), callUuid: callId(input?.callUuid), inviteId: callId(input?.invite?.id), mediaProvider: callId(input?.invite?.mediaProvider), roomId: normalizeCommunicationRoomIdentifier(input?.invite?.communicationRoomId), threadId: callId(input?.threadId)};
  if (input?.serverAccepted !== true || input?.invite?.status !== "accepted" || !expected.roomId || !exactIosAcceptedInvite(input?.invite, expected) || !exactIosAnswerClaim(input?.trustedNativeClaim, expected)
    || iosAcceptedMediaClaimStates.has(input.trustedNativeClaim) || typeof operations?.completeNative !== "function" || typeof operations?.monotonicNow !== "function" || !operations?.terminal) return {status: "denied"};
  iosAcceptedMediaClaimStates.set(input.trustedNativeClaim, "completing");
  const completed = await Promise.resolve(operations.completeNative(input.callUuid, true)).catch(() => false);
  const descriptor = completed ? createIosAcceptedCallKitMediaDescriptor({...input, callKitAnswerQueued: true, inviteId: input.invite.id, inviteStatus: input.invite.status, mediaProvider: input.invite.mediaProvider, monotonicNowMs: operations.monotonicNow(), roomId: input.invite.communicationRoomId}) : null;
  if (descriptor) return {descriptor, status: "ready"};
  const terminal = await terminateIosAcceptedNativeAnswer({...input, reason: completed ? "accepted_media_descriptor_denied" : "callkit_answer_completion_failed"}, operations.terminal);
  iosAcceptedMediaClaimStates.set(input.trustedNativeClaim, "failed");
  return {status: terminal ? "terminal_confirmed" : "terminal_retryable"};
}

export async function settleIosAcceptedCallKitMediaFailure(input, operations) {
  if (!canSettleIosAcceptedCallKitMediaFailure(input) || typeof operations?.terminateAccepted !== "function" || typeof operations?.leaveRoom !== "function" || typeof operations?.clearLocal !== "function") return {status: "denied"};
  const descriptor = input.descriptor; let state = iosAcceptedMediaDescriptorStates.get(descriptor);
  if (state === "active") { iosAcceptedMediaDescriptorStates.set(descriptor, "settling"); if (!await Promise.resolve(operations.terminateAccepted(descriptor, "accepted_media_failed")).catch(() => false)) { iosAcceptedMediaDescriptorStates.set(descriptor, "active"); return {status: "retryable"}; } iosAcceptedMediaDescriptorStates.set(descriptor, "terminal_confirmed"); state = "terminal_confirmed"; }
  if (state === "terminal_confirmed") { const left = await Promise.resolve(operations.leaveRoom(descriptor)).then((value) => value === true, () => false); if (!left) return {status: "settled_cleanup_pending"}; iosAcceptedMediaDescriptorStates.set(descriptor, "room_left"); state = "room_left"; }
  if (state === "room_left") { const cleared = await Promise.resolve(operations.clearLocal(descriptor)).then((value) => value === true, () => false); if (!cleared) return {status: "settled_cleanup_pending"}; }
  iosAcceptedMediaDescriptorStates.delete(descriptor); return {descriptor, status: "settled"};
}

export function doesForegroundAuthenticatedUiCallIntentOwnAction(input) {
  if (input?.authority !== "foreground_authenticated_ui") return false;
  const intent = input?.foregroundUiIntent;
  const action = String(input?.action ?? "").trim().toLowerCase();
  const currentUserId = String(input?.currentUserId ?? "").trim().toLowerCase();
  const threadId = String(input?.threadId ?? "").trim().toLowerCase();
  const activeInviteId = String(input?.activeInviteId ?? "").trim().toLowerCase();
  const activeRoomId = normalizeCommunicationRoomIdentifier(input?.activeRoomId);
  const monotonicNowMs = Number(input?.monotonicNowMs);
  return !!intent
    && intent.consumed === true
    && isAttestedForegroundAuthenticatedUiCallIntent(intent)
    && Object.isFrozen(intent)
    && intent.source === "foreground_authenticated_ui"
    && intent.action === action
    && intent.authenticatedUserId === currentUserId
    && intent.threadId === threadId
    && (action !== "open_call" || (
      !!activeInviteId
      && !!activeRoomId
      && intent.inviteId === activeInviteId
      && intent.roomId === activeRoomId
    ))
    && Number.isFinite(monotonicNowMs)
    && Number.isFinite(intent.consumedAtMonotonicMs)
    && Number.isFinite(intent.expiresAtMonotonicMs)
    && monotonicNowMs >= intent.consumedAtMonotonicMs
    && monotonicNowMs < intent.expiresAtMonotonicMs;
}

export function resolveChillyChatCallParticipantRole(input) {
  const currentUserId = String(input?.currentUserId ?? "").trim();
  const callerUserId = String(input?.callerUserId ?? "").trim();
  const calleeUserId = String(input?.calleeUserId ?? "").trim();
  if (!currentUserId || !callerUserId || !calleeUserId || callerUserId === calleeUserId) return "none";
  if (currentUserId === callerUserId) return "caller";
  if (currentUserId === calleeUserId) return "callee";
  return "none";
}

export function resolveIncomingCallPresentation(input) {
  if (input?.nativeCallPresentationOwned === true) return "native_ios";
  const appState = String(input?.appState ?? "").trim().toLowerCase();
  if (appState !== "active") return "native_background";
  return input?.alreadyOnSameThread === true ? "thread_banner" : "app_banner";
}

export function shouldShowOutgoingRingingPanel(input) {
  return input?.inviteStatus === "ringing"
    && resolveChillyChatCallParticipantRole(input) === "caller";
}

export function resolveIosChatCallAudioRoute(callType) {
  return callType === "video" ? "speaker" : "receiver";
}

export function resolveAcceptedChatCallRoomId(input) {
  const acceptedInviteRoomId = input?.inviteStatus === "accepted"
    ? String(input?.inviteRoomId ?? "").trim()
    : "";
  return acceptedInviteRoomId || String(input?.threadRoomId ?? "").trim();
}

export function shouldKeepAcceptedChatCallPanelOpen(input) {
  return input?.wasOpen === true
    && resolveAcceptedChatCallRoomId(input).length > 0;
}

export function shouldActivateAcceptedChatCallMedia(input) {
  return String(input?.roomId ?? "").trim().length > 0
    && input?.inviteStatus === "accepted";
}
