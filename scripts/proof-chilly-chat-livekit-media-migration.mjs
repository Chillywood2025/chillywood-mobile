import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const pass = (label) => console.log(`PASS ${label}`);
const fail = (label) => failures.push(label);
const requireText = (source, needle, label) => (
  source.includes(needle) ? pass(label) : fail(`${label}: missing ${needle}`)
);
const forbidText = (source, needle, label) => (
  source.includes(needle) ? fail(`${label}: found forbidden ${needle}`) : pass(label)
);
const requireOrdered = (source, needles, label) => {
  let cursor = -1;
  for (const needle of needles) {
    const next = source.indexOf(needle, cursor + 1);
    if (next < 0 || next < cursor) {
      fail(`${label}: missing or out-of-order ${needle}`);
      return;
    }
    cursor = next;
  }
  pass(label);
};

const provider = read("hooks/use-chat-call-media-session.ts");
const providerPolicy = read("_lib/chatCallMediaProviderPolicy.ts");
const providerSources = `${provider}\n${providerPolicy}`;
const liveKitSession = read("hooks/use-livekit-chat-call-session.ts");
const legacySession = read("hooks/use-communication-room-session.ts");
const rootLayout = read("app/_layout.tsx");
const chatScreen = read("app/chat/[threadId].tsx");
const inRoomPanel = read("components/communication/in-room-communication-panel.tsx");
const tokenFunction = read("supabase/functions/livekit-token/index.ts");
const authorityPolicy = read("supabase/functions/_shared/chat-call-livekit-authority.ts");
const tokenAuthority = `${tokenFunction}\n${authorityPolicy}`;
const tokenContract = read("_lib/livekit/token-contract.ts");
const operator = read("supabase/functions/livekit-operator/index.ts");
const telemetry = read("_lib/livekit/livekitRenderTelemetry.ts");
const chatTelemetry = read("_lib/chatCallLiveKitTelemetry.ts");
const chatTelemetryBindingPolicy = read("_lib/chatCallTelemetryBindingPolicy.ts");
const chatTelemetryAuthority = read("supabase/functions/_shared/chat-call-telemetry-authority.ts");
const migration = read("supabase/migrations/20260728141417_chilly_chat_livekit_media_rollout.sql");
const chatRoomCreation = read("_lib/chat.ts");
const transition = read("supabase/functions/chilly-chat-call-transition/index.ts");
const callDispatch = read("supabase/functions/chilly-chat-call-dispatch/index.ts");
const iosVoipDispatch = read("supabase/functions/ios-voip-call-dispatch/index.ts");
const iosVoipPolicy = read("supabase/functions/_shared/ios-voip-policy.mjs");

requireText(provider, "fixedProviderRef", "provider is fixed per invite");
requireText(providerSources, 'mediaProvider === "legacy_webrtc"', "legacy transport has an exact selector");
requireText(providerSources, 'mediaProvider === "livekit"', "LiveKit transport has an exact selector");
requireText(provider, "enabled: shouldEnableLegacy", "legacy transport receives only its own enable gate");
requireText(provider, "enabled: shouldEnableLiveKit", "LiveKit transport receives only its own enable gate");
forbidText(provider, "catch(() => legacy", "provider cannot fall back mid-call");
requireText(chatScreen, "useChatCallMediaSession", "Chat screen consumes the provider abstraction");
forbidText(chatScreen, "new Room(", "Chat screen does not embed LiveKit SDK connection calls");
forbidText(chatScreen, "new RTCPeerConnection", "Chat screen does not embed direct WebRTC connection calls");
requireText(legacySession, "RTCPeerConnection", "legacy direct WebRTC remains available for bounded rollback");
requireText(liveKitSession, "new Room(", "LiveKit SDK connection is isolated in the LiveKit provider");

requireOrdered(
  liveKitSession,
  [
    'inviteStatus !== "accepted"',
    "joinCommunicationRoomSession({",
    'emitStage("token_requested"',
    "requestLiveKitParticipantToken({",
    "validateChatCallLiveKitTokenClaims({",
    "LiveKitAudioSession.startAudioSession()",
    "liveKitRoom.connect(",
    "setMicrophoneEnabled(true)",
  ],
  "accepted membership precedes token, connection, and publication",
);
requireText(liveKitSession, 'mediaProvider: "livekit"', "token request pins the LiveKit provider");
requireText(liveKitSession, 'participantRole: "speaker"', "accepted call requests speaker grants");
requireText(liveKitSession, "LiveKitAudioSession.stopAudioSession()", "cleanup stops the LiveKit audio session");
requireText(liveKitSession, "configureLiveKitIosAudioSession(", "non-CallKit iOS calls install LiveKit audio-engine management");
requireText(liveKitSession, "resetLiveKitIosAudioSession()", "non-CallKit iOS audio management releases its native policy after the call");
requireText(liveKitSession, 'Platform.OS === "ios" && !allowBackgroundAudio', "CallKit-owned iOS calls retain native audio-session authority");
requireText(
  read("_lib/livekit/react-native-module.tsx"),
  "LiveKitAudioSession.setAppleAudioConfiguration({",
  "non-CallKit iOS calls use the installed LiveKit SDK audio-session API",
);
requireText(
  read("_lib/livekit/react-native-module.tsx"),
  'audioMode: preferSpeakerOutput ? "videoChat" : "voiceChat"',
  "voice and video calls select their exact iOS audio mode",
);
requireText(liveKitSession, "leaveCommunicationRoomSession({", "cleanup leaves communication membership");
requireText(liveKitSession, 'emitStage("cleanup_complete"', "cleanup emits installed completion telemetry");
requireText(liveKitSession, "void setSpeaker(speakerRequestedRef.current)", "remote audio subscription reasserts the selected speaker route");
requireText(liveKitSession, "await setSpeaker(speakerRequestedRef.current)", "camera publication cannot leave the audio session stale");
requireText(inRoomPanel, "selfParticipant?.liveKitVideoTrackReference", "camera UI recognizes the rendered LiveKit local track");
requireText(chatScreen, 'terminalInvite.status === "ringing" && currentUserIsCaller', "the durable caller can cancel before media starts");
requireText(chatScreen, "activeCallRoomId && !callPanelOpen && !incomingCallRinging", "ringing receivers do not see a duplicate active-room banner");
requireText(chatScreen, "hasIosNativeCallPresentation(incomingCallInviteId)", "same-thread iOS presentation is owned only by the exact CallKit invite");
requireText(rootLayout, "hasIosNativeCallPresentation(alertInviteId)", "app-wide iOS presentation is owned only by the exact CallKit invite");
requireText(chatScreen, "iosNativePresentationGraceReadyInviteId !== incomingCallInviteId", "same-thread fallback waits briefly for CallKit without remaining hidden");
requireText(rootLayout, "iosNativePresentationGraceReadyInviteId !== alertInviteId", "app-wide fallback waits briefly for CallKit without remaining hidden");
requireText(chatScreen, "const resumeAcceptedIncomingInvite = useCallback", "native Answer can resume an accepted invite after an activity remount");
requireText(chatScreen, "const resumableAcceptedInvite =", "thread loading rehydrates a server-accepted callee after an activity remount");
requireText(chatScreen, "applyAcceptedIncomingInviteState(resumableAcceptedInvite)", "thread loading opens accepted media without requiring a second tap");
requireText(chatScreen, 'latestInvite?.status === "accepted"', "accepted-invite recovery rechecks authoritative invite state");
requireText(chatScreen, "latestThread?.activeCommunicationRoomId === roomId", "accepted-invite recovery rechecks exact thread-room linkage");
requireText(chatScreen, 'snapshot?.room.status === "active"', "accepted-invite recovery rejects stale or ended rooms");
requireText(chatScreen, 'invite.status === "accepted"\n          ? await resumeAcceptedIncomingInvite(invite)', "native Answer resumes rather than repeating the acceptance transition");
requireText(chatScreen, "|| iosNativeCallPresentationOwned\n      || waitingForIosNativePresentation", "same-thread ringtone and vibration defer to exact CallKit ownership and grace");
requireText(rootLayout, "|| iosNativeCallPresentationOwned\n      || waitingForIosNativePresentation", "app-wide ringtone and vibration defer to exact CallKit ownership and grace");
requireText(rootLayout, 'settleNativeTerminalAction(event, "declined")', "CallKit Decline persists directly without foreground navigation");
requireText(rootLayout, 'settleNativeTerminalAction(event, "ended")', "CallKit End persists directly without foreground navigation");
requireText(callDispatch, 'const shouldInvokeIosVoip = (action: DispatchAction) => action === "incoming"', "PushKit dispatch is reserved for the initial invitation");
requireText(iosVoipDispatch, 'reason: "non_incoming_uses_authoritative_state"', "direct non-incoming VoIP dispatch fails closed");
requireText(iosVoipPolicy, 'throw new Error("non_incoming_voip_payload_denied")', "VoIP payload construction rejects terminal lifecycle state");

for (const authorityNeedle of [
  '.eq("id", callInviteId)',
  'inviteStatus !== "accepted"',
  "!!normalize(input.invite.endedAt)",
  'inviteMediaProvider !== "livekit"',
  "inviteThreadId !== normalize(input.roomThreadId)",
  "inviteRoomId !== roomName",
  "normalizeRoom(input.roomActiveRoomId) !== roomName",
  "inviteCallType !== normalizeLower(input.requestedCallType)",
  "threadMemberIds.size !== 2",
  "hasThirdPartyMembership",
  "isRecentTime(membership.last_seen_at",
  'participantRole: "speaker"',
  "canPublish: true",
]) {
  requireText(tokenAuthority, authorityNeedle, `token authority requires ${authorityNeedle}`);
}
requireText(tokenFunction, "resolveChatCallLiveKitAuthority({", "token function uses the tested Chat Call authority policy");
requireText(tokenContract, "validateChatCallLiveKitTokenClaims", "client validates exact token claims");
for (const grant of ["roomJoin", "canPublish", "canSubscribe", "canPublishData"]) {
  requireText(tokenContract, `video?.${grant} === true`, `client requires ${grant} grant`);
}

const chatAuthorityStart = tokenFunction.indexOf('surface === "chat-call"');
const chatAuthorityEnd = tokenFunction.indexOf("if (room.hostUserId === userId)", chatAuthorityStart);
const chatAuthority = tokenFunction.slice(chatAuthorityStart, chatAuthorityEnd);
forbidText(chatAuthority.toLowerCase(), "premium", "Chat Call token authority adds no Premium gate");
requireText(chatRoomCreation, 'contentAccessRule: "open"', "Chat Call room creation remains outside Premium access");

requireText(migration, "public_default_provider = 'legacy_webrtc'", "public provider is constrained fail-closed");
requireText(migration, "canary_enabled boolean not null default false", "canary begins disabled");
requireText(migration, "livekit_emergency_stop boolean not null default true", "emergency stop begins engaged");
requireText(migration, "new.chat_call_media_provider := old.chat_call_media_provider", "database preserves provider for the invite lifetime");
requireText(migration, "caller_canary.enabled", "caller must be in the role-free canary cohort");
requireText(migration, "callee_canary.enabled", "callee must be in the role-free canary cohort");
requireText(transition, "chatCallMediaProvider", "transition responses retain server provider authority");

for (const stage of [
  "token_requested",
  "token_returned",
  "token_claims_validated",
  "websocket_connected",
  "ice_state",
  "room_connected",
  "local_audio_published",
  "local_video_published",
  "remote_participant_joined",
  "remote_audio_subscribed",
  "remote_video_subscribed",
  "first_audio",
  "first_video",
  "installed_ui_connected",
  "backgrounded",
  "foregrounded",
  "reconnecting",
  "recovered",
  "disconnected",
  "cleanup_complete",
]) {
  requireText(telemetry, `"${stage}"`, `telemetry contract includes ${stage}`);
}
requireText(chatTelemetry, 'surface: "chat_call"', "Chat Call telemetry uses the sentinel surface");
requireText(chatTelemetry, "liveKitSdkEvent: true", "Chat Call telemetry is marked as SDK-derived");
requireText(telemetry, 'sanitizeChatCallTelemetryBinding(input.callInviteId, "uuid")', "client preserves only a strict exact invite binding for the authenticated collector");
requireText(telemetry, 'sanitizeChatCallTelemetryBinding(input.communicationRoomId, "room_code")', "client strips incompatible internal room identifiers before collector ingress");
requireText(chatTelemetryBindingPolicy, "UUID_PATTERN", "client exact invite and thread bindings are UUID-bounded");
requireText(chatTelemetryAuthority, "authoritativeCommunicationRoomId", "collector derives an exact room only from the authenticated accepted invite");
requireText(chatTelemetryAuthority, "clientRoomBindingCompatible", "collector rejects a conflicting client room hint");
requireText(chatTelemetryAuthority, "participantMatches", "collector requires the authenticated user to be an invite participant");
requireText(operator, "delete renderEvent.communicationRoomId", "collector strips raw communication room IDs");
requireText(operator, "delete renderEvent.callInviteId", "collector strips raw call invite IDs");
requireText(operator, "delete renderEvent.threadId", "collector strips raw thread IDs");
requireText(chatTelemetry, "emitChatCallLiveKitStage", "Chat Call stages use the bounded telemetry binding");
requireText(operator, '.from("chat_call_invites")', "collector corroborates the exact durable Chat Call invite");
requireText(operator, "chatCallBindingCorroborated", "collector requires exact invite, room, thread, provider, acceptance, and participant binding");
requireText(operator, '.eq("surface", "chat-call")', "collector corroborates an exact Chat Call token audit");
requireText(operator, '.eq("outcome", "success")', "collector requires successful token authorization");
requireText(operator, '.eq("can_publish", true)', "collector requires publish authority");
requireText(operator, '.eq("can_subscribe", true)', "collector requires subscribe authority");
requireText(operator, "if (tokenAuditRoomHash)", "collector cannot reuse an unrelated recent token audit");
requireText(operator, "safeTokenAuditBoolean", "collector persists only the non-secret token-audit corroboration boolean");
requireText(chatTelemetryAuthority, "isApprovedTelemetryDigest", "collector retains only named server-generated telemetry digests");
requireText(operator, "clientRenderMetadata", "collector separates client metadata from server-owned corroboration");
requireText(operator, 'delete clientRenderMetadata[serverOwnedKey]', "client metadata cannot overwrite server-owned corroboration");
requireText(chatTelemetryAuthority, "PREACCEPT_TERMINAL_STATUSES", "collector bounds non-accepted terminal lifecycle states");
requireText(chatTelemetryAuthority, "PREACCEPT_TERMINAL_CLEANUP_STAGES", "collector bounds non-accepted terminal cleanup stages");
requireText(operator, "preacceptTerminalCleanupCorroborated", "collector records exact preaccept terminal cleanup without claiming media");
requireText(operator, "non_livekit_chat_call_evidence_rejected", "collector rejects non-LiveKit evidence");
requireText(operator, "chat_call_livekit_token_requested_not_success_proof", "token request alone is not LiveKit success proof");

for (const clientSource of [provider, liveKitSession, chatScreen, chatTelemetry]) {
  forbidText(clientSource, "SUPABASE_SERVICE_ROLE_KEY", "client source contains no Supabase service-role credential");
}
for (const privateNeedle of ["participantToken:", "sdp", "candidate", "ipAddress", "email"]) {
  forbidText(chatTelemetry, privateNeedle, `telemetry does not emit ${privateNeedle}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`Chi'lly Chat LiveKit media migration proof failed (${failures.length}).`);
  process.exit(1);
}

console.log("Chi'lly Chat LiveKit media migration proof passed.");
