import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import ts from "typescript";

import {
  buildBlockedChillyChatCallDispatch,
  buildChillyChatCallPresentationCopy,
  buildChillyChatNativeActionData,
  createChillyChatCallChannelResult,
  resolveChillyChatCallPreferencePolicy,
  resolveChillyChatIncomingPushTtlSeconds,
  resolveChillyChatOrdinaryPushFallbackPolicy,
  summarizeChillyChatCallDispatch,
} from "../supabase/functions/_shared/chilly-chat-call-dispatch-policy.mjs";
import {
  IOS_NOTIFICATION_CATEGORIES,
  buildPlatformExpoPushMessage,
} from "../supabase/functions/_shared/notification-payload.mjs";
import {
  buildIosVoipApnsPayload,
  isApnsInvalidVoipTokenReason,
} from "../supabase/functions/_shared/ios-voip-policy.mjs";
import {
  canAttemptNativeCallBackgroundAudio,
  completeIosAcceptedNativeAnswer,
  doesIosAcceptedCallKitMediaDescriptorOwnSession,
  doesNativeCallActionOwnTransition,
  resolveLegacyChatSessionRecovery,
  resolveChatThreadCallReconciliation,
  resolveAcceptedChatCallRoomId,
  resolveChillyChatCallParticipantRole,
  resolveIncomingCallPresentation,
  resolveIncomingCallRoomJoinAction,
  resolveIosChatCallAudioRoute,
  setActiveCommunicationTracksEnabled,
  shouldApplyAuthoritativeChatCallCleanup,
  shouldActivateAcceptedChatCallMedia,
  shouldKeepAcceptedChatCallPanelOpen,
  shouldPreserveNativeCallBackgroundAudio,
  shouldShowOutgoingRingingPanel,
} from "../_lib/communicationCallMediaPolicy.mjs";

const pushTtlNowMs = Date.parse("2026-09-18T03:54:00.000Z");
assert.equal(
  resolveChillyChatIncomingPushTtlSeconds("2026-09-18T03:55:30.000Z", pushTtlNowMs),
  90,
  "an incoming FCM delivery may use the full authoritative 90-second ringing window",
);
assert.equal(
  resolveChillyChatIncomingPushTtlSeconds("2026-09-18T03:54:27.250Z", pushTtlNowMs),
  28,
  "FCM delivery lifetime is bound to the exact remaining invite authority",
);
assert.equal(
  resolveChillyChatIncomingPushTtlSeconds("2026-09-18T03:53:59.000Z", pushTtlNowMs),
  1,
  "an expired invite cannot receive a renewed provider delivery lifetime",
);
assert.equal(
  resolveChillyChatIncomingPushTtlSeconds("invalid", pushTtlNowMs),
  1,
  "malformed expiry fails closed to the minimum provider lifetime",
);

const acceptedAfterRingingDeadline = {
  inviteExpiresAt: "2026-08-30T07:47:20.422579Z",
  inviteStatus: "accepted",
  nowMs: Date.parse("2026-08-30T07:50:00.000Z"),
  roomState: "active",
};
assert.equal(
  resolveChatThreadCallReconciliation(acceptedAfterRingingDeadline),
  "preserve",
  "an accepted call remains live after its ringing deadline while the room is active",
);
assert.equal(
  resolveChatThreadCallReconciliation({...acceptedAfterRingingDeadline, roomState: "inactive"}),
  "authoritative_cleanup",
  "an accepted call with an inactive room is sent to authoritative cleanup",
);
assert.equal(
  resolveChatThreadCallReconciliation({...acceptedAfterRingingDeadline, roomState: "unavailable"}),
  "defer",
  "a transient room read failure cannot erase accepted-call state",
);
assert.equal(
  resolveChatThreadCallReconciliation({
    inviteExpiresAt: "2026-08-30T07:47:20.422579Z",
    inviteStatus: "ringing",
    nowMs: Date.parse("2026-08-30T07:47:21.000Z"),
    roomState: "active",
  }),
  "authoritative_cleanup",
  "ringing expiry remains authoritative only before acceptance",
);
assert.equal(
  shouldApplyAuthoritativeChatCallCleanup({cleared: false, reason: "active_invite"}),
  false,
  "an authoritative active-invite result preserves the local call projection",
);
assert.equal(
  shouldApplyAuthoritativeChatCallCleanup({cleared: false, reason: "room_still_active"}),
  false,
  "an authoritative fresh-room result preserves the local call projection",
);
assert.equal(
  shouldApplyAuthoritativeChatCallCleanup({cleared: true, reason: "terminal_or_inactive"}),
  true,
  "a confirmed authoritative cleanup clears the local call projection",
);
assert.equal(
  shouldApplyAuthoritativeChatCallCleanup({cleared: false, reason: "already_clear"}),
  true,
  "an already-cleared authoritative projection clears the stale local copy",
);

for (const [trigger, delayMs] of [
  ["app_foreground", 0],
  ["peer_failed", 0],
  ["peer_disconnected", 2500],
  ["realtime_closed", 0],
  ["realtime_error", 1500],
  ["realtime_timeout", 1500],
]) {
  assert.deepEqual(resolveLegacyChatSessionRecovery({
    alreadyRequested: false,
    appState: "active",
    enabled: true,
    ending: false,
    generationIsCurrent: true,
    trigger,
  }), {delayMs, trigger}, `${trigger} rebuilds the exact accepted legacy session within a bounded delay`);
}
for (const denied of [
  {alreadyRequested: true, appState: "active", enabled: true, ending: false, generationIsCurrent: true, trigger: "peer_failed"},
  {alreadyRequested: false, appState: "background", enabled: true, ending: false, generationIsCurrent: true, trigger: "peer_failed"},
  {alreadyRequested: false, appState: "active", enabled: false, ending: false, generationIsCurrent: true, trigger: "peer_failed"},
  {alreadyRequested: false, appState: "active", enabled: true, ending: true, generationIsCurrent: true, trigger: "peer_failed"},
  {alreadyRequested: false, appState: "active", enabled: true, ending: false, generationIsCurrent: false, trigger: "peer_failed"},
  {alreadyRequested: false, appState: "active", enabled: true, ending: false, generationIsCurrent: true, trigger: "unknown"},
]) assert.equal(resolveLegacyChatSessionRecovery(denied), null, "legacy recovery remains chat-only, current-generation, one-shot, and terminal-safe");
import {
  createChillyChatNativeCallRouteBuffer,
  redirectChillyChatNativeCallSystemPath,
  resolveAuthoritativeNativeCallDecline,
  resolveChillyChatNativeCallActionPayload,
  resolveChillyChatNativeCallRoute,
} from "../_lib/chillyChatNativeCallRoutes.mjs";
import {
  consumeMountedIosNativeCallRoute,
  createIosCallKitAnswerRouteHandler,
  createNativeCallTransitionProvenanceRegistry,
} from "../_lib/nativeCallTransitionProvenance.mjs";
import {
  isPermanentFcmTokenError,
  readFcmProviderErrorCode,
} from "../supabase/functions/_shared/fcm-error-policy.mjs";

const nativeRouteThreadId = "11111111-1111-4111-8111-111111111111";
const nativeRouteInviteId = "22222222-2222-4222-8222-222222222222";
const nativeRouteUserId = "77777777-7777-4777-8777-777777777777";
assert.deepEqual(
  resolveChillyChatNativeCallRoute(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer&openCall=1`,
  ),
  {
    destination: `/chat/${nativeRouteThreadId}`,
    requestKey: `navigation:${nativeRouteThreadId}`,
    threadId: nativeRouteThreadId,
  },
  "an external Android Answer-shaped URL is reduced to navigation-only state",
);
assert.deepEqual(
  resolveChillyChatNativeCallRoute(
    `chillywoodmobile:///chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=decline`,
  ),
  {
    destination: `/chat/${nativeRouteThreadId}`,
    requestKey: `navigation:${nativeRouteThreadId}`,
    threadId: nativeRouteThreadId,
  },
  "an external Android Decline-shaped URL is reduced to navigation-only state",
);
assert.deepEqual(
  resolveChillyChatNativeCallRoute(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=incoming`,
  ),
  {
    destination: `/chat/${nativeRouteThreadId}`,
    requestKey: `navigation:${nativeRouteThreadId}`,
    threadId: nativeRouteThreadId,
  },
  "ordinary notification opens remain navigation-only",
);
assert.equal(
  resolveChillyChatNativeCallRoute(
    `https://example.invalid/chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer`,
  ),
  null,
  "untrusted schemes cannot claim native call transitions",
);
assert.equal(
  resolveChillyChatNativeCallRoute(
    "chillywoodmobile://chat/not-a-thread?callInviteId=not-an-invite&nativeCallAction=answer",
  ),
  null,
  "malformed call identities cannot be replayed",
);
assert.equal(
  resolveChillyChatNativeCallRoute(
    `chillywoodmobile://chat/${nativeRouteThreadId}/extra?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer`,
  ),
  null,
  "native call replay rejects paths outside the exact direct-thread route",
);
assert.equal(
  resolveChillyChatNativeCallRoute(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer#unexpected`,
  ),
  null,
  "native call replay rejects fragment-bearing action URLs",
);
assert.deepEqual(
  resolveChillyChatNativeCallActionPayload({
    callInviteId: nativeRouteInviteId.toUpperCase(),
    captureGeneration: 7,
    createdAt: 1_722_000_000_000,
    nativeCallAction: "ANSWER",
    requestKey: "a".repeat(64),
    schemaVersion: 2,
    threadId: nativeRouteThreadId.toUpperCase(),
  }),
  {
    callInviteId: nativeRouteInviteId,
    captureGeneration: 7,
    createdAt: 1_722_000_000_000,
    nativeCallAction: "answer",
    requestKey: "a".repeat(64),
    schemaVersion: 2,
    threadId: nativeRouteThreadId,
  },
  "the schema-v2 one-time native-store payload is independently normalized before provenance creation",
);
assert.equal(
  resolveChillyChatNativeCallActionPayload({
    callInviteId: nativeRouteInviteId,
    captureGeneration: 8,
    createdAt: 1_722_000_000_000,
    nativeCallAction: "incoming",
    requestKey: "b".repeat(64),
    schemaVersion: 2,
    threadId: nativeRouteThreadId,
  }),
  null,
  "the one-time native store cannot elevate an ordinary incoming-open action",
);
assert.equal(
  resolveChillyChatNativeCallActionPayload({
    access_token: "forbidden",
    callInviteId: nativeRouteInviteId,
    captureGeneration: 9,
    createdAt: 1_722_000_000_000,
    nativeCallAction: "answer",
    requestKey: "c".repeat(64),
    schemaVersion: 2,
    threadId: "not-a-thread",
  }),
  null,
  "malformed native-store identities are rejected without inspecting credential-shaped fields",
);
assert.equal(
  resolveChillyChatNativeCallActionPayload({
    callInviteId: nativeRouteInviteId,
    captureGeneration: 10,
    createdAt: 1_722_000_000_000,
    nativeCallAction: "decline",
    requestKey: "not-a-hash",
    schemaVersion: 2,
    threadId: nativeRouteThreadId,
  }),
  null,
  "native-store payloads require the bounded native request-key hash contract",
);
const authoritativeDeclinedInvite = {
  calleeUserId: nativeRouteUserId,
  callerUserId: "88888888-8888-4888-8888-888888888888",
  id: nativeRouteInviteId,
  status: "declined",
  threadId: nativeRouteThreadId,
};
assert.equal(
  resolveAuthoritativeNativeCallDecline({
    currentUserId: nativeRouteUserId,
    expectedInviteId: nativeRouteInviteId,
    expectedThreadId: nativeRouteThreadId,
    invite: authoritativeDeclinedInvite,
  }),
  authoritativeDeclinedInvite,
  "a server-confirmed exact-callee Decline may clear the incoming-call surface",
);
for (const deniedInvite of [
  null,
  {...authoritativeDeclinedInvite, status: "ringing"},
  {...authoritativeDeclinedInvite, status: "accepted"},
  {...authoritativeDeclinedInvite, status: "ended"},
  {...authoritativeDeclinedInvite, threadId: "99999999-9999-4999-8999-999999999999"},
  {...authoritativeDeclinedInvite, calleeUserId: "99999999-9999-4999-8999-999999999999"},
]) {
  assert.equal(
    resolveAuthoritativeNativeCallDecline({
      currentUserId: nativeRouteUserId,
      expectedInviteId: nativeRouteInviteId,
      expectedThreadId: nativeRouteThreadId,
      invite: deniedInvite,
    }),
    null,
    "a failed, raced, cross-thread, or wrong-user Decline must preserve call state",
  );
}
assert.equal(
  redirectChillyChatNativeCallSystemPath(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer&openCall=1`,
  ),
  `/chat/${nativeRouteThreadId}`,
  "Expo Router strips authority-shaped parameters before caching an external route",
);
assert.equal(
  redirectChillyChatNativeCallSystemPath(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=decline`,
  ),
  `/chat/${nativeRouteThreadId}`,
  "Expo Router strips external Decline authority while retaining thread navigation",
);
assert.equal(
  redirectChillyChatNativeCallSystemPath("chillywoodmobile://settings"),
  "chillywoodmobile://settings",
  "native-intent normalization preserves unrelated system paths",
);
const earlyNativeCallRouteBuffer = createChillyChatNativeCallRouteBuffer();
const bufferedNativeCallRoutes = [];
assert.equal(
  earlyNativeCallRouteBuffer.capture("chillywoodmobile://settings"),
  false,
  "the early native-call buffer rejects unrelated system URLs",
);
assert.equal(
  earlyNativeCallRouteBuffer.capture(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer&openCall=1`,
  ),
  true,
  "a valid thread navigation arriving before the router bridge is retained without action authority",
);
const unsubscribeEarlyNativeCallRoutes = earlyNativeCallRouteBuffer.subscribe(
  (route) => bufferedNativeCallRoutes.push(route),
);
assert.deepEqual(
  bufferedNativeCallRoutes,
  [{
    destination: `/chat/${nativeRouteThreadId}`,
    requestKey: `navigation:${nativeRouteThreadId}`,
    threadId: nativeRouteThreadId,
  }],
  "the router bridge receives only the retained navigation target",
);
assert.equal(
  earlyNativeCallRouteBuffer.capture(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=decline`,
  ),
  true,
  "a live Decline-shaped URL reaches the mounted bridge as navigation only",
);
assert.equal(
  bufferedNativeCallRoutes.at(-1)?.requestKey,
  `navigation:${nativeRouteThreadId}`,
  "the mounted bridge receives no external action authority",
);
unsubscribeEarlyNativeCallRoutes();
assert.equal(
  readFcmProviderErrorCode({
    body: {
      error: {
        status: "NOT_FOUND",
        details: [{
          "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
          errorCode: "UNREGISTERED",
        }],
      },
    },
    httpStatus: 404,
    responseOk: false,
  }),
  "UNREGISTERED",
  "FCM token invalidation uses the provider-specific nested reason rather than generic HTTP NOT_FOUND",
);
assert.equal(
  readFcmProviderErrorCode({
    body: {
      error: {
        status: "PERMISSION_DENIED",
        details: [{
          "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
          error_code: "SENDER_ID_MISMATCH",
        }],
      },
    },
    httpStatus: 403,
    responseOk: false,
  }),
  "SENDER_ID_MISMATCH",
  "FCM snake-case provider details remain compatible",
);
assert.equal(
  readFcmProviderErrorCode({
    body: { error: { status: "UNAVAILABLE" } },
    httpStatus: 503,
    responseOk: false,
  }),
  "UNAVAILABLE",
  "transient FCM failures retain their top-level retryable reason",
);
assert.equal(isPermanentFcmTokenError("UNREGISTERED"), true, "unregistered FCM tokens are revoked");
assert.equal(isPermanentFcmTokenError("SENDER_ID_MISMATCH"), true, "wrong-sender FCM tokens are revoked");
assert.equal(isPermanentFcmTokenError("NOT_FOUND"), false, "generic NOT_FOUND cannot revoke a token without FCM detail");
assert.equal(isPermanentFcmTokenError("UNAVAILABLE"), false, "transient FCM failures never revoke tokens");

const root = new URL("../", import.meta.url);
const importTranspiledTypeScript = async (relativePath) => {
  const source = await readFile(new URL(relativePath, root), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
};
const schema = await importTranspiledTypeScript("_lib/chillyChatCallDispatchSchema.ts");
const deliveryCopy = await importTranspiledTypeScript("_lib/chillyChatCallDeliveryCopy.ts");
const visibleReadGate = await importTranspiledTypeScript("_lib/boundedVisibleReadGate.ts");
const liveKitBootstrapCompat = await importTranspiledTypeScript("_lib/livekit/react-native-bootstrap-compat.ts");
const chatCallTelemetryBindingPolicy = await importTranspiledTypeScript("_lib/chatCallTelemetryBindingPolicy.ts");

const emptyChannels = () => ({
  androidNative: createChillyChatCallChannelResult(),
  iosVoip: createChillyChatCallChannelResult(),
  ordinaryPush: createChillyChatCallChannelResult(),
  inAppNotification: createChillyChatCallChannelResult(),
});

const preservedNativeAudioLifecycleMethod = () => "preserved";
const legacyWebRtcModule = {
  audioDeviceModuleSetEngineCreatedActive: preservedNativeAudioLifecycleMethod,
};
const installedLegacyAudioLifecycleShims =
  liveKitBootstrapCompat.installLegacyWebRtcAudioLifecycleShims(legacyWebRtcModule);
assert.equal(
  legacyWebRtcModule.audioDeviceModuleSetEngineCreatedActive,
  preservedNativeAudioLifecycleMethod,
  "the compatibility layer preserves lifecycle methods supplied by the installed native binary",
);
assert.equal(
  installedLegacyAudioLifecycleShims.length,
  liveKitBootstrapCompat.WEBRTC_AUDIO_LIFECYCLE_ACTIVE_METHODS.length - 1,
  "the compatibility layer installs only lifecycle methods absent from the installed native binary",
);
for (const method of liveKitBootstrapCompat.WEBRTC_AUDIO_LIFECYCLE_ACTIVE_METHODS) {
  assert.equal(typeof legacyWebRtcModule[method], "function", `${method} is callable after compatibility setup`);
}
const callKitAudioLifecycleCalls = [];
const callKitWebRtcModule = {
  audioSessionDidActivate() {
    callKitAudioLifecycleCalls.push("activated");
  },
  audioSessionDidDeactivate() {
    callKitAudioLifecycleCalls.push("deactivated");
  },
};
assert.equal(
  liveKitBootstrapCompat.notifyWebRtcAudioSessionLifecycle(callKitWebRtcModule, "activated"),
  true,
  "CallKit activation reaches the installed WebRTC audio session",
);
assert.equal(
  liveKitBootstrapCompat.notifyWebRtcAudioSessionLifecycle(callKitWebRtcModule, "deactivated"),
  true,
  "CallKit deactivation reaches the installed WebRTC audio session",
);
assert.deepEqual(callKitAudioLifecycleCalls, ["activated", "deactivated"]);
assert.equal(
  liveKitBootstrapCompat.notifyWebRtcAudioSessionLifecycle({}, "activated"),
  false,
  "an older binary without the WebRTC lifecycle method fails closed",
);
const navigatorIdentity = { product: "ReactNative" };
assert.equal(liveKitBootstrapCompat.ensureReactNativeNavigatorUserAgent(navigatorIdentity), true);
assert.equal(
  navigatorIdentity.userAgent,
  "ReactNative",
  "LiveKit browser detection receives a stable React Native user agent",
);
assert.equal(liveKitBootstrapCompat.ensureReactNativeNavigatorUserAgent(navigatorIdentity), false);
assert.equal(
  chatCallTelemetryBindingPolicy.sanitizeChatCallTelemetryBinding(
    "11111111-1111-4111-8111-111111111111",
    "uuid",
  ),
  "11111111-1111-4111-8111-111111111111",
  "the authenticated collector receives an exact canonical invite or thread UUID for one-way hashing",
);
assert.equal(
  chatCallTelemetryBindingPolicy.sanitizeChatCallTelemetryBinding("ab12cd", "room_code"),
  "AB12CD",
  "the authenticated collector receives the exact canonical communication room code for token-audit correlation",
);
for (const unsafeBinding of [
  "",
  "not-a-uuid",
  "11111111-1111-4111-8111-111111111111?signature=private",
  "11111111-1111-4111-8111-111111111111/extra",
]) {
  assert.equal(
    chatCallTelemetryBindingPolicy.sanitizeChatCallTelemetryBinding(unsafeBinding, "uuid"),
    "",
    "only a bare UUID may cross the exact Chat Call telemetry binding boundary",
  );
}
for (const unsafeRoomCode of ["ABCDE", "ABCDEFG", "AB-12C", "AB12CD?"]) {
  assert.equal(
    chatCallTelemetryBindingPolicy.sanitizeChatCallTelemetryBinding(unsafeRoomCode, "room_code"),
    "",
    "only the exact six-character product room code may cross the Chat Call telemetry binding boundary",
  );
}

const sent = (reason = "sent") => createChillyChatCallChannelResult({
  eligible: true,
  attempted: true,
  pushSent: true,
  sentCount: 1,
  reason,
  status: "sent",
});
const presented = (reason = "presented") => createChillyChatCallChannelResult({
  eligible: true,
  attempted: true,
  presentationAcknowledged: true,
  pushSent: true,
  sentCount: 1,
  reason,
  status: "sent",
});

const fixtureCases = [
  ["android_native_only", { androidNative: sent("fcm_sent") }, true, "sent"],
  ["ios_voip_presented", { iosVoip: presented("callkit_presented") }, true, "sent"],
  ["ios_voip_provider_accepted_unacknowledged", { iosVoip: sent("provider_accepted_unacknowledged") }, false, "skipped"],
  ["ordinary_push_only", { ordinaryPush: sent("expo_sent") }, true, "sent"],
  ["in_app_only", {
    inAppNotification: createChillyChatCallChannelResult({
      eligible: true,
      attempted: true,
      notificationCreated: true,
      reason: "notification_created",
      status: "created",
    }),
  }, false, "created"],
  ["multiple_channels", {
    androidNative: sent("fcm_sent"),
    iosVoip: presented("callkit_presented"),
    ordinaryPush: sent("expo_sent"),
  }, true, "sent"],
];

for (const [name, overrides, expectedPushSent, expectedStatus] of fixtureCases) {
  const response = summarizeChillyChatCallDispatch(true, { ...emptyChannels(), ...overrides });
  const parsed = schema.parseChillyChatCallDispatchResponse(response);
  assert.equal(parsed.result.pushSent, expectedPushSent, `${name}: pushSent`);
  assert.equal(parsed.result.status, expectedStatus, `${name}: status`);
  assert.deepEqual(Object.keys(parsed.channels).sort(), [
    "androidNative",
    "inAppNotification",
    "iosVoip",
    "ordinaryPush",
  ]);
}

const blocked = schema.parseChillyChatCallDispatchResponse(buildBlockedChillyChatCallDispatch("audience_block"));
assert.equal(blocked.eligible, false);
assert.equal(blocked.result.status, "blocked");
assert.equal(blocked.result.pushSent, false);

const providerFailureChannels = emptyChannels();
providerFailureChannels.androidNative = createChillyChatCallChannelResult({
  eligible: true,
  attempted: true,
  failedCount: 1,
  reason: "fcm_provider_failed",
  status: "failed",
});
providerFailureChannels.iosVoip = createChillyChatCallChannelResult({
  eligible: true,
  attempted: true,
  failedCount: 1,
  reason: "apns_provider_failed",
  status: "failed",
});
const providerFailure = schema.parseChillyChatCallDispatchResponse(
  summarizeChillyChatCallDispatch(true, providerFailureChannels),
);
assert.equal(providerFailure.result.status, "failed");
assert.equal(providerFailure.result.pushSent, false);

assert.throws(() => schema.parseChillyChatCallDispatchResponse({
  eligible: true,
  result: { ...providerFailure.result, channels: providerFailure.channels },
}), /dispatch_schema_channels_required/u);

const nativePreference = resolveChillyChatCallPreferencePolicy({
  action: "incoming",
  chillyChatCallsEnabled: true,
  inAppEnabled: false,
  pushEnabled: false,
});
assert.equal(nativePreference.iosVoip, true, "PushKit remains independent from ordinary push preference");
assert.equal(nativePreference.ordinaryPush, false);
assert.equal(resolveChillyChatCallPreferencePolicy({
  action: "incoming",
  chillyChatCallsEnabled: false,
  inAppEnabled: true,
  pushEnabled: true,
}).iosVoip, false, "call preference blocks native calls");

const terminalPreference = resolveChillyChatCallPreferencePolicy({
  action: "cancel",
  chillyChatCallsEnabled: false,
  inAppEnabled: false,
  pushEnabled: false,
});
assert.equal(terminalPreference.actionAllowed, true, "terminal cleanup remains eligible after new-call preference is disabled");
assert.equal(terminalPreference.iosVoip, false, "terminal cleanup cannot synthesize a second iPhone VoIP call");
assert.equal(terminalPreference.ordinaryPush, true, "terminal cleanup may close an existing Android/Expo call");
assert.equal(terminalPreference.inAppNotification, false, "terminal cleanup creates no new presentation");

const missedPreference = resolveChillyChatCallPreferencePolicy({
  action: "missed",
  chillyChatCallsEnabled: true,
  inAppEnabled: true,
  pushEnabled: false,
});
assert.equal(missedPreference.actionAllowed, true);
assert.equal(missedPreference.ordinaryPush, false, "missed ordinary alert respects ordinary-push preference");
assert.equal(resolveChillyChatCallPreferencePolicy({
  action: "missed",
  chillyChatCallsEnabled: false,
  inAppEnabled: true,
  pushEnabled: true,
}).actionAllowed, false, "missed alerts respect the new-call preference");

assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "incoming",
  androidNativeSent: true,
  iosRolloutEnabled: true,
  iosVoipPresented: true,
  iosVoipSent: true,
}), { android: false, ios: false }, "device-acknowledged native presentation suppresses duplicate ordinary incoming-call pushes");
assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "incoming",
  androidNativeSent: false,
  iosRolloutEnabled: true,
  iosVoipPresented: false,
  iosVoipSent: false,
}), { android: true, ios: true }, "each failed native incoming-call channel receives its own ordinary fallback");
assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "incoming",
  androidNativeSent: true,
  iosRolloutEnabled: true,
  iosVoipPresented: false,
  iosVoipSent: false,
}), { android: false, ios: true }, "Android success cannot suppress an iPhone fallback on another registered device");
assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "incoming",
  androidNativeSent: false,
  iosRolloutEnabled: true,
  iosVoipPresented: true,
  iosVoipSent: true,
}), { android: true, ios: false }, "iPhone success cannot suppress an Android fallback on another registered device");
assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "incoming",
  androidNativeSent: false,
  iosRolloutEnabled: false,
  iosVoipPresented: false,
  iosVoipSent: false,
}), { android: true, ios: false }, "disabled ordinary iOS rollout remains fail-closed");
assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "end",
  androidNativeSent: false,
  iosRolloutEnabled: true,
  iosVoipPresented: false,
  iosVoipSent: false,
}), { android: true, ios: false }, "terminal iOS state never synthesizes a new incoming call while Android retains cleanup fallback");
assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "incoming",
  androidNativeSent: true,
  iosRolloutEnabled: true,
  iosVoipPresented: false,
  iosVoipSent: true,
}), { android: false, ios: true }, "APNs HTTP acceptance without exact CallKit presentation acknowledgement must retain the ordinary iOS fallback");

const iosIncomingFallback = buildPlatformExpoPushMessage({
  badge: 1,
  body: "Caller is calling you on Chi'lly Chat.",
  categoryId: IOS_NOTIFICATION_CATEGORIES.incomingCall,
  data: { callInviteId: "invite", openCall: "true", path: "/chat/thread", threadId: "thread" },
  interruptionLevel: "time-sensitive",
  platform: "ios",
  sound: "default",
  title: "Incoming Chi'lly Chat voice call",
  to: "ExpoPushToken[fixture]",
  ttl: 45,
});
assert.equal(iosIncomingFallback.categoryId, "chillywood_incoming_call");
assert.equal(iosIncomingFallback.sound, "default");
assert.equal(iosIncomingFallback.interruptionLevel, "time-sensitive");
assert.equal(iosIncomingFallback.ttl, 45);

const tokenFixtures = [
  ["voip_token_only", { iosVoip: presented() }, "iosVoip"],
  ["expo_token_only", { ordinaryPush: sent() }, "ordinaryPush"],
  ["fcm_token_only", { androidNative: sent() }, "androidNative"],
  ["all_token_types", { androidNative: sent(), iosVoip: presented(), ordinaryPush: sent() }, "iosVoip"],
  ["no_tokens", {}, null],
];
for (const [name, overrides, expectedSentChannel] of tokenFixtures) {
  const response = summarizeChillyChatCallDispatch(true, { ...emptyChannels(), ...overrides });
  assert.equal(response.result.pushSent, expectedSentChannel !== null, name);
  if (expectedSentChannel) assert.equal(response.channels[expectedSentChannel].pushSent, true, name);
}

assert.equal(isApnsInvalidVoipTokenReason("BadDeviceToken"), true);
assert.equal(isApnsInvalidVoipTokenReason("DeviceTokenNotForTopic"), true);
assert.equal(isApnsInvalidVoipTokenReason("Unregistered"), true);

assert.equal(canAttemptNativeCallBackgroundAudio({
  appState: "background",
  allowBackgroundAudio: true,
  micRequested: true,
}), true, "an answered native iOS call may bootstrap audio while the app stays backgrounded");
assert.equal(shouldPreserveNativeCallBackgroundAudio({
  appState: "inactive",
  allowBackgroundAudio: true,
  micRequested: true,
  hasUsableAudioTrack: true,
}), true, "a transient CallKit overlay must not tear down an active native-call microphone");
assert.equal(shouldPreserveNativeCallBackgroundAudio({
  appState: "background",
  allowBackgroundAudio: false,
  micRequested: true,
  hasUsableAudioTrack: true,
}), false, "ordinary communication rooms retain the existing background media shutdown policy");
assert.equal(canAttemptNativeCallBackgroundAudio({
  appState: "background",
  allowBackgroundAudio: true,
  micRequested: false,
}), false, "muted calls do not restart background audio");

const liveAudioTrack = { enabled: true, readyState: "live" };
const endedAudioTrack = { enabled: true, readyState: "ended" };
assert.equal(setActiveCommunicationTracksEnabled([liveAudioTrack, endedAudioTrack], false), 1);
assert.equal(liveAudioTrack.enabled, false, "mute disables the live track without stopping it");
assert.equal(endedAudioTrack.enabled, true, "mute does not mutate an ended sender track");
assert.equal(setActiveCommunicationTracksEnabled([liveAudioTrack], true), 1);
assert.equal(liveAudioTrack.enabled, true, "unmute re-enables the negotiated track in place");

const liveVideoTrack = { enabled: true, readyState: "live" };
const endedVideoTrack = { enabled: true, readyState: "ended" };
assert.equal(setActiveCommunicationTracksEnabled([liveVideoTrack, endedVideoTrack], false), 1);
assert.equal(liveVideoTrack.enabled, false, "camera off disables the live track without stopping it");
assert.equal(endedVideoTrack.enabled, true, "camera off does not mutate an ended sender track");
assert.equal(setActiveCommunicationTracksEnabled([liveVideoTrack], true), 1);
assert.equal(liveVideoTrack.enabled, true, "camera on re-enables the negotiated track in place");

assert.equal(resolveIncomingCallRoomJoinAction({
  currentUserIsRoomHost: false,
  inviteBelongsToCurrentCallee: true,
  inviteStatus: "ringing",
}), "accept", "a callee must accept before joining media");
assert.equal(resolveIncomingCallRoomJoinAction({
  currentUserIsRoomHost: false,
  inviteBelongsToCurrentCallee: true,
  inviteStatus: "accepted",
}), "resume", "an accepted callee may resume media");
assert.equal(resolveIncomingCallRoomJoinAction({
  currentUserIsRoomHost: false,
  inviteBelongsToCurrentCallee: false,
  inviteStatus: "ringing",
}), "blocked", "missing or mismatched invite evidence cannot open callee media");
for (const nativeCallAction of ["answer", "decline", "end", "mute", "unmute"]) {
  assert.equal(doesNativeCallActionOwnTransition({
    callInviteId: nativeRouteInviteId,
    nativeCallAction,
  }), false, `${nativeCallAction}: route values alone never own a native transition`);
}
const semanticsRegistry = createNativeCallTransitionProvenanceRegistry({claimIdFactory: () => "a".repeat(64), now: () => 100});
const semanticsCreation = semanticsRegistry.create({action: "answer", authenticatedUserId: nativeRouteUserId, inviteId: nativeRouteInviteId, nativeEventGeneration: 1, nativeIdentity: "33333333-3333-4333-8333-333333333333", platform: "ios", source: "ios_callkit_native_event", threadId: nativeRouteThreadId});
const consumedIosAnswerClaim = semanticsRegistry.consume({action: "answer", authenticatedUserId: nativeRouteUserId, claimId: semanticsCreation.claimId, inviteId: nativeRouteInviteId, nativeIdentity: semanticsCreation.nativeIdentity, platform: "ios", source: "ios_callkit_native_event", threadId: nativeRouteThreadId});
assert.ok(consumedIosAnswerClaim, "semantics proof creates a structurally valid test-registry claim");
assert.equal(doesNativeCallActionOwnTransition({
  authority: "trusted_native_claim",
  callInviteId: nativeRouteInviteId,
  currentUserId: nativeRouteUserId,
  monotonicNowMs: 100,
  nativeCallAction: "answer",
  nativeIdentity: consumedIosAnswerClaim.nativeIdentity,
  platform: "ios",
  threadId: nativeRouteThreadId,
  trustedNativeClaim: consumedIosAnswerClaim,
}), false, "an exported test registry cannot manufacture production native-transition attestation");
let acceptedPolicyDestination = "";
const acceptedPolicyCallUuid = "33333333-3333-4333-8333-444444444444";
const acceptedPolicyRouteHandler = createIosCallKitAnswerRouteHandler({
  completeAnswerFailure: async () => undefined,
  getAuthenticatedUserId: () => nativeRouteUserId,
  isActive: () => true,
  replace: (destination) => { acceptedPolicyDestination = destination; },
});
assert.equal(await acceptedPolicyRouteHandler({
  callInviteId: nativeRouteInviteId,
  callType: "video",
  callUuid: acceptedPolicyCallUuid,
  nativeEventGeneration: 7,
  platform: "ios",
  threadId: nativeRouteThreadId,
  type: "answerRequested",
}), "routed", "the native Answer creates an attested route for accepted-media policy proof");
const acceptedPolicyUrl = new URL(acceptedPolicyDestination, "https://chillywood.invalid");
const acceptedPolicyClaim = consumeMountedIosNativeCallRoute({
  action: "answer",
  authenticatedUserId: nativeRouteUserId,
  authLoading: false,
  callUuid: acceptedPolicyCallUuid,
  claimId: acceptedPolicyUrl.searchParams.get("nativeCallClaim"),
  inviteId: nativeRouteInviteId,
  isSignedIn: true,
  platform: "ios",
  threadId: nativeRouteThreadId,
});
assert.ok(acceptedPolicyClaim, "accepted-media policy proof consumes the exact native Answer claim");
const acceptedPolicyInvite = {
  callType: "video",
  calleeUserId: nativeRouteUserId,
  callerUserId: "88888888-8888-4888-8888-888888888888",
  communicationRoomId: "ROOM-ACCEPTED-POLICY",
  id: nativeRouteInviteId,
  mediaProvider: "livekit",
  status: "accepted",
  threadId: nativeRouteThreadId,
};
const acceptedPolicyCompletion = await completeIosAcceptedNativeAnswer({
  authenticatedUserId: nativeRouteUserId,
  callUuid: acceptedPolicyCallUuid,
  invite: acceptedPolicyInvite,
  serverAccepted: true,
  threadId: nativeRouteThreadId,
  trustedNativeClaim: acceptedPolicyClaim,
}, {
  completeNative: async () => true,
  monotonicNow: () => globalThis.performance.now(),
  terminal: {
    delay: async () => undefined,
    endNative: async () => true,
    readInvite: async () => acceptedPolicyInvite,
    updateInvite: async () => ({...acceptedPolicyInvite, status: "ended"}),
  },
});
assert.equal(acceptedPolicyCompletion.status, "ready");
const acceptedDescriptorAuthority = {
  authenticatedUserId: nativeRouteUserId,
  descriptor: acceptedPolicyCompletion.descriptor,
  inviteId: nativeRouteInviteId,
  inviteStatus: "accepted",
  mediaProvider: "livekit",
  roomId: acceptedPolicyInvite.communicationRoomId,
  threadId: nativeRouteThreadId,
};
assert.equal(
  doesIosAcceptedCallKitMediaDescriptorOwnSession(acceptedDescriptorAuthority),
  true,
  "the exact active accepted-CallKit descriptor owns only its server-accepted media session",
);
for (const mismatch of [
  {authenticatedUserId: "99999999-9999-4999-8999-999999999999"},
  {inviteId: "99999999-9999-4999-8999-999999999999"},
  {inviteStatus: "ended"},
  {mediaProvider: "legacy_webrtc"},
  {roomId: "ROOM-OTHER"},
  {threadId: "99999999-9999-4999-8999-999999999999"},
]) {
  assert.equal(
    doesIosAcceptedCallKitMediaDescriptorOwnSession({...acceptedDescriptorAuthority, ...mismatch}),
    false,
    "accepted-CallKit descriptor authority fails closed for every exact-session mismatch",
  );
}
assert.equal(
  doesIosAcceptedCallKitMediaDescriptorOwnSession({
    ...acceptedDescriptorAuthority,
    descriptor: Object.freeze({...acceptedPolicyCompletion.descriptor}),
  }),
  false,
  "a structurally copied descriptor cannot manufacture accepted CallKit media authority",
);
assert.equal(doesNativeCallActionOwnTransition({
  callInviteId: "",
  nativeCallAction: "answer",
}), false, "an unscoped native action cannot suppress compatibility routing");
assert.equal(doesNativeCallActionOwnTransition({
  callInviteId: "INVITE-ID",
  nativeCallAction: "open",
}), false, "openCall compatibility is not an authoritative native transition");
assert.equal(resolveIosChatCallAudioRoute("video"), "speaker", "iOS video calls default to speaker");
assert.equal(resolveIosChatCallAudioRoute("voice"), "receiver", "iOS voice calls default to receiver");
assert.equal(shouldActivateAcceptedChatCallMedia({
  roomId: "CALLROOM",
  inviteStatus: "ringing",
}), false, "the caller must not start camera, microphone, or signaling while the receiver is still ringing");
assert.equal(shouldActivateAcceptedChatCallMedia({
  roomId: "CALLROOM",
  inviteStatus: "accepted",
}), true, "both participants may activate media only after the durable accept transition");
assert.equal(shouldActivateAcceptedChatCallMedia({
  roomId: "",
  inviteStatus: "accepted",
}), false, "accepted state without an exact room cannot activate media");
assert.equal(resolveAcceptedChatCallRoomId({
  inviteRoomId: "ACCEPTED-ROOM",
  inviteStatus: "accepted",
  threadRoomId: "",
}), "ACCEPTED-ROOM", "an accepted invite keeps its immutable room through a stale empty thread refresh");
assert.equal(resolveAcceptedChatCallRoomId({
  inviteRoomId: "RINGING-ROOM",
  inviteStatus: "ringing",
  threadRoomId: "THREAD-ROOM",
}), "THREAD-ROOM", "an unaccepted invite cannot override the thread room");
assert.equal(shouldKeepAcceptedChatCallPanelOpen({
  inviteRoomId: "ACCEPTED-ROOM",
  inviteStatus: "accepted",
  threadRoomId: "",
  wasOpen: true,
}), true, "a stale empty thread refresh cannot unmount an accepted call panel");
assert.equal(shouldKeepAcceptedChatCallPanelOpen({
  inviteRoomId: "",
  inviteStatus: null,
  threadRoomId: "",
  wasOpen: true,
}), false, "a call panel closes when neither accepted-invite nor thread room authority remains");

assert.equal(resolveChillyChatCallParticipantRole({
  currentUserId: "caller",
  callerUserId: "caller",
  calleeUserId: "callee",
}), "caller");
assert.equal(resolveChillyChatCallParticipantRole({
  currentUserId: "callee",
  callerUserId: "caller",
  calleeUserId: "callee",
}), "callee");
assert.equal(resolveChillyChatCallParticipantRole({
  currentUserId: "other",
  callerUserId: "caller",
  calleeUserId: "callee",
}), "none");
assert.equal(shouldShowOutgoingRingingPanel({
  currentUserId: "callee",
  callerUserId: "caller",
  calleeUserId: "callee",
  inviteStatus: "ringing",
}), false, "a callee can never receive the caller waiting panel");
assert.equal(shouldShowOutgoingRingingPanel({
  currentUserId: "caller",
  callerUserId: "caller",
  calleeUserId: "callee",
  inviteStatus: "ringing",
}), true, "only the durable caller receives the outgoing ringing panel");
assert.equal(resolveIncomingCallPresentation({ appState: "active", alreadyOnSameThread: false }), "app_banner");
assert.equal(resolveIncomingCallPresentation({ appState: "active", alreadyOnSameThread: true }), "thread_banner");
assert.equal(resolveIncomingCallPresentation({ appState: "background", alreadyOnSameThread: false }), "native_background");
assert.equal(resolveIncomingCallPresentation({ appState: "inactive", alreadyOnSameThread: true }), "native_background");
assert.equal(resolveIncomingCallPresentation({
  appState: "active",
  alreadyOnSameThread: false,
  nativeCallPresentationOwned: true,
}), "app_banner", "an exact CallKit record cannot suppress the visible app-wide banner while Chi'llywood is foregrounded elsewhere");
assert.equal(resolveIncomingCallPresentation({
  appState: "active",
  alreadyOnSameThread: true,
  nativeCallPresentationOwned: true,
}), "thread_banner", "an exact CallKit record cannot suppress the visible same-thread banner while Chi'llywood is foregrounded");
assert.equal(resolveIncomingCallPresentation({
  appState: "background",
  alreadyOnSameThread: false,
  nativeCallPresentationOwned: true,
}), "native_ios", "an exact CallKit record continues to own background and terminated presentation");

const actionScope = {
  callInviteId: "11111111-1111-4111-8111-111111111111",
  callType: "video",
  callerName: "Caller",
  expiresAt: "2026-07-16T12:00:00.000Z",
  notificationChannelId: "chilly_chat_calls_fullscreen_v1",
  notificationId: "notification-id",
  path: "/chat/22222222-2222-4222-8222-222222222222",
  presentationAckToken: "A".repeat(43),
  presentationAckUrl: "https://example.supabase.co/functions/v1/ios-voip-call-dispatch",
  presentationAttemptId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  recipientAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  recipientInstallId: "install-authority-1",
  recipientSessionGeneration: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  recipientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  threadId: "22222222-2222-4222-8222-222222222222",
};

assert.match(buildChillyChatCallPresentationCopy({ ...actionScope, action: "incoming" }).title, /^Incoming/u);
assert.match(buildChillyChatCallPresentationCopy({ ...actionScope, action: "missed" }).title, /^Missed/u);
const incomingNativeData = buildChillyChatNativeActionData({ ...actionScope, action: "incoming" });
assert.equal(incomingNativeData.triggerType, "chilly_chat_call");
assert.equal(incomingNativeData.notificationType, "chilly_chat_call");
const incomingVoipData = buildIosVoipApnsPayload({ ...actionScope, action: "incoming" });
assert.equal(incomingVoipData.action, "incoming");
assert.equal(incomingVoipData.callUuid, actionScope.callInviteId);
assert.equal(incomingVoipData.callInviteId, actionScope.callInviteId);
assert.equal(incomingVoipData.threadId, actionScope.threadId);
assert.equal(incomingVoipData.expiresAt, actionScope.expiresAt);
assert.equal(incomingVoipData.callType, actionScope.callType);
assert.equal(incomingVoipData.recipientAccountId, actionScope.recipientAccountId);
assert.equal(incomingVoipData.recipientInstallId, actionScope.recipientInstallId);
assert.equal(incomingVoipData.recipientSessionGeneration, actionScope.recipientSessionGeneration);
assert.equal(incomingVoipData.recipientUserId, actionScope.recipientUserId);
assert.equal(incomingVoipData.presentationAckToken, actionScope.presentationAckToken);
assert.equal(incomingVoipData.presentationAckUrl, actionScope.presentationAckUrl);
assert.equal(incomingVoipData.presentationAttemptId, actionScope.presentationAttemptId);

for (const action of ["cancel", "declined", "end", "timeout"]) {
  const androidData = buildChillyChatNativeActionData({ ...actionScope, action });
  assert.equal(androidData.action, action);
  assert.equal(androidData.callUuid, actionScope.callInviteId);
  assert.equal(androidData.callInviteId, actionScope.callInviteId);
  assert.equal(androidData.threadId, actionScope.threadId);
  assert.equal(androidData.expiresAt, actionScope.expiresAt);
  assert.equal(androidData.callType, actionScope.callType);
  assert.throws(
    () => buildIosVoipApnsPayload({ ...actionScope, action }),
    /non_incoming_voip_payload_denied/u,
    `${action}: PushKit must not carry terminal lifecycle state`,
  );
  assert.equal("title" in androidData, false, `${action}: terminal title forbidden`);
  assert.equal("body" in androidData, false, `${action}: terminal body forbidden`);
  assert.equal("notificationCategory" in androidData, false, `${action}: terminal category forbidden`);
  assert.equal(androidData.nativeCallStyle, "terminal");
}

const dispatchSource = await readFile(new URL("supabase/functions/chilly-chat-call-dispatch/index.ts", root), "utf8");
const voipSource = await readFile(new URL("supabase/functions/ios-voip-call-dispatch/index.ts", root), "utf8");
const notificationsSource = await readFile(new URL("_lib/notifications.ts", root), "utf8");
const nativeCoordinatorSource = await readFile(
  new URL("modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift", root),
  "utf8",
);
const chatThreadSource = await readFile(new URL("app/chat/[threadId].tsx", root), "utf8");
const rootLayoutSource = await readFile(new URL("app/_layout.tsx", root), "utf8");
const chatLibSource = await readFile(new URL("_lib/chat.ts", root), "utf8");
const chillyChatCallsSource = await readFile(new URL("_lib/chillyChatCalls.ts", root), "utf8");
const communicationLibSource = await readFile(new URL("_lib/communication.ts", root), "utf8");
const authoritativeBusyBeginSource = await readFile(
  new URL("supabase/migrations/20260730040727_chilly_chat_busy_active_thread_guard.sql", root),
  "utf8",
);
const iosNativeCallsSource = await readFile(new URL("_lib/iosNativeCalls.ts", root), "utf8");
const liveKitBootstrapSource = await readFile(new URL("_lib/livekit/bootstrap.ts", root), "utf8");
const communicationSessionSource = await readFile(new URL("hooks/use-communication-room-session.ts", root), "utf8");
const chatCallMediaProviderSource = await readFile(
  new URL("hooks/use-chat-call-media-session.ts", root),
  "utf8",
);
const liveKitChatCallSessionSource = await readFile(
  new URL("hooks/use-livekit-chat-call-session.ts", root),
  "utf8",
);
const inRoomPanelSource = await readFile(
  new URL("components/communication/in-room-communication-panel.tsx", root),
  "utf8",
);
const communicationControlBarSource = await readFile(
  new URL("components/communication/communication-control-bar.tsx", root),
  "utf8",
);
const communicationParticipantGridSource = await readFile(
  new URL("components/communication/communication-participant-grid.tsx", root),
  "utf8",
);
const retryWorkerSource = await readFile(
  new URL("supabase/functions/chilly-chat-call-transition-retry/index.ts", root),
  "utf8",
);
const iosVoipDispatchSource = await readFile(
  new URL("supabase/functions/ios-voip-call-dispatch/index.ts", root),
  "utf8",
);
const retryMigrationSource = await readFile(
  new URL("supabase/migrations/20260718113000_durable_call_delivery_retry_and_storefront_prices.sql", root),
  "utf8",
);
const expiryMigrationSource = await readFile(
  new URL("supabase/migrations/20260719213953_expire_stale_chilly_chat_calls.sql", root),
  "utf8",
);
const atomicCallBeginMigrationSource = await readFile(
  new URL("supabase/migrations/20260719220000_atomic_chilly_chat_call_begin.sql", root),
  "utf8",
);
const terminalCleanupMigrationSource = await readFile(
  new URL("supabase/migrations/20260728172910_chilly_chat_terminal_product_state_cleanup.sql", root),
  "utf8",
);
const terminalMembershipRaceGuardMigrationSource = await readFile(
  new URL("supabase/migrations/20260729020612_chilly_chat_terminal_membership_race_guard.sql", root),
  "utf8",
);
assert.ok(dispatchSource.indexOf("const iosVoipPromise = invokeIosVoipDispatch") < dispatchSource.indexOf("const tokens = pushAllowed"));
assert.doesNotMatch(dispatchSource, /if \(!tokens\.length\)[\s\S]{0,220}return/u);
assert.match(voipSource, /whole_app_read_deliverable_ios_voip_tokens/u);
assert.match(voipSource, /recipientSessionGeneration: tokenRow\.session_generation/u);
assert.match(voipSource, /recipientInstallId: tokenRow\.install_id/u);
assert.match(voipSource, /return data\?\.chilly_chat_calls_enabled !== false/u);
assert.doesNotMatch(voipSource, /data\?\.push_enabled !== false/u);
assert.match(voipSource, /ios_voip:\$\{invite\.id\}:\$\{tokenRow\.id\}:\$\{action\}/u);
assert.match(dispatchSource, /const shouldInvokeIosVoip = \(action: DispatchAction\) => action === "incoming"/u);
assert.match(voipSource, /reason: "non_incoming_uses_authoritative_state"/u);
assert.ok(
  voipSource.indexOf('reason: "non_incoming_uses_authoritative_state"')
    < voipSource.indexOf('readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")'),
  "non-incoming VoIP actions must stop before any provider or privileged backend work",
);
assert.match(nativeCoordinatorSource, /if isTerminalInvite\(inviteId\)[\s\S]*completion\(\)/u);
assert.match(retryWorkerSource, /claim_chilly_chat_call_transition_delivery_batch/u);
assert.match(retryWorkerSource, /complete_chilly_chat_call_transition_delivery/u);
assert.match(retryWorkerSource, /expire_stale_chilly_chat_call_invites/u, "the one-minute worker owns expired ringing-call cleanup");
assert.match(retryWorkerSource, /AbortSignal\.timeout\(12_000\)/u);
assert.doesNotMatch(retryWorkerSource, /console\./u);
assert.match(retryMigrationSource, /for update skip locked/u);
assert.match(retryMigrationSource, /"attempt_count" < 10/u);
assert.match(retryMigrationSource, /make_interval\(secs => least\(300/u);
assert.match(expiryMigrationSource, /for update skip locked/u, "timeout expiry claims a bounded non-overlapping batch");
assert.match(expiryMigrationSource, /transition_chilly_chat_call_invite/u, "timeout expiry uses the durable transition operation");
assert.match(expiryMigrationSource, /"status" = 'ended'/u, "timeout expiry closes the stale media room");
assert.match(
  terminalCleanupMigrationSource,
  /after update of "status" on public\."chat_call_invites"/u,
  "every durable terminal invite transition owns product-state cleanup",
);
assert.match(
  terminalCleanupMigrationSource,
  /new\."status" not in \('declined', 'missed', 'canceled', 'ended', 'busy'\)/u,
  "only terminal call statuses close product state",
);
assert.match(
  terminalCleanupMigrationSource,
  /active_invite\."status" in \('ringing', 'accepted'\)/u,
  "cleanup cannot close a room still owned by another non-terminal invite",
);
assert.match(
  terminalCleanupMigrationSource,
  /"membership_state" = 'left'[\s\S]*"camera_enabled" = false[\s\S]*"mic_enabled" = false/u,
  "terminal cleanup leaves memberships and disables media state",
);
assert.match(
  terminalCleanupMigrationSource,
  /"active_communication_room_id" = null[\s\S]*"active_call_type" = null/u,
  "terminal cleanup clears exact thread call linkage",
);
assert.match(
  terminalMembershipRaceGuardMigrationSource,
  /update public\."communication_rooms"[\s\S]*update public\."communication_room_memberships"/u,
  "terminal cleanup locks the room before memberships to serialize stale client writes",
);
assert.match(
  terminalMembershipRaceGuardMigrationSource,
  /for key share[\s\S]*v_room_status = 'ended'[\s\S]*new\."membership_state" := 'left'/u,
  "membership media writes fail closed after the room ends",
);
assert.match(atomicCallBeginMigrationSource, /pg_advisory_xact_lock/u, "call starts serialize per direct thread");
assert.match(atomicCallBeginMigrationSource, /invite\."status" in \('ringing', 'accepted'\)/u, "a concurrent start reuses the winning invite");
assert.match(atomicCallBeginMigrationSource, /'role', case[\s\S]*'callee'/u, "the losing simultaneous caller becomes the callee");
assert.match(atomicCallBeginMigrationSource, /"room_id" is distinct from v_existing\."communication_room_id"/u, "only the losing candidate room is closed");

assert.doesNotMatch(dispatchSource, /markInviteMissed/u, "dispatch endpoint cannot own call-state transitions");
assert.doesNotMatch(
  dispatchSource,
  /\.from\("chat_call_invites"\)[\s\S]{0,180}\.update\(/u,
  "dispatch endpoint cannot mutate chat_call_invites",
);
assert.match(chatThreadSource, /readLatestChillyChatCallInviteForRoom/u, "callee join must reconcile the invite by room");
assert.match(chatThreadSource, /result\.role === "callee"/u, "a simultaneous reverse start must switch the losing device to incoming-call controls");
assert.match(chatThreadSource, /setCallPanelOpen\(false\)[\s\S]{0,180}answer or decline/u, "the collision loser cannot stay on the caller waiting panel");
assert.match(chatThreadSource, /testID="chat-thread-incoming-call-banner"/u, "same-thread foreground calls use a compact answer banner");
assert.match(
  chatThreadSource,
  /\{incomingCallInvite[\s\S]{0,160}&& !callPanelOpen[\s\S]{0,160}&& !waitingForIosNativePresentation/u,
  "the same-thread React banner remains visible after native presentation grace even when CallKit owns the iOS record",
);
assert.doesNotMatch(
  chatThreadSource,
  /\{incomingCallInvite[\s\S]{0,160}&& !callPanelOpen[\s\S]{0,160}&& !iosNativeCallPresentationOwned/u,
  "CallKit bookkeeping cannot suppress the foreground same-thread Answer and Decline controls",
);
assert.match(
  communicationLibSource,
  /readCommunicationIdentity[\s\S]{0,420}getWritablePartyUserId/u,
  "legacy call identity is authenticated-only and cannot fall back to a Watch Party guest subject",
);
assert.doesNotMatch(
  communicationLibSource.slice(
    communicationLibSource.indexOf("export async function readCommunicationIdentity"),
    communicationLibSource.indexOf("export async function listCommunicationIceServers"),
  ),
  /getSafePartyUserId/u,
  "communication identity must not use guest identity fallback",
);
const legacySessionAst = ts.createSourceFile("use-communication-room-session.ts", communicationSessionSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const legacyAdmissionLoops = [];
const findLegacyAdmissionLoop = (node) => {
  if (ts.isForStatement(node) && node.statement.getText(legacySessionAst).includes("joinCommunicationRoomSession(")) legacyAdmissionLoops.push(node);
  ts.forEachChild(node, findLegacyAdmissionLoop);
};
findLegacyAdmissionLoop(legacySessionAst);
assert.equal(legacyAdmissionLoops.length, 1, "legacy admission has one explicit bounded retry loop");
const legacyAdmissionLoop = legacyAdmissionLoops[0];
assert.equal(legacyAdmissionLoop.initializer?.getText(legacySessionAst), "let attempt = 0");
assert.equal(legacyAdmissionLoop.condition?.getText(legacySessionAst), "attempt < 3 && !joinedMembership");
assert.equal(legacyAdmissionLoop.incrementor?.getText(legacySessionAst), "attempt += 1");
const legacyAdmissionBody = legacyAdmissionLoop.statement.getText(legacySessionAst);
assert.match(
  legacyAdmissionBody,
  /if \(!joinedMembership && attempt < 2\)[\s\S]*resolvedIdentity = await readCommunicationIdentity\(authenticatedUserId\)/u,
  "legacy accepted media refreshes authenticated identity only within the bounded membership retry loop",
);
assert.match(
  legacyAdmissionBody,
  /isAmbiguousMembershipOutcome\(error\)[\s\S]*admissionUncertain = true;[\s\S]*throw error;/u,
  "an unknown admission outcome is retained and cannot silently retry the same durable join",
);
assert.match(
  legacyAdmissionBody,
  /joinCommunicationRoomSession\(\{[\s\S]*cameraEnabled: false,[\s\S]*micEnabled: false/u,
  "legacy membership admission remains muted until native media tracks are proved",
);
assert.match(
  chatThreadSource,
  /useChatCallMediaSession\(\{[\s\S]{0,180}authenticatedAccessToken: String\(session\?\.access_token[\s\S]{0,120}authenticatedUserId: currentUserId/u,
  "accepted chat media receives the exact mounted SessionProvider subject",
);
assert.match(
  chatCallMediaProviderSource,
  /useCommunicationRoomSession\(\{[\s\S]{0,160}authenticatedAccessToken: options\.authenticatedAccessToken[\s\S]{0,160}authenticatedUserId: options\.authenticatedUserId[\s\S]{0,700}useLiveKitChatCallSession\(\{[\s\S]{0,160}authenticatedUserId: options\.authenticatedUserId/u,
  "the exact mounted subject reaches both legacy and LiveKit transports",
);
assert.match(communicationSessionSource, /let realtimeAccessToken = String\(authenticatedAccessToken/u, "legacy Realtime uses the mounted exact-session token before any fallback lookup");
assert.match(chatCallMediaProviderSource, /restartDisconnectedSession: true/u, "only the Chi'lly Chat legacy adapter enables automatic same-room recovery");
const beginCallBlock = chillyChatCallsSource.slice(
  chillyChatCallsSource.indexOf("export async function beginChillyChatCall"),
  chillyChatCallsSource.indexOf("export async function createChillyChatCallInvite"),
);
const startThreadCallBlock = chatLibSource.slice(
  chatLibSource.indexOf("export async function startChatThreadCall"),
  chatLibSource.indexOf("export function subscribeToInbox"),
);
const updateCallBlock = chillyChatCallsSource.slice(
  chillyChatCallsSource.indexOf("export async function updateChillyChatCallInviteStatus"),
  chillyChatCallsSource.indexOf("export async function insertChillyChatCallEvent"),
);
assert.doesNotMatch(`${beginCallBlock}\n${updateCallBlock}`, /supabase\.auth\.getSession/u, "call begin and transition paths do not discard mounted identity for a redundant auth lookup");
assert.match(chillyChatCallsSource, /payload\.role === "caller" \|\| payload\.role === "callee"/u, "call begin binds the server-returned role to the mounted actor");
assert.match(
  beginCallBlock,
  /captureExactMountedCallActor[\s\S]{0,1200}reconcileCommittedChillyChatCallBegin/u,
  "an ambiguous call-begin result may reconcile only against the exact initiating account/session",
);
assert.match(
  chillyChatCallsSource,
  /invite\.threadId !== input\.threadId[\s\S]{0,420}invite\.callerUserId !== input\.actorUserId[\s\S]{0,220}invite\.callType !== input\.callType/u,
  "post-commit call recovery remains bound to the exact thread, room, caller, and call type",
);
// Check executable syntax and ownership, not the number of characters in an
// intervening error handler. Runtime success/failure cases also execute the
// complete production function in chat-call-rate-limit-message.test.mjs.
function assertCommittedInviteDispatch(source) {
  const ast = ts.createSourceFile("chat.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0);
  const start = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "startChatThreadCall");
  assert.ok(start?.body, "one actual call-start function");
  const calls = [];
  const visit = node => { if (ts.isCallExpression(node)) calls.push(node); ts.forEachChild(node, visit); };
  visit(start.body);
  const named = name => calls.filter(node => ts.isIdentifier(node.expression) && node.expression.text === name);
  const begins = named("beginChillyChatCall"), dispatches = named("dispatchChillyChatCallPush");
  assert.equal(begins.length, 1, "one authoritative begin operation");
  assert.equal(dispatches.length, 1, "one canonical dispatch operation");
  const assignment = (call, name) => {
    assert.ok(ts.isAwaitExpression(call.parent), `${name} must await its operation`);
    const expression = call.parent.parent;
    assert.ok(ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(expression.left) && expression.left.text === name, `operation must assign ${name}`);
    return expression;
  };
  const begin = assignment(begins[0], "begunCall");
  const dispatch = assignment(dispatches[0], "delivery");
  const owner = node => { while (node.parent && node.parent !== start.body) node = node.parent; return node; };
  const beginStatement = owner(begin), dispatchStatement = owner(dispatch);
  assert.ok(ts.isTryStatement(beginStatement), "begin must retain its failure cleanup");
  assert.ok(ts.isIfStatement(dispatchStatement)
    && ts.isPropertyAccessExpression(dispatchStatement.expression)
    && dispatchStatement.expression.expression.getText(ast) === "begunCall"
    && dispatchStatement.expression.name.text === "created", "dispatch is guarded by the authoritative created result");
  assert.ok(dispatch.pos >= dispatchStatement.thenStatement.pos && dispatch.end <= dispatchStatement.thenStatement.end,
    "dispatch belongs to the created branch, never a reused/busy branch");
  assert.ok(beginStatement.end <= dispatchStatement.pos, "dispatch follows completed begin and failure handling");
}
assertCommittedInviteDispatch(startThreadCallBlock);
for (const [from, to] of [
  ["if (begunCall.created)", "if (true)"],
  ["delivery = await dispatchChillyChatCallPush", "delivery = dispatchChillyChatCallPush"],
  ["dispatchChillyChatCallPush({", "discardDispatch({"],
]) {
  assert.ok(startThreadCallBlock.includes(from), "negative control targets actual source");
  assert.throws(() => assertCommittedInviteDispatch(startThreadCallBlock.replace(from, to)),
    "broken dispatch control must be rejected");
}
assert.match(chatLibSource, /getCurrentAccountSessionAuthoritySnapshot\(\)[\s\S]{0,420}getWritablePartyUserId/u, "direct chat operations prefer established exact mounted authority and retain a bounded fallback");
const communicationJoinBlock = communicationLibSource.slice(
  communicationLibSource.indexOf("export async function joinCommunicationRoomSession"),
  communicationLibSource.indexOf("export async function touchCommunicationRoomSession"),
);
const communicationSignalBlock = communicationLibSource.slice(
  communicationLibSource.indexOf("export async function broadcastCommunicationRoomSignal"),
  communicationLibSource.indexOf("const isMissingColumnError"),
);
const communicationTouchBlock = communicationLibSource.slice(
  communicationLibSource.indexOf("export async function touchCommunicationRoomSession"),
  communicationLibSource.indexOf("export async function leaveCommunicationRoomSession"),
);
const clearEndedCallBlock = chatLibSource.slice(
  chatLibSource.indexOf("export async function clearEndedChatThreadCall"),
  chatLibSource.indexOf("export async function startChatThreadCall"),
);
const receiverSensitiveClient = {
  rest: { marker: "receiver-preserved" },
  rpc() {
    assert.equal(this, receiverSensitiveClient, "the faithful RPC double requires its SupabaseClient receiver");
    return this.rest.marker;
  },
};
assert.equal(
  receiverSensitiveClient.rpc.bind(receiverSensitiveClient)(),
  "receiver-preserved",
  "the production binding pattern executes an SDK-shaped receiver-sensitive RPC method",
);
for (const [sourceBlock, label] of [
  [communicationSignalBlock, "legacy WebRTC signaling"],
]) {
  assert.match(
    sourceBlock,
    /supabase\.rpc\.bind\(supabase\)/u,
    `${label} must preserve the SupabaseClient receiver when narrowing the RPC type`,
  );
  assert.doesNotMatch(
    sourceBlock,
    /const rpc = supabase\.rpc as unknown/u,
    `${label} cannot detach SupabaseClient.rpc because the SDK implementation reads this.rest`,
  );
}
assert.match(
  communicationJoinBlock,
  /runExactSessionAccountBoundSupabaseMutationRpc<[\s\S]{0,180}"join_owned_communication_room_session"[\s\S]{0,700}requestedUserId/u,
  "accepted room membership uses the exact-session account-bound RPC boundary",
);
assert.match(
  communicationJoinBlock,
  /if \(!membership \|\| membership\.roomId !== roomId \|\| membership\.userId !== requestedUserId[\s\S]{0,800}account_bound_rpc_outcome_unknown/u,
  "accepted room membership binds the server result back to the initiating subject",
);
assert.match(
  clearEndedCallBlock,
  /invokeBoundChatRpc<unknown>\([\s\S]{0,360}"clear_stale_chilly_chat_thread_call"/u,
  "stale call cleanup uses the exact-session account-bound RPC boundary",
);
assert.match(
  clearEndedCallBlock,
  /captureChatMutationAuthority\(expectedBinding\?\.userId\)[\s\S]{0,240}sameAccountSessionAuthority\(expectedBinding, authority\.binding\)/u,
  "stale call cleanup binds the mutation to the initiating mounted subject",
);
assert.match(
  communicationJoinBlock,
  /options\.userId \?\? await getWritablePartyUserId\(\)/u,
  "non-chat communication surfaces retain authenticated identity fallback",
);
assert.doesNotMatch(
  communicationJoinBlock,
  /requestedUserId !== writableUserId/u,
  "an accepted call is not suppressed by a redundant second auth lookup",
);
assert.match(
  communicationJoinBlock,
  /membership\.membershipAdmissionAttempt !== admission\.attemptId[\s\S]{0,650}return membership/u,
  "the RPC result must bind back to the exact durable admission attempt",
);
assert.match(
  communicationLibSource,
  /AUTHENTICATED_USER_ID_PATTERN[\s\S]{0,240}return AUTHENTICATED_USER_ID_PATTERN\.test\(userId\) \? userId\.toLowerCase\(\) : ""/u,
  "mounted identity inputs remain strictly UUID-bound",
);
assert.doesNotMatch(communicationTouchBlock, /if \(!room && membershipState !== "left"\) return null/u, "membership updates are not blocked by a circular pre-join room read");
assert.match(communicationTouchBlock, /runExactSessionAccountBoundSupabaseMutationRpc<[\s\S]{0,180}"touch_owned_communication_room_session"[\s\S]{0,180}p_expected_membership_generation: generation/u, "durable media writes are fenced to the captured membership generation");
assert.doesNotMatch(communicationTouchBlock, /\.update\(/u, "owned media updates cannot use a room/user-only direct table write");
assert.match(clearEndedCallBlock, /if \(error\) throw new Error/u, "stale projection cleanup cannot silently report success after an RPC failure");
const legacyMissingSnapshotBranch = communicationSessionSource.slice(
  communicationSessionSource.indexOf("if (!snapshot)", communicationSessionSource.indexOf("let joinedMembership")),
  communicationSessionSource.indexOf("if (snapshot.room.status === \"ended\")", communicationSessionSource.indexOf("let joinedMembership")),
);
assert.match(legacyMissingSnapshotBranch, /setChannelState\("error"\)/u);
assert.doesNotMatch(
  legacyMissingSnapshotBranch,
  /onRoomEndedRef/u,
  "an unreadable snapshot after a failed join is not authority to terminate an accepted call",
);
assert.match(
  chatThreadSource,
  /leaveLabel=\{outgoingCallRinging \? "Cancel Call" : "End Call"\}/u,
  "a ringing caller receives an explicit cancel-call action",
);
assert.match(
  chatThreadSource,
  /showControls=\{outgoingCallRinging \|\| activeCallInvite\?\.status === "accepted" \|\| TERMINAL_CHAT_CALL_INVITE_STATUSES\.has\(activeCallInvite\?\.status \?\? ""\)\}/u,
  "the cancel-call action remains visible before acceptance",
);
assert.match(
  chatThreadSource,
  /terminalInvite\.status === "ringing" && currentUserIsCaller/u,
  "a ringing caller can cancel before a media room has initialized",
);
assert.match(
  chatThreadSource,
  /shouldEndRoomAsHost = shouldEndRoomAsHost \|\| currentUserIsCaller/u,
  "ringing-call cleanup derives room ownership from the durable caller identity",
);
assert.match(
  chatThreadSource,
  /!incomingCallRinging \? \(\s*<TouchableOpacity[\s\S]{0,260}testID="chat-thread-join-call-button"/u,
  "a ringing receiver does not receive a duplicate Join Call affordance",
);
assert.match(
  chatThreadSource,
  /activeCallRoomId && !callPanelOpen && !incomingCallRinging/u,
  "a ringing receiver does not receive a duplicate active-room banner",
);
assert.doesNotMatch(chatThreadSource, /styles\.incomingCallSheet/u, "same-thread foreground calls cannot use the large blocking modal");
assert.match(rootLayoutSource, /testID="app-wide-incoming-call-banner"/u, "foreground calls outside the thread use the compact top banner");
assert.doesNotMatch(rootLayoutSource, /app-wide-incoming-call-modal/u, "foreground calls cannot use the large app-wide modal");
const androidNativeCallRouteBridgeSource = rootLayoutSource.match(
  /function AndroidNativeCallRouteBridge\(\)[\s\S]*?\n\}\n\nfunction RouteAnalyticsBridge/u,
)?.[0] ?? "";
assert.match(
  androidNativeCallRouteBridgeSource,
  /isLoading \|\| !isSignedIn \|\| !authenticatedUserId[\s\S]{0,700}consumePendingAndroidNativeCallRoute\(\{ authenticatedUserId \}\)/u,
  "cold-start Android actions must wait for exact authenticated identity before consuming the private native store",
);
assert.match(
  androidNativeCallRouteBridgeSource,
  /nativeCallRoute\?\.destination[\s\S]{0,220}router\.replace/u,
  "only a route created after trusted native-store consumption may navigate",
);
assert.doesNotMatch(
  androidNativeCallRouteBridgeSource,
  /Linking\.getInitialURL|Linking\.addEventListener|captureNativeCallRoute|pendingNativeCallRoute/u,
  "external URL and legacy route-buffer state cannot manufacture Android transition authority",
);
const nativeCallRouteBridgeMountIndex = rootLayoutSource.indexOf("<AndroidNativeCallRouteBridge />");
const authRouteGateMountIndex = rootLayoutSource.indexOf("<AuthRouteGate />");
assert.ok(
  nativeCallRouteBridgeMountIndex >= 0
  && authRouteGateMountIndex >= 0
  && nativeCallRouteBridgeMountIndex < authRouteGateMountIndex,
  "the Android native action bridge must mount outside and before the auth-gated navigator",
);
assert.match(
  chatThreadSource,
  /result\.invite\?\.status === "busy"[\s\S]{0,420}setCallPanelOpen\(false\)[\s\S]{0,240}No media was started/u,
  "an authoritative busy result must keep the second call's media panel closed",
);
assert.match(
  chatLibSource,
  /begunCall\.invite\.status === "busy"[\s\S]{0,420}thread_call_receiver_busy/u,
  "the caller must treat a server-owned busy result as terminal rather than a same-thread collision",
);
assert.match(
  authoritativeBusyBeginSource,
  /invite\."thread_id" <> p_thread_id[\s\S]{0,240}invite\."status" = 'accepted'[\s\S]{0,560}established_thread\."active_communication_room_id"[\s\S]{0,520}active_room\."status" = 'active'/u,
  "busy authority must require a different-thread accepted call whose active room remains authoritative on its thread",
);
assert.match(
  authoritativeBusyBeginSource,
  /transition_chilly_chat_call_invite[\s\S]{0,180}v_callee_user_id::uuid[\s\S]{0,100}'busy'[\s\S]{0,500}"delivery_status" = 'skipped'/u,
  "busy authority must atomically transition the overlap and suppress terminal push delivery",
);
for (const nativePresentationOwnerSource of [rootLayoutSource, chatThreadSource]) {
  assert.match(
    nativePresentationOwnerSource,
    /subscribeToIosNativeCallPresentation/u,
    "iOS incoming-call surfaces subscribe to exact native presentation ownership",
  );
  assert.match(
    nativePresentationOwnerSource,
    /IOS_NATIVE_PRESENTATION_GRACE_MS/u,
    "iOS incoming-call surfaces give CallKit a bounded presentation grace period",
  );
  assert.match(
    nativePresentationOwnerSource,
    /hasIosNativeCallPresentation/u,
    "iOS incoming-call surfaces retain exact native presentation bookkeeping",
  );
}
assert.match(
  chatThreadSource,
  /\|\| iosNativeCallPresentationOwned\s+\|\| waitingForIosNativePresentation[\s\S]{0,1200}playChillyChatCallSound/u,
  "the exact thread avoids duplicate CallKit and React ringtone ownership",
);
assert.match(
  rootLayoutSource,
  /\|\| alreadyOnSameThread\s+\|\| waitingForIosNativePresentation[\s\S]{0,1200}playChillyChatCallSound/u,
  "the app-wide foreground surface remains customer-visible after bounded native grace",
);
assert.match(iosNativeCallsSource, /const nativePresentedCallUuidsByInviteId = new Map<string, string>\(\)/u, "native presentation ownership binds each invite to its exact CallKit UUID");
// These checks follow the executable function/branch structure. Comments,
// diagnostics and recovery code cannot invalidate a character-distance proxy.
// Runtime admission and cancellation are independently exercised by the actual
// facade and mounted-root/thread suites, including withheld native receipts.
function assertIosForegroundAnswerStructure(facadeSource, layoutSource, threadSource) {
  const parse = (name, source) => {
    const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true,
      name.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.equal(ast.parseDiagnostics.length, 0, `${name} must parse`);
    return ast;
  };
  const find = (owner, predicate) => {
    const matches = [];
    const visit = node => { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); };
    visit(owner);
    return matches;
  };
  const one = (matches, description) => {
    assert.equal(matches.length, 1, description);
    return matches[0];
  };
  const namedFunction = (ast, name) => one(ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && node.name?.text === name && node.body), `one production ${name}`);
  const calls = (owner, name) => find(owner, node => ts.isCallExpression(node)
    && node.expression.getText() === name);
  const variable = (owner, name) => one(find(owner, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === name), `one ${name} declaration`);
  const inside = (owner, node) => node.pos >= owner.pos && node.end <= owner.end;
  const returns = owner => find(owner, ts.isReturnStatement);
  const rejects = owner => returns(owner).some(node => node.expression?.kind === ts.SyntaxKind.FalseKeyword);
  const authorityBranch = (owner, value) => one(find(owner, node => ts.isIfStatement(node)
    && ts.isBinaryExpression(node.expression)
    && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && node.expression.left.getText() === "answerAuthority"
    && ts.isStringLiteral(node.expression.right) && node.expression.right.text === value), `one ${value} branch`);
  const property = (object, name) => one(object.properties.filter(node => ts.isPropertyAssignment(node)
    && node.name.getText() === name), `one ${name} property`);

  const facadeAst = parse("iosNativeCalls.ts", facadeSource);
  const readiness = namedFunction(facadeAst, "startIosNativeCallsReadiness");
  const reuse = one(find(readiness, node => ts.isIfStatement(node)
    && calls(node.expression, "shouldReuseIosNativeCallReadiness").length === 1), "one same-authority reuse branch").thenStatement;
  const listener = one(find(reuse, node => ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText() === "eventListener"), "reuse installs one current listener");
  assert.equal(listener.right.getText(), "listener ?? null");
  const rebound = one(calls(reuse, "NativeCallsModule.startVoipRegistrationAsync"), "reuse requests genuine native token/presentation replay");
  const drain = one(calls(reuse, "drainPendingEventsForExactLifecycle"), "reuse drains exact native receipts");
  assert.ok(ts.isAwaitExpression(variable(reuse, "rebound").initializer)
    && ts.isAwaitExpression(drain.parent), "native replay and receipt drain are awaited");
  assert.ok(listener.end < rebound.pos && rebound.end < drain.pos, "listener precedes native rebind and exact receipt drain");
  assert.equal(calls(reuse, "clearNativePresentedInvites").length, 0, "healthy reuse cannot erase native ownership");
  assert.equal(calls(reuse, "nativeSubscription?.remove").length, 0, "healthy reuse retains its observer");

  const ownership = variable(facadeAst, "updateNativePresentationOwnership");
  const record = one(calls(facadeAst, "nativePresentedCallUuidsByInviteId.set"), "only the native receipt owner can record invite/UUID ownership");
  const confirmedEvent = (node, type) => ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && node.left.getText() === "event.type" && ts.isStringLiteral(node.right) && node.right.text === type;
  const confirmedBranch = one(find(ownership, node => ts.isIfStatement(node)
    && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
    && confirmedEvent(node.expression.left, "incoming") && confirmedEvent(node.expression.right, "recovered")), "incoming/recovered receipts own presentation");
  assert.ok(inside(confirmedBranch.thenStatement, record));
  assert.deepEqual(record.arguments.map(node => node.getText()), ["inviteId", "callUuid"]);

  const presentationWait = namedFunction(facadeAst, "waitForIosNativeCallPresentation");
  const presentedResults = [
    ...returns(presentationWait).filter(node => node.expression && ts.isStringLiteral(node.expression) && node.expression.text === "presented"),
    ...calls(presentationWait, "finish").filter(node => ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "presented"),
  ];
  assert.equal(presentedResults.length, 3, "initial, notification and deadline checks can confirm native presentation");
  for (const result of presentedResults) {
    const confirmed = find(presentationWait, node => ts.isIfStatement(node)
      && ts.isCallExpression(node.expression)
      && node.expression.expression.getText() === "nativePresentedCallUuidsByInviteId.has"
      && node.expression.arguments.length === 1
      && node.expression.arguments[0].getText() === "normalizedInviteId"
      && inside(node.thenStatement, result));
    assert.equal(confirmed.length, 1, "every presented outcome requires the exact native receipt");
  }
  const timeout = one(calls(presentationWait, "setTimeout"), "exact native receipt wait has one deadline");
  assert.ok(ts.isArrowFunction(timeout.arguments[0]));
  assert.equal(timeout.arguments[1].getText(), "boundedTimeoutMs");
  assert.equal(calls(timeout.arguments[0], "finish").filter(call => ts.isStringLiteral(call.arguments[0])
    && call.arguments[0].text === "timeout").length, 1, "missing native receipt resolves timeout");
  const boundedWait = variable(presentationWait, "boundedTimeoutMs");
  const upperBound = one(calls(boundedWait, "Math.min"), "receipt deadline has a fixed maximum");
  assert.ok(ts.isNumericLiteral(upperBound.arguments[0]) && Number(upperBound.arguments[0].text) === 20_000);
  assert.equal(upperBound.arguments[1].getText(), "timeoutMs");

  const ensure = namedFunction(facadeAst, "ensureIosForegroundIncomingCallPresentation");
  const report = one(calls(ensure, "native.reportForegroundIncomingCallAsync"), "foreground fallback requests native presentation");
  const wait = one(calls(ensure, "waitForIosNativeCallPresentation"), "foreground fallback awaits an actual presentation receipt");
  const admitted = one(calls(ensure, "foregroundAnswerValidations.set"), "foreground admission is operation-bound");
  assert.equal(admitted.arguments[0].getText(), "input.isCurrent");
  assert.ok(report.end < wait.pos && wait.end < admitted.pos, "report and confirmed receipt precede foreground admission");
  assert.equal(calls(ensure, "nativePresentedCallUuidsByInviteId.set").length, 0, "a returned report UUID cannot manufacture native ownership");

  const request = namedFunction(facadeAst, "requestIosNativeCallAnswer");
  assert.equal(request.parameters.length, 2, "native Answer requires invite and current UI operation");
  assert.equal(request.parameters[1].name.getText(), "isCurrent");
  assert.ok(ts.isFunctionTypeNode(request.parameters[1].type) && !request.parameters[1].initializer
    && !request.parameters[1].questionToken, "UI operation cannot default to an always-current callback");
  const admission = one(calls(request, "foregroundAnswerValidations.get"), "native Answer reads its own admission");
  const consume = one(calls(request, "foregroundAnswerValidations.delete"), "native Answer consumes admission once");
  assert.equal(admission.arguments[0].getText(), "isCurrent", "admission lookup belongs to the current UI operation");
  assert.equal(consume.arguments[0].getText(), "isCurrent", "admission consumption belongs to the current UI operation");
  const exactAdmission = one(find(request, node => ts.isIfStatement(node)
    && find(node.expression, child => ts.isPrefixUnaryExpression(child)
      && child.operator === ts.SyntaxKind.ExclamationToken && child.operand.getText() === "foregroundValidation").length > 0), "missing foreground admission is rejected");
  assert.ok(rejects(exactAdmission.thenStatement));
  for (const [field, expected] of [["inviteId", "normalizedInviteId"], ["generation", "generation"], ["context", "context"]]) {
    assert.equal(find(exactAdmission.expression, node => ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
      && node.left.getText() === `foregroundValidation.${field}` && node.right.getText() === expected).length,
    1, `foreground admission binds exact ${field}`);
  }
  const freshValidation = one(calls(request, "foregroundValidation.validate"), "native Answer revalidates current raw server state");
  const validationGuard = one(find(request, node => ts.isIfStatement(node) && inside(node.expression, freshValidation)), "fresh validation guards native dispatch");
  assert.ok(rejects(validationGuard.thenStatement));
  const nativeAnswer = one(calls(request, "NativeCallsModule.requestAnswerAsync"), "one exact native Answer dispatch");
  assert.deepEqual(nativeAnswer.arguments.map(node => node.getText()), ["callUuid", "normalizedInviteId"]);
  assert.ok(admission.end < consume.pos && consume.end < exactAdmission.pos
    && exactAdmission.end < freshValidation.pos && validationGuard.end < nativeAnswer.pos,
  "admission is consumed and freshly validated before exact native Answer dispatch");

  for (const [name, source, component, handler, outcome] of [
    ["_layout.tsx", layoutSource, "IncomingCallNotificationBridge", "openCall", "nativePresentationWaitOutcome"],
    ["thread.tsx", threadSource, "ChillyChatThreadScreen", "acceptIncomingInvite", "presentationWaitOutcome"],
  ]) {
    const ast = parse(name, source);
    const owner = variable(namedFunction(ast, component), handler).initializer;
    const presentation = one(calls(owner, "ensureIosForegroundIncomingCallPresentation"), `${name} uses authenticated foreground presentation`);
    const options = presentation.arguments[0];
    assert.ok(ts.isObjectLiteralExpression(options));
    assert.equal(property(options, "isCurrent").initializer.getText(), "ownsForegroundAnswer");
    const current = variable(owner, "ownsForegroundAnswer");
    assert.ok(ts.isArrowFunction(current.initializer), "the handler captures its mounted operation");
    const currentCheck = one(calls(current, handler === "openCall" ? "incomingActionOwner.isCurrent" : "isAnswerOperationCurrent"), "UI callback checks the mounted operation owner");
    assert.equal(currentCheck.arguments[0].getText(), "operation");
    const arbitration = one(calls(owner, "resolveIosForegroundIncomingAnswerAuthority"), `${name} arbitrates native ownership`);
    assert.equal(arbitration.arguments[0].getText(), outcome);
    assert.ok(inside(variable(owner, outcome).initializer, presentation), "arbitration uses the actual presentation outcome");
    const nativeBranch = authorityBranch(owner, "native_answer");
    const blockedBranch = authorityBranch(owner, "blocked");
    const dispatch = one(calls(owner, "requestIosNativeCallAnswer"), `${name} dispatches one native Answer`);
    assert.ok(ts.isAwaitExpression(presentation.parent) && ts.isAwaitExpression(dispatch.parent), "UI waits for native presentation and native Answer acknowledgments");
    assert.deepEqual(dispatch.arguments.map(node => node.getText()), ["invite.id", "ownsForegroundAnswer"],
      "native dispatch retains the same UI operation that obtained presentation");
    assert.ok(inside(nativeBranch.thenStatement, dispatch), "native dispatch belongs exclusively to native-owned arbitration");
    assert.ok(ts.isBlock(nativeBranch.thenStatement) && ts.isReturnStatement(nativeBranch.thenStatement.statements.at(-1)),
      "native-owned Answer returns without falling through to server acceptance");
    assert.ok(ts.isBlock(blockedBranch.thenStatement) && ts.isReturnStatement(blockedBranch.thenStatement.statements.at(-1)),
      "unknown or timed-out presentation stops the foreground Answer");
    const blockedReturn = blockedBranch.thenStatement.statements.at(-1).expression;
    assert.ok(!blockedReturn || blockedReturn.kind === ts.SyntaxKind.FalseKeyword, "blocked presentation cannot report successful Answer");
    assert.ok(presentation.end <= arbitration.pos && arbitration.end <= nativeBranch.pos && nativeBranch.end <= blockedBranch.pos,
      "presentation receipt is arbitrated before native Answer or blocked return");
    const accepts = calls(owner, "updateChillyChatCallInviteStatus");
    assert.equal(accepts.length, 1, "one fallback server acceptance remains");
    assert.ok(blockedBranch.end < accepts[0].pos, "server acceptance cannot precede native-owned or blocked arbitration");
    if (handler === "openCall") {
      const clear = one(calls(nativeBranch.thenStatement, "clearAlert"), "native app-wide Answer clears its alert once");
      assert.ok(dispatch.end < clear.pos, "app-wide alert clears only after awaiting native Answer");
    }
  }
}
assertIosForegroundAnswerStructure(iosNativeCallsSource, rootLayoutSource, chatThreadSource);
for (const [target, from, to, expectedFailure] of [
  [0, "eventListener = listener ?? null;", "retiredListener = listener ?? null;", "reuse installs one current listener"],
  [0, "const rebound = await NativeCallsModule.startVoipRegistrationAsync(", "const rebound = await discardNativeReplay(", "reuse requests genuine native token/presentation replay"],
  [0, "foregroundAnswerValidations.get(isCurrent)", "foregroundAnswerValidations.get(() => true)", "admission lookup belongs to the current UI operation"],
  [0, "foregroundAnswerValidations.delete(isCurrent)", "discardAdmission(isCurrent)", "native Answer consumes admission once"],
  [0, "foregroundValidation.validate()", "skipFreshValidation()", "native Answer revalidates current raw server state"],
  [0, 'finish("timeout")', 'finish("stale")', "missing native receipt resolves timeout"],
  [0, 'if (nativePresentedCallUuidsByInviteId.has(normalizedInviteId)) return "presented";', 'if (true) return "presented";', "every presented outcome requires the exact native receipt"],
  [1, "requestIosNativeCallAnswer(invite.id, ownsForegroundAnswer)", "requestIosNativeCallAnswer(invite.id, () => true)", "native dispatch retains the same UI operation that obtained presentation"],
  [2, 'if (answerAuthority === "blocked")', 'if (answerAuthority === "allowed")', "one blocked branch"],
  [2, "ensureIosForegroundIncomingCallPresentation({", "waitForIosNativeCallPresentation({", "thread.tsx uses authenticated foreground presentation"],
]) {
  const sources = [iosNativeCallsSource, rootLayoutSource, chatThreadSource];
  assert.ok(sources[target].includes(from), "foreground negative control targets actual source");
  sources[target] = sources[target].replace(from, to);
  assert.throws(() => assertIosForegroundAnswerStructure(...sources),
    error => error?.code === "ERR_ASSERTION" && error.message.startsWith(expectedFailure),
    `broken foreground admission must fail its intended guard: ${expectedFailure}`);
}
assert.match(iosNativeCallsSource, /typeof NativeCallsModule\.requestAnswerAsync !== "function"/u, "older same-runtime native binaries fail closed instead of invoking an unavailable Answer API");
assert.match(iosNativeCallsSource, /"reportFailed"/u, "failed CallKit reporting releases fallback presentation ownership");
assert.match(
  iosNativeCallsSource,
  /event\.type === "audioSessionActivated"[\s\S]{0,180}synchronizeLiveKitCallKitAudioSession\("activated"\)[\s\S]{0,180}event\.type === "audioSessionDeactivated"[\s\S]{0,180}synchronizeLiveKitCallKitAudioSession\("deactivated"\)/u,
  "trusted CallKit activation and deactivation events close the installed WebRTC audio-session lifecycle",
);
assert.doesNotMatch(rootLayoutSource, /<Modal/u, "background/full-screen presentation remains native rather than a React modal");
assert.match(rootLayoutSource, /presentation === "native_background"/u, "background state defers to native CallStyle or CallKit");
assert.match(rootLayoutSource, /presentation === "native_ios"/u, "an exact CallKit record continues to own background and terminated presentation");
assert.match(rootLayoutSource, /presentation === "native_background"/u, "background and terminated calls remain native");
assert.doesNotMatch(
  rootLayoutSource,
  /alreadyOnSameThread\s*\|\|\s*iosNativeCallPresentationOwned\s*\|\|\s*waitingForIosNativePresentation/u,
  "native presentation bookkeeping cannot suppress active app-wide call attention",
);
assert.doesNotMatch(rootLayoutSource, /nativeCallAction:\s*"answer"/u, "CallKit and foreground routes never carry authoritative action text");
assert.match(rootLayoutSource, /createIosCallKitAnswerRouteHandler/u, "CallKit Answer uses the canonical bridge-auth-router provenance handler");
assert.match(rootLayoutSource, /await waitForIosNativeCallAnswerRouteReadiness\(event\)[\s\S]*?await routeNativeAnswer\(event\)/u, "CallKit Answer waits for exact stable application readiness before native-authority navigation");
const nativeForegroundAnswerBlock = nativeCoordinatorSource.slice(
  nativeCoordinatorSource.indexOf("public func requestAnswer(callUuid: String, inviteId: String)"),
  nativeCoordinatorSource.indexOf("public func completeTerminalTransition(callUuid: String)"),
);
assert.match(
  nativeForegroundAnswerBlock,
  /requestAnswer\(callUuid: String, inviteId: String\)[\s\S]*?call\.inviteId == normalizedInviteId[\s\S]*?requestedAnswerTransactions\.contains\(uuid\)[\s\S]*?CXAnswerCallAction\(call: uuid\)/u,
  "native foreground Answer is exact-invite bound, single-flight, and requested through CXAnswerCallAction",
);
assert.match(
  nativeForegroundAnswerBlock,
  /call\.ringingDeadline\?\.wakeup\([\s\S]*?== \.expire\s*\{[\s\S]*?timeoutCall\(uuid, generation: call\.generation\)[\s\S]*?continuation\.resume\(throwing:[\s\S]*?return\s*\}[\s\S]*?requestedAnswerCompletions\[uuid/u,
  "expired native Answer cannot register or start a fresh CallKit transaction",
);
assert.match(
  nativeCoordinatorSource,
  /provider\(_ provider: CXProvider, perform action: CXAnswerCallAction\)[\s\S]{0,120}requestedAnswerTransactions\.remove\(action\.callUUID\)/u,
  "the provider atomically hands an in-flight foreground Answer to the existing trusted CallKit answer pipeline",
);
assert.match(
  nativeCoordinatorSource,
  /requestedAnswerCompletions\[uuid, default: \[\]\][\s\S]{0,360}requestedAnswerTransactions\.contains\(uuid\)[\s\S]{0,360}CXAnswerCallAction\(call: uuid\)/u,
  "concurrent foreground Answer taps share the exact in-flight CallKit transaction",
);
assert.match(
  nativeCoordinatorSource,
  /emit\(type: "answerRequested", call: call\)[\s\S]{0,320}settleRequestedAnswers\(action\.callUUID, result: \.success\(\(\)\)\)/u,
  "foreground Answer does not report handoff until the exact CallKit provider action is installed and emitted",
);
assert.match(
  nativeCoordinatorSource,
  /if event\["type"\] as\? String == "answerRequested"[\s\S]{0,480}self\.persistPendingAnswerEvent\(event\)[\s\S]{0,320}if let eventSink = self\.eventSink/u,
  "CallKit Answer is durably exact-bound before a suspended Expo event sink can lose the handoff",
);
assert.match(
  nativeCoordinatorSource,
  /let events = durableAnswerEvents \+ transientEvents \+ pendingEvents[\s\S]{0,220}removeObject\(forKey: pendingEventsDefaultsKey\)/u,
  "ordinary event draining preserves the exact CallKit Answer until media or terminal acknowledgement",
);
assert.match(
  nativeCoordinatorSource,
  /DispatchQueue\.main\.asyncAfter\(deadline: \.now\(\) \+ 3\)[\s\S]{0,360}answerNotPending/u,
  "a CallKit transaction that never reaches the provider releases every waiting foreground Answer within a bounded deadline",
);
assert.match(
  chatThreadSource,
  /const releaseTrustedNativeCallSession = useCallback[\s\S]{0,620}setTrustedNativeCallClaim\(null\)[\s\S]{0,360}setNativeMediaActivationSerial\(0\)/u,
  "terminal cleanup revokes the consumed native Answer claim before a later ordinary call can inherit its media gates",
);
assert.match(
  liveKitChatCallSessionSource,
  /NATIVE_MEDIA_ACTIVATION_RETRY_DELAYS_MS = \[0, 250, 750, 1_500, 3_000\]/u,
  "CallKit audio/application activation drives a bounded exact-session camera and microphone convergence loop",
);
const preservesDelayedPostCommitCameraRecovery = (source) => (
  /POST_COMMIT_CAMERA_TRANSIENT_RETRY_DELAYS_MS = \[250, 750, 1_500, 3_000, 5_000\]/u.test(source)
  && /monitorExactIosAcceptedCamera = hasExactIosAcceptedMediaAuthority\(\)[\s\S]{0,420}\(!cameraPublication \|\| monitorExactIosAcceptedCamera\)/u.test(source)
  && /for \(const retryDelay of POST_COMMIT_CAMERA_TRANSIENT_RETRY_DELAYS_MS\)[\s\S]{0,900}isCommittedSessionCurrent\(recoveryBinding\)[\s\S]{0,900}cameraRequestedRef\.current/u.test(source)
  && /stableInitialCallKitCamera = monitorExactIosAcceptedCamera[\s\S]{0,220}nativeCameraReadyBeforeReconciliation[\s\S]{0,260}scheduleLatestMediaReconciliation/u.test(source)
  && /if \(!monitorExactIosAcceptedCamera\) return/u.test(source)
);
assert.equal(
  preservesDelayedPostCommitCameraRecovery(liveKitChatCallSessionSource),
  true,
  "terminated iOS video retains an exact-session camera recovery attempt beyond the physical 5.5-second UIKit activation window",
);
assert.equal(
  preservesDelayedPostCommitCameraRecovery(
    liveKitChatCallSessionSource.replace(
      "POST_COMMIT_CAMERA_TRANSIENT_RETRY_DELAYS_MS = [250, 750, 1_500, 3_000, 5_000]",
      "POST_COMMIT_CAMERA_TRANSIENT_RETRY_DELAYS_MS = [250, 750, 1_500, 3_000]",
    ),
  ),
  false,
  "the regression guard kills the historical short post-commit camera recovery window",
);
assert.equal(
  preservesDelayedPostCommitCameraRecovery(
    liveKitChatCallSessionSource.replace(
      "(!cameraPublication || monitorExactIosAcceptedCamera)",
      "!cameraPublication",
    ),
  ),
  false,
  "the regression guard kills exact CallKit monitoring after an initially successful camera publication",
);
assert.match(
  liveKitChatCallSessionSource,
  /for \(const delayMs of NATIVE_MEDIA_ACTIVATION_RETRY_DELAYS_MS\)[\s\S]{0,900}isCommittedSessionCurrent\(binding\)[\s\S]{0,900}cameraRequestedRef\.current/u,
  "native activation retries remain bound to the exact current session and requested camera authority",
);
assert.match(
  chatThreadSource,
  /const readAcceptableIncomingInvite[\s\S]{0,520}normalizeCommunicationRoomIdentifier\(latestInvite\?\.communicationRoomId\)[\s\S]{0,520}latestInvite\.calleeUserId === currentUserId/u,
  "callee pre-accept validation binds the exact invite and canonical text room identifier",
);
assert.doesNotMatch(
  chatThreadSource,
  /const readAcceptableIncomingInvite[\s\S]{0,900}getCommunicationRoomSnapshot/u,
  "callee pre-accept validation does not require an RLS-denied communication-room read",
);
assert.match(
  chatThreadSource,
  /const requestedNativeCallOwnsTransition = doesNativeCallActionOwnTransition\(\{[\s\S]{0,220}authority: trustedNativeCallClaim[\s\S]{0,400}trustedNativeClaim: trustedNativeCallClaim/u,
  "the chat thread must use the tested native-transition ownership policy",
);
assert.doesNotMatch(chatThreadSource, /requestedOpenCall|autoOpenCallRef/u, "openCall route text must never open or join call media");
assert.doesNotMatch(chatThreadSource, /requestedCallMode|autoStartCallRef/u, "startCall route text must never create a call");
assert.match(
  chatThreadSource,
  /activeNativeCallActionRequestKeyRef\.current = requestedNativeCallRequestKey[\s\S]{0,320}\[requestedNativeCallRequestKey\]/u,
  "native action work must remain scoped to the exact request across unrelated rerenders",
);
assert.match(
  chatThreadSource,
  /const isCurrent = \(\) => ownsContext\(\) && activeNativeCallActionRequestKeyRef\.current === requestKey;[\s\S]{0,1400}const invite = await resolveRequestedInvite\(\);\s*if \(!isCurrent\(\)\) return;/u,
  "a hydrated native action must retain its exact request and account/session/thread context",
);
assert.doesNotMatch(
  chatThreadSource,
  /nativeCallActionHandledRef\.current = requestKey;[\s\S]{0,120}let canceled = false/u,
  "an unrelated rerender must not cancel an already claimed native Answer transition",
);
assert.match(rootLayoutSource, /setAlert\(\(current\) => mergeIncomingCallAlert\(current, nextAlert\)\)/u, "database readback hydrates notification-first banners through the stable semantic invite merge");
assert.match(chatThreadSource, /subscribeToChillyChatCallInvite\(visibleInvite\.id/u, "incoming presentation must follow authoritative invite state");
const outgoingReconciliationStart = chatThreadSource.indexOf("const exactOutgoingInvite =");
const outgoingReconciliationEnd = chatThreadSource.indexOf("scheduleReconciliation(timeoutMs)", outgoingReconciliationStart);
assert.ok(outgoingReconciliationStart >= 0 && outgoingReconciliationEnd > outgoingReconciliationStart, "outgoing timeout owns an exact invite and a bounded deadline scheduler");
const outgoingReconciliationBlock = chatThreadSource.slice(outgoingReconciliationStart, outgoingReconciliationEnd);
assert.match(
  outgoingReconciliationBlock,
  /invite\.id === outgoingCallInvite\.id[\s\S]*invite\.threadId === outgoingCallInvite\.threadId[\s\S]*invite\.communicationRoomId === outgoingCallInvite\.communicationRoomId[\s\S]*invite\.callerUserId === currentUserId[\s\S]*invite\.calleeUserId === outgoingCallInvite\.calleeUserId/u,
  "outgoing deadline reconciliation binds the exact invite, thread, room, caller, and callee",
);
assert.match(
  outgoingReconciliationBlock,
  /const latestInvite = await readChillyChatCallInvite\(outgoingCallInvite\.id\)[\s\S]*if \(!isCurrent\(\)\) return;[\s\S]*!exactOutgoingInvite\(latestInvite\)[\s\S]*latestInvite\.status === "accepted"[\s\S]*setActiveCallInvite\(latestInvite\)/u,
  "the caller timeout race must re-read and preserve an invite accepted at the deadline",
);
assert.match(
  outgoingReconciliationBlock,
  /latestInvite\.status !== "ringing" \|\| \(Number\.isFinite\(latestExpiresAt\) && latestExpiresAt > Date\.now\(\)\)[\s\S]*return;[\s\S]*const missedInvite = await updateChillyChatCallInviteStatus[\s\S]*if \(!missedInvite \|\| missedInvite\.status !== "missed" \|\| !exactOutgoingInvite\(missedInvite\)\)[\s\S]*scheduleReconciliation\(ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS\);[\s\S]*return;/u,
  "caller timeout cleanup must require both a fresh ringing read and a confirmed missed transition",
);
assert.match(
  outgoingReconciliationBlock,
  /TERMINAL_CHAT_CALL_INVITE_STATUSES\.has\(latestInvite\.status\)[\s\S]{0,400}finishTerminalInviteCleanup\(latestInvite, ownsContext\)/u,
  "a caller that misses the realtime terminal update clears the stale ringing surface from authoritative terminal truth",
);
assert.doesNotMatch(
  chatThreadSource,
  /outgoingCallTimeoutRef\.current = setTimeout[\s\S]{0,900}updateChillyChatCallInviteStatus\([\s\S]{0,260}\.finally\(/u,
  "a rejected missed transition cannot unconditionally clear an accepted call",
);
assert.match(
  chatThreadSource,
  /const resolvedCallType = activeCallInvite\?\.communicationRoomId === activeCallRoomId\s*\? activeCallInvite\.callType\s*: thread\?\.activeCallType/u,
  "terminal cleanup preserves media kind only for the exact active invite and room",
);
assert.match(
  chatThreadSource,
  /const route = resolveIosChatCallAudioRoute\(resolvedCallType\);[\s\S]{0,160}applyCallAudioRoute\(shouldUseSpeaker, true\)/u,
  "call initialization must select the call-type route through the shared owned route operation",
);
assert.match(
  chatThreadSource,
  /if \(!ownsRoute\(\)\) return;[\s\S]{0,180}setIosNativeCallAudioRoute\(intent\.speaker \? "speaker" : "receiver"\)[\s\S]{0,100}if \(!ownsRoute\(\)\) return;/u,
  "native audio route application and completion must retain current call and route-intent ownership",
);
assert.match(
  liveKitBootstrapSource,
  /installLegacyWebRtcAudioLifecycleShims\([\s\S]{0,180}NativeModules\.WebRTCModule/u,
  "LiveKit bootstrap adapts only missing native audio lifecycle methods before global registration",
);
assert.match(
  liveKitBootstrapSource,
  /autoConfigureAudioSession: Platform\.OS !== "ios"/u,
  "CallKit remains the sole iOS AVAudioSession owner while installed LiveKit surfaces use explicit session activation",
);
assert.match(
  chatThreadSource,
  /const acceptedInvite = currentInvite\.status === "accepted"[\s\S]{0,120}await updateChillyChatCallInviteStatus[\s\S]{0,1100}completeTrustedIosNativeAnswer\(acceptedInvite, \(\) => isAnswerOperationCurrent\(operation\)\)[\s\S]{0,300}applyAcceptedIncomingInviteState\(acceptedInvite\)/u,
  "a server-accepted CallKit answer completes the trusted native orchestrator before accepted media state can publish",
);
assert.match(chatThreadSource, /completeIosAcceptedNativeAnswer\([\s\S]{0,520}completeNative: completeIosNativeCallAnswer/u, "the trusted completion helper delegates to the executable provenance-bound CallKit orchestrator");
const acceptedResumeBlock = chatThreadSource.slice(
  chatThreadSource.indexOf("const resumeAcceptedIncomingInvite = useCallback"),
  chatThreadSource.indexOf("const acceptIncomingInvite = useCallback"),
);
assert.match(
  acceptedResumeBlock,
  /latestInvite\?\.status === "accepted"[\s\S]{0,700}latestThread\?\.activeCommunicationRoomId === roomId/u,
  "an activity-remounted native Answer resumes only an exact accepted invite bound to the thread's active room projection",
);
assert.doesNotMatch(
  acceptedResumeBlock,
  /getCommunicationRoomSnapshot/u,
  "an accepted callee must not require an RLS-hidden room snapshot before its first membership join",
);
const openExistingCallBlock = chatThreadSource.slice(
  chatThreadSource.indexOf("const handleJoinOrCloseCall = useCallback"),
  chatThreadSource.indexOf("useEffect(() => {", chatThreadSource.indexOf("const handleJoinOrCloseCall = useCallback")),
);
assert.doesNotMatch(
  openExistingCallBlock,
  /getCommunicationRoomSnapshot/u,
  "opening an accepted call from its thread must defer room liveness to the membership authority RPC",
);
assert.match(
  openExistingCallBlock,
  /inviteBelongsToCurrentParticipant[\s\S]{0,500}joinInvite\.callerUserId === currentUserId \|\| joinInvite\.calleeUserId === currentUserId/u,
  "opening an existing call remains bound to an exact invite participant",
);
const liveKitInitializeBlock = liveKitChatCallSessionSource.slice(
  liveKitChatCallSessionSource.indexOf("const initialize = async () =>"),
  liveKitChatCallSessionSource.indexOf("const nextMemberships", liveKitChatCallSessionSource.indexOf("const initialize = async () =>")),
);
assert.match(
  liveKitInitializeBlock,
  /for \(let attempt = 0; attempt < 3 && !membership; attempt \+= 1\)/u,
  "LiveKit first membership uses the same bounded authenticated-session retry as the legacy provider",
);
assert.match(
  liveKitInitializeBlock,
  /readCommunicationIdentity\(authenticatedUserId\)/u,
  "LiveKit initialization uses the same exact mounted subject as legacy media",
);
assert.ok(
  liveKitInitializeBlock.includes("joinCommunicationRoomSession")
    && liveKitInitializeBlock.includes("getCommunicationRoomSnapshot"),
  "LiveKit initialization must retain both server membership authority and its post-join room readback",
);
assert.ok(
  liveKitInitializeBlock.indexOf("joinCommunicationRoomSession")
    < liveKitInitializeBlock.indexOf("getCommunicationRoomSnapshot"),
  "LiveKit joins membership before reading its newly authorized room snapshot",
);
const liveKitHeartbeatBlock = liveKitChatCallSessionSource.slice(
  liveKitChatCallSessionSource.indexOf("heartbeat = setInterval"),
  liveKitChatCallSessionSource.indexOf("}, ROOM_HEARTBEAT_MS)", liveKitChatCallSessionSource.indexOf("heartbeat = setInterval")),
);
const liveKitSnapshotRefreshBlock = liveKitChatCallSessionSource.slice(
  liveKitChatCallSessionSource.indexOf("const refreshMembershipSnapshot = async"),
  liveKitChatCallSessionSource.indexOf("const queueMediaSnapshotRefresh"),
);
assert.match(
  liveKitSnapshotRefreshBlock,
  /getCommunicationRoomSnapshot\(binding\.normalizedRoomId\)\.then\([\s\S]{0,100}succeeded: true as const, snapshot[\s\S]{0,120}succeeded: false as const, snapshotError/u,
  "a successful unavailable-room receipt remains distinct from a failed authoritative read",
);
const liveKitFailedSnapshotReadBlock = liveKitSnapshotRefreshBlock.slice(
  liveKitSnapshotRefreshBlock.indexOf("if (!readResult.succeeded)"),
  liveKitSnapshotRefreshBlock.indexOf("const latestSnapshot = readResult.snapshot"),
);
assert.match(
  liveKitFailedSnapshotReadBlock,
  /options\.reconnectingOnReadFailure[\s\S]{0,100}setCommittedRoomState\(binding, "reconnecting"\)[\s\S]{0,100}setChannelState\("reconnecting"\)[\s\S]{0,100}return;/u,
  "a failed LiveKit read optionally enters reconnecting and returns without terminal authority",
);
assert.doesNotMatch(
  liveKitFailedSnapshotReadBlock,
  /cleanupSession|onRoomEndedRef|"terminal"/u,
  "a transport/read failure cannot retire capture or end an accepted invite",
);
assert.match(
  liveKitSnapshotRefreshBlock,
  /!active[\s\S]{0,100}requestSerial !== membershipSnapshotRequestSerial[\s\S]{0,100}!isCommittedSessionCurrent\(binding\)[\s\S]{0,100}return;[\s\S]{0,100}if \(!readResult\.succeeded\)/u,
  "both failed and successful snapshot receipts are fenced by current effect, ordered read, and exact session",
);
assert.match(
  liveKitSnapshotRefreshBlock,
  /const latestSnapshot = readResult\.snapshot;[\s\S]{0,250}!latestSnapshot[\s\S]{0,500}await cleanupSession\(\{ leaveMembership: false \}, binding, cleanupToken\);[\s\S]{0,180}active && sameCommittedAuthority\(committedSessionRef\.current, binding\)[\s\S]{0,100}onRoomEndedRef\.current\?\.\("ended"\)/u,
  "successful unavailable-room readback retires only captured local media before guarded terminal notification, without a durable leave write",
);
assert.match(
  liveKitHeartbeatBlock,
  /refreshMembershipSnapshot\([\s\S]{0,120}reconnectingOnReadFailure: true/u,
  "the LiveKit heartbeat preserves reconnecting on read failure through the shared ordered snapshot reader",
);
const liveKitMountedSnapshotTests = await readFile(new URL("tests/assurance/livekit-chat-call-mic-mounted-hook.test.mjs", root), "utf8");
for (const witness of [
  'for (const outcome of ["null", "terminal"])',
  "server state invalidation retires capture after authoritative ${outcome} readback without callback cleanup",
  "server state invalidation preserves failed cleanup and End retry after ${outcome} readback",
  "server state invalidation read failure preserves the live call and cannot claim terminal state",
  "server state invalidation callback and pending ${outcome} read cannot cross ${retirement}",
  'assert.equal(liveKitRoom.localParticipant.cameraEnabled, false)',
  'assert.equal(liveKitRoom.localParticipant.micEnabled, false)',
  'assert.equal(liveKitRoom.state, "disconnected")',
  'assert.equal(runtime.audioStopCalls, 0)',
]) assert.ok(liveKitMountedSnapshotTests.includes(witness), `mounted LiveKit snapshot authority witness remains required: ${witness}`);
assert.match(
  liveKitChatCallSessionSource,
  /publishData\([\s\S]{0,180}reliable: true, topic: LIVEKIT_MEDIA_INVALIDATION_TOPIC/u,
  "a committed local media change uses the reliable LiveKit data plane for prompt peer invalidation",
);
assert.match(
  liveKitChatCallSessionSource,
  /RoomEvent\.DataReceived[\s\S]{0,620}topic !== LIVEKIT_MEDIA_INVALIDATION_TOPIC[\s\S]{0,620}queuePeerMediaSnapshotRefresh/u,
  "LiveKit media invalidations are topic-bound and trigger only an authoritative membership refresh",
);
assert.match(
  liveKitChatCallSessionSource,
  /const MEDIA_INVALIDATION_REFRESH_INTERVAL_MS = 1_000;/u,
  "peer media invalidations use the reviewed one-second read budget",
);
const liveKitMediaRateLimitBlock = liveKitChatCallSessionSource.slice(
  liveKitChatCallSessionSource.indexOf("const queuePeerMediaSnapshotRefresh"),
  liveKitChatCallSessionSource.indexOf("const subscribeToMembershipState"),
);
assert.match(
  liveKitMediaRateLimitBlock,
  /queueMediaSnapshotRefresh\(scope\)[\s\S]{0,1000}peerMediaRefreshTimer = setTimeout[\s\S]{0,700}queueMediaSnapshotRefresh\(queuedScope\)/u,
  "peer media invalidations retain an immediate refresh while coalescing paced reads",
);
assert.match(
  liveKitChatCallSessionSource,
  /if \(mediaSnapshotRefreshInFlight\)[\s\S]{0,240}mediaSnapshotRefreshQueued = true[\s\S]{0,900}while \(active && isCommittedSessionCurrent\(binding\)\)[\s\S]{0,500}mediaSnapshotRefreshQueuedScope/u,
  "media invalidations received during any active refresh retain a subsequent authoritative read",
);
const liveKitConnectedTransitionBlock = liveKitChatCallSessionSource.slice(
  liveKitChatCallSessionSource.indexOf("const promoteCommittedSessionIfReady"),
  liveKitChatCallSessionSource.indexOf("const enqueueSessionMediaWrite"),
);
assert.match(
  liveKitConnectedTransitionBlock,
  /const waitingForKnownRemote = remoteParticipantSeenRef\.current\s*&& liveKitRoom\.remoteParticipants\.size === 0;[\s\S]{0,260}setChannelState\("reconnecting"\)/u,
  "the shared connected transition cannot report recovery while a previously connected peer remains absent",
);
assert.equal(
  [...liveKitChatCallSessionSource.matchAll(/setChannelState\("live"\)/gu)].length,
  1,
  "every LiveKit connected transition uses the same missing-peer recovery rule",
);
assert.match(
  liveKitHeartbeatBlock,
  /promoteCommittedSessionIfReady\(heartbeatBinding\)/u,
  "the heartbeat uses the shared connected transition",
);
assert.match(
  liveKitChatCallSessionSource,
  /RoomEvent\.ParticipantConnected[\s\S]{0,360}participantBinding\.liveKitRoom !== liveKitRoom[\s\S]{0,360}queueMediaSnapshotRefresh\("chat-call-livekit-participant-connected-snapshot"\)/u,
  "only the exact current peer callback closes a missed initial-media invalidation",
);
assert.match(
  liveKitChatCallSessionSource,
  /await liveKitRoom\.connect[\s\S]{0,220}!active[\s\S]{0,120}!effectBinding[\s\S]{0,160}!isCommittedSessionCurrent\(effectBinding\)[\s\S]{0,220}remoteParticipantSeenRef\.current = true/u,
  "an obsolete connection completion cannot mark a peer seen for a replacement session",
);
assert.match(
  chatThreadSource,
  /invite\.status === "accepted"[\s\S]{0,120}await resumeAcceptedIncomingInvite\(invite\)[\s\S]{0,120}await acceptIncomingInvite\(invite\)/u,
  "native Answer resumes a server-accepted invite instead of attempting a second acceptance",
);
assert.match(
  chatThreadSource,
  /const acceptedActiveInvite = nextThread\?\.activeCommunicationRoomId[\s\S]{0,700}acceptedActiveInvite\?\.status === "accepted"[\s\S]{0,520}acceptedActiveInvite\.calleeUserId === currentUserId/u,
  "thread-state loading rehydrates only the exact server-accepted callee into media after an activity remount",
);
assert.match(
  chatThreadSource,
  /if \(resumableAcceptedInvite && !cleanupPending\) \{\s*applyAcceptedIncomingInviteState\(resumableAcceptedInvite, true\)/u,
  "thread-state loading opens accepted receiver media without another Answer or Join tap",
);
assert.match(
  chatThreadSource,
  /const loadThreadState = useCallback\(async \(\) => \{[\s\S]{0,200}const read = beginThreadRead\(\)[\s\S]{0,140}isThreadReadCurrent\(read\)[\s\S]{0,1250}if \(!isCurrent\(\)\) return;[\s\S]{0,180}reconcileEndedCallState\(loadedThread, isCurrent\)/u,
  "thread-state loading rejects obsolete session/read generations before call reconciliation",
);
const nativeAudioGateStart = chatThreadSource.indexOf("const acceptedNativeAudioDescriptor =");
const nativeAudioGateEnd = chatThreadSource.indexOf("  const {\n    room: callRoom", nativeAudioGateStart);
assert.ok(nativeAudioGateStart >= 0 && nativeAudioGateEnd > nativeAudioGateStart,
  "the current accepted CallKit audio gate is present");
const nativeAudioGateSource = chatThreadSource.slice(nativeAudioGateStart, nativeAudioGateEnd);
assert.match(
  nativeAudioGateSource,
  /const acceptedNativeAudioCallUuid = Platform\.OS === "ios" && isSignedIn\s*&& doesIosAcceptedCallKitMediaDescriptorOwnSession\(\{\s*authenticatedUserId: currentUserId,\s*descriptor: acceptedNativeAudioDescriptor,\s*inviteId: activeCallInvite\?\.id,\s*inviteStatus: activeCallInvite\?\.status,\s*mediaProvider: activeCallInvite\?\.mediaProvider,\s*roomId: activeCallRoomId,\s*threadId,\s*\}\) \? acceptedNativeAudioDescriptor\?\.callUuid \?\? "" : ""/u,
  "accepted CallKit readiness remains bound to the exact signed-in account, invite, provider, room, and thread after the routing claim expires",
);
assert.match(
  nativeAudioGateSource,
  /const activeIosNativeAudioCallUuid = acceptedNativeAudioCallUuid \|\| \(\s*Platform\.OS === "ios" && requestedNativeCallAction === "answer"\s*&& requestedNativeCallOwnsTransition \? requestedNativeCallUuid : ""\s*\);/u,
  "the routing fallback requires the still-owned iOS Answer transition; ordinary foreground calls do not acquire a CallKit gate",
);
assert.match(
  nativeAudioGateSource,
  /const waitingForIosNativeAudioSession = !!activeIosNativeAudioCallUuid\s*&& nativeAudioSessionCallUuid !== activeIosNativeAudioCallUuid;/u,
  "iOS CallKit media waits for activation matching the current accepted or attested Answer UUID",
);
assert.match(
  chatThreadSource,
  /enabled: shouldActivateAcceptedChatCallMedia\(\{[\s\S]{0,220}\}\) && !waitingForIosNativeAudioSession && !iosNativeAnswerRecoveryBlocked/u,
  "accepted media requires native readiness and cannot bypass blocked native recovery",
);
assert.match(
  chatThreadSource,
  /const appliesToActiveCall = !eventCallUuid \|\| eventCallUuid === activeIosNativeAudioCallUuid;\s*if \(!appliesToActiveCall\) return;/u,
  "a different explicit native call UUID cannot release the current call's media gate",
);
assert.match(
  chatThreadSource,
  /if \(event\.type === "audioSessionActivated"\) \{[\s\S]{0,320}setNativeAudioSessionCallUuid\(activeIosNativeAudioCallUuid\)/u,
  "only native audio activation releases the current accepted CallKit media gate",
);
assert.doesNotMatch(
  rootLayoutSource,
  /event\.type === "muted" \|\| event\.type === "unmuted"\)[\s\S]{0,260}routeNativeAction/u,
  "CallKit mute must not navigate to a duplicate chat screen",
);
assert.match(
  rootLayoutSource,
  /event\.type === "answerRequested"\)[\s\S]{0,420}waitForIosNativeCallAnswerRouteReadiness\(event\)[\s\S]{0,420}routeNativeAnswer\(event\)/u,
  "CallKit Answer remains the only native action that opens the accepted media route after stable app readiness",
);
assert.match(
  rootLayoutSource,
  /event\.type === "declined"\)[\s\S]{0,120}settleNativeTerminalAction\(event, "declined"\)/u,
  "CallKit Decline must directly persist the durable declined transition",
);
assert.match(
  nativeCoordinatorSource,
  /requestedReason == nil[\s\S]{0,360}beginTerminalTransitionBackgroundTask\(action\.callUUID\)/u,
  "a background customer CallKit Decline/End must hold a bounded execution lease for its server transition",
);
assert.match(
  nativeCoordinatorSource,
  /UIApplication\.shared\.beginBackgroundTask[\s\S]{0,900}DispatchQueue\.main\.asyncAfter\(deadline: \.now\(\) \+ 15/u,
  "the native terminal execution lease must expire after a bounded interval",
);
const iosTerminalActionSource = rootLayoutSource.match(
  /const settleNativeTerminalAction = async \([\s\S]*?(?=\n    const handleNativeCallEvent = async)/u,
)?.[0] ?? "";
assert.match(
  iosTerminalActionSource,
  /const ownsNativeAction = \(\) => \{[\s\S]*return ownsAuthority\(\) && \(!descriptor \|\| descriptor\.callUuid === callUuid\);/u,
  "native terminal ownership retains both the authenticated bridge and exact presented CallKit UUID",
);
assert.match(
  iosTerminalActionSource,
  /if \(!settled \|\| !ownsNativeAction\(\)\) return false;[\s\S]*await completeIosNativeCallTerminalTransition\(String\(event\.callUuid/u,
  "the authenticated bridge releases the exact native lease only after authoritative settlement and current ownership; statement length is not authority",
);
assert.match(
  iosTerminalActionSource,
  /await updateChillyChatCallInviteStatus\([\s\S]*?status: transitionStatus,[\s\S]*?if \(!ownsNativeAction\(\)\) return false;[\s\S]*?if \(updated\?\.status === transitionStatus\)/u,
  "a delayed terminal transition result is rechecked against the bridge owner before cleanup",
);
assert.match(
  iosTerminalActionSource,
  /const completed = await completeIosNativeCallTerminalTransition[\s\S]*if \(!ownsNativeAction\(\) \|\| !completed\) return false;[\s\S]*pendingNativeTerminalActions\.delete\(actionKey\)/u,
  "a failed native terminal acknowledgement remains available for an owned retry",
);
assert.match(
  rootLayoutSource,
  /event\.type === "ended"[\s\S]{0,260}settleNativeTerminalAction\(event, "ended"\)/u,
  "CallKit End must directly persist the durable ended transition",
);
assert.doesNotMatch(
  rootLayoutSource,
  /routeNativeAction\(event, "(?:decline|end)"\)/u,
  "CallKit terminal actions must not depend on foreground chat navigation",
);
assert.match(
  communicationControlBarSource,
  /accessibilityLabel=\{speakerEnabled \? "Use phone receiver" : "Use speaker"\}/u,
  "the icon-only audio-route control retains an exact accessible action label",
);
assert.doesNotMatch(
  communicationControlBarSource,
  />\{speakerEnabled \? "Speaker On" : "Receiver"\}<\/Text>/u,
  "the audio-route control does not visibly label both participants as Receiver",
);
assert.match(communicationSessionSource, /setLocalMediaKindEnabled\("audio", false\)/u, "mute must preserve the negotiated audio sender");
assert.match(communicationSessionSource, /setLocalMediaKindEnabled\("video", false\)/u, "camera off must preserve the negotiated video sender");
assert.match(
  communicationSessionSource,
  /const createAndSendOffer[\s\S]{0,240}runSerializedPeerOffer/u,
  "generic legacy offers use the shared per-peer serialization boundary",
);
assert.match(
  communicationSessionSource,
  /const strictlyRenegotiateLegacyMicPeer[\s\S]{0,420}runSerializedPeerOffer/u,
  "strict microphone renegotiation uses the same per-peer serialization boundary",
);
const cameraControlSource = communicationSessionSource.slice(
  communicationSessionSource.indexOf("const setCameraCaptureEnabled"),
  communicationSessionSource.indexOf("const toggleCamera"),
);
const microphoneControlSource = communicationSessionSource.slice(
  communicationSessionSource.indexOf("const applyMicrophoneEnabled"),
  communicationSessionSource.indexOf("const toggleMic"),
);
assert.match(microphoneControlSource, /legacyMicControlRef\.current = applyMicrophoneEnabled/u,
  "automatic lifecycle controls use the same serialized microphone transaction");
assert.match(microphoneControlSource,
  /const setMicrophoneEnabled[\s\S]*foregroundMicIntentRevisionRef\.current \+= 1;[\s\S]*return applyMicrophoneEnabled\(nextEnabled, requestedCameraOverride\)/u,
  "explicit microphone controls supersede old intent and delegate to the verified transaction");
assert.doesNotMatch(cameraControlSource, /stopLocalMediaKind/u, "camera controls must not stop a negotiated sender");
assert.equal(
  (cameraControlSource.match(/updatePresence\(/gu) ?? []).length,
  1,
  "camera permission failure has one bounded fallback presence write",
);
assert.match(cameraControlSource, /strictlyCommitLegacyMicPresence/u, "camera success requires exact durable membership readback");
assert.match(cameraControlSource, /strictlyBroadcastLegacyMicState/u, "camera success requires exact server-relayed media broadcast");
assert.match(cameraControlSource, /presenceCommit\.ok && broadcastCommit\.ok/u, "camera success is atomic across durable and Realtime state");
assert.equal(
  (microphoneControlSource.match(/updatePresence\(/gu) ?? []).length,
  2,
  "microphone control has one mutually exclusive presence write for success and permission failure",
);
assert.doesNotMatch(cameraControlSource, /refreshSnapshot/u, "camera toggles do not create an extra snapshot/read loop");
assert.doesNotMatch(microphoneControlSource, /refreshSnapshot/u, "microphone toggles do not create an extra snapshot/read loop");
assert.match(cameraControlSource, /runSerializedMediaControl/u, "camera changes are serialized");
assert.match(microphoneControlSource, /runSerializedMediaControl/u, "microphone changes are serialized");
assert.doesNotMatch(
  communicationSessionSource,
  /!cameraEnabled && !micEnabled[\s\S]{0,120}pauseLocalMediaCapture/u,
  "muting a voice call while its camera is off must not tear down the media session",
);
assert.match(
  chatThreadSource,
  /enabled: shouldActivateAcceptedChatCallMedia\(\{[\s\S]{0,140}inviteStatus: activeCallInvite\?\.status/u,
  "media activation must use the durable accepted-invite gate",
);
assert.match(
  chatThreadSource,
  /const activeCallRoomId = activeCallInvite && TERMINAL_CHAT_CALL_INVITE_STATUSES\.has\(activeCallInvite\.status\)\s*\? activeCallInvite\.communicationRoomId \?\? ""\s*: resolveAcceptedChatCallRoomId\(\{\s*inviteRoomId: activeCallInvite\?\.communicationRoomId/u,
  "accepted-invite room authority must survive a stale empty thread refresh",
);
assert.match(
  chatThreadSource,
  /setCallPanelOpen\(\(wasOpen\) => shouldKeepAcceptedChatCallPanelOpen\(\{[\s\S]{0,260}activeCallInviteRef\.current\?\.communicationRoomId/u,
  "an accepted call panel must remain mounted while its immutable invite room is active",
);
assert.doesNotMatch(
  chatThreadSource.slice(
    chatThreadSource.indexOf("useCommunicationRoomSession({"),
    chatThreadSource.indexOf("analyticsContext:", chatThreadSource.indexOf("useCommunicationRoomSession({")),
  ),
  /outgoingCallInvite\?\.status === "ringing"/u,
  "ringing state must never activate camera, microphone, or WebRTC signaling",
);
assert.match(
  chatThreadSource,
  /showMediaControls=\{activeCallInvite\?\.status === "accepted" && !outgoingCallRinging && !callError && !callLoading\}/u,
  "mic and camera controls stay hidden until the receiver accepts",
);
assert.match(
  inRoomPanelSource,
  /!!selfParticipant\?\.streamURL[\s\S]{0,120}\|\| !!selfParticipant\?\.liveKitVideoTrackReference/u,
  "the camera control treats a rendered LiveKit local track as Camera On",
);
assert.match(
  inRoomPanelSource,
  /const controlsVisible = showControls;/u,
  "the End or Cancel control remains visible while media is connecting or failed",
);
assert.match(
  inRoomPanelSource,
  /const mediaControlsVisible = showMediaControls && !loading && !statusMessage;/u,
  "camera, microphone, route, and flip controls remain gated on media readiness",
);
assert.match(
  chatThreadSource,
  /showControls=\{outgoingCallRinging \|\| activeCallInvite\?\.status === "accepted" \|\| TERMINAL_CHAT_CALL_INVITE_STATUSES\.has\(activeCallInvite\?\.status \?\? ""\)\}/u,
  "accepted callers can always end a call even when LiveKit is not ready",
);
for (const permanentTestId of [
  "communication-camera-toggle",
  "communication-camera-flip",
  "communication-microphone-toggle",
  "communication-audio-route-toggle",
  "communication-call-end",
]) {
  assert.match(
    communicationControlBarSource,
    new RegExp(`testID="${permanentTestId}"`, "u"),
    `the physical call matrix has a permanent ${permanentTestId} control target`,
  );
}
for (const permanentSurfaceId of [
  "communication-call-panel",
  "communication-call-connection-status",
  "communication-media-control-message",
]) {
  assert.match(
    inRoomPanelSource,
    new RegExp(`testID="${permanentSurfaceId}"`, "u"),
    `the physical call matrix has a permanent ${permanentSurfaceId} surface target`,
  );
}
assert.match(
  chatThreadSource,
  /mediaControlMessage=\{callControlError \?\? mediaControlError\}/u,
  "call-control failures remain visible inside the fullscreen call surface",
);
assert.match(
  inRoomPanelSource,
  /\{mediaControlMessage\}/u,
  "the fullscreen panel renders the exact media-control failure text without replacing the call",
);
assert.match(
  chatThreadSource,
  /const nativeControlUpdated = await setIosNativeCallMuted[\s\S]{0,500}setCallControlError\(message\)/u,
  "an in-app microphone commit cannot silently diverge from the iOS native call control",
);
assert.match(
  chatThreadSource,
  /action === "mute" \|\| action === "unmute"[\s\S]{0,500}const updated = await setMicrophoneEnabled[\s\S]{0,500}setCallControlError\(message\)/u,
  "a trusted native microphone action cannot silently fail after claim consumption",
);
for (const permanentVideoId of [
  "communication-participant-self",
  "communication-participant-remote",
  "communication-video-self",
  "communication-video-remote",
]) {
  assert.match(
    communicationParticipantGridSource,
    new RegExp(`"${permanentVideoId}"`, "u"),
    `the physical call matrix has a permanent ${permanentVideoId} render target`,
  );
}
assert.match(
  liveKitChatCallSessionSource,
  /TrackSubscribed[\s\S]{0,320}track\.kind === Track\.Kind\.Audio[\s\S]{0,320}setSpeaker\(speakerRequestedRef\.current, effectBinding\)/u,
  "a subscribed remote audio track reasserts the platform audio session and video speaker route for its exact session",
);
assert.match(
  liveKitChatCallSessionSource,
  /local_video_published[\s\S]{0,260}await setSpeaker\(speakerRequestedRef\.current, binding\)/u,
  "camera publication cannot leave the exact video session on a stale audio route",
);
assert.match(
  liveKitChatCallSessionSource,
  /const setMicrophoneEnabled[\s\S]{0,420}if \(nextEnabled\)[\s\S]{0,180}startCallAudioSession\(binding\)/u,
  "turning the microphone back on restores the native audio session before capture",
);
assert.match(
  liveKitChatCallSessionSource,
  /const setCameraEnabled[\s\S]{0,720}local_video_published[\s\S]{0,220}await setSpeaker\(speakerRequestedRef\.current, binding\)/u,
  "turning the camera back on preserves the selected audio output",
);
assert.match(
  liveKitChatCallSessionSource,
  /const toggleCamera[\s\S]{0,420}if \(!updated\)[\s\S]{0,180}return false;[\s\S]{0,120}return true;/u,
  "the LiveKit camera toggle reports whether capture actually changed",
);
assert.match(
  chatThreadSource,
  /const handleSwitchCallCamera[\s\S]{0,240}const updated = await switchCamera\(\)[\s\S]{0,180}if \(!updated\)/u,
  "camera flip failure is surfaced instead of becoming an unhandled no-op",
);
assert.match(
  chatThreadSource,
  /The audio output could not be changed\. The call remains connected\./u,
  "audio-route failure is visible without ending the call",
);
assert.match(
  liveKitChatCallSessionSource,
  /if \(nextState === "active"\)[\s\S]{0,260}startCallAudioSession\(binding\)[\s\S]{0,420}setSpeaker\(speakerRequestedRef\.current\)/u,
  "foreground recovery restores capture and the last selected audio output",
);
assert.match(
  liveKitChatCallSessionSource,
  /const startCallAudioSession[\s\S]{0,280}if \(!committedSessionOwnsCurrentRoom\(binding\) \|\| !binding\?\.liveKitRoom\)[\s\S]{0,700}await owner\.start\(\);[\s\S]{0,160}if \(!committedSessionOwnsCurrentRoom\(binding\)\)/u,
  "Android audio startup must retain the exact admitted room owner before and after native activation",
);
const legacyAppStateBlock = communicationSessionSource.slice(
  communicationSessionSource.indexOf("const handleAppStateLifecycleChange"),
  communicationSessionSource.indexOf("appStateLifecycleHandlerRef.current", communicationSessionSource.indexOf("const handleAppStateLifecycleChange")),
);
const foregroundMediaRestoreSource = communicationSessionSource.slice(
  communicationSessionSource.indexOf("const restoreLocalMediaAfterForeground"),
  communicationSessionSource.indexOf("useEffect(() =>", communicationSessionSource.indexOf("const restoreLocalMediaAfterForeground")),
);
const preservesVideoForegroundRecovery = (source) => (
  /nextCameraEnabled[\s\S]{0,500}ensureTrackKind\("video", \{[\s\S]{0,140}attachToPeers: false,[\s\S]{0,140}expectedGeneration: generation,[\s\S]{0,260}if \(!restoredCameraTrack\)[\s\S]{0,180}setCameraEnabled\(false\)[\s\S]{0,120}return false;/u.test(source)
  && source.includes("attachMissingLocalTracks(peerConnection, false, generation)")
  && source.indexOf("renegotiateAllPeers(true)") > source.indexOf("attachMissingLocalTracks(peerConnection, false, generation)")
  && source.includes("sender.track === restoredCameraTrack")
  && !/nextCameraEnabled[\s\S]{0,260}ensureInitialLocalStream\(false\)/u.test(source)
);
const trackKindRecoverySource = communicationSessionSource.slice(
  communicationSessionSource.indexOf("const ensureTrackKind"),
  communicationSessionSource.indexOf("const restoreLocalMediaAfterForeground"),
);
const preservesGenerationBoundTrackRecovery = (source) => (
  /expectedGeneration = options\?\.expectedGeneration \?\? legacySessionGenerationRef\.current/u.test(source)
  && /expectedPeerConnections = Object\.values\(peerConnectionsRef\.current\)/u.test(source)
  && /!isExpectedGenerationCurrent\(\) \|\| localStreamRef\.current !== expectedLocalStream[\s\S]{0,160}acquisition\?\.reservation\.retire\(\)/u.test(source)
  && /for \(const peerConnection of expectedPeerConnections\)[\s\S]{0,120}if \(!isExpectedGenerationCurrent\(\)\)/u.test(source)
);
assert.equal(
  preservesVideoForegroundRecovery(foregroundMediaRestoreSource),
  true,
  "foreground and native-answer recovery reacquires the missing video track when background audio kept the original stream alive",
);
assert.equal(
  preservesVideoForegroundRecovery(
    foregroundMediaRestoreSource.replace('ensureTrackKind("video", {', "ensureInitialLocalStream(false); void ({"),
  ),
  false,
  "the regression guard kills the audio-only early-return mutant that drops video after background or CallKit Answer",
);
assert.equal(
  preservesVideoForegroundRecovery(
    foregroundMediaRestoreSource.replace("attachMissingLocalTracks(peerConnection, false, generation)", "attachMissingLocalTracks(peerConnection, false)"),
  ),
  false,
  "the regression guard rejects foreground attachment without its captured call generation",
);
assert.equal(
  preservesVideoForegroundRecovery(foregroundMediaRestoreSource.replace("sender.track === restoredCameraTrack", "true")),
  false,
  "the regression guard rejects successful foreground recovery without sender readback",
);
assert.equal(
  preservesGenerationBoundTrackRecovery(trackKindRecoverySource),
  true,
  "async media recovery binds capture and peer attachment to the exact accepted-call generation",
);
assert.equal(
  preservesGenerationBoundTrackRecovery(
    trackKindRecoverySource.replace("if (!isExpectedGenerationCurrent() || localStreamRef.current !== expectedLocalStream)", "if (false)"),
  ),
  false,
  "the regression guard kills the stale-generation media-attachment mutant",
);
assert.equal(
  preservesGenerationBoundTrackRecovery(trackKindRecoverySource.replaceAll("acquisition?.reservation.retire()", "void 0")),
  false,
  "retired acquisition disposal must remain owned for failure and explicit retry",
);
assert.match(
  legacyAppStateBlock,
  /nativePermissionRequestDepthRef\.current > 0[\s\S]{0,160}return;/u,
  "app-owned media permission UI cannot masquerade as a real call background transition",
);
assert.match(
  legacyAppStateBlock,
  /nextState === "active"[\s\S]{0,1200}restartDisconnectedSession && \(channelStateRef\.current === "reconnecting" \|\| !channelRef\.current\)[\s\S]{0,240}requestLegacySessionRestart\("app_foreground"\)/u,
  "legacy foreground recovery rebuilds a backgrounded or closed same-room session",
);
assert.match(
  communicationSessionSource,
  /legacySessionRestartSerial,\s*requestLegacySessionRestart,\s*runSerializedMediaControl,[\s\S]{0,240}\]\);/u,
  "legacy initialization observes both foreground recovery and ownership-bound media serialization",
);
const legacyRealtimeFailureStart = communicationSessionSource.indexOf('if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")');
const legacyRealtimeFailureBlock = communicationSessionSource.slice(
  legacyRealtimeFailureStart,
  communicationSessionSource.indexOf("if (!reconnectTrackedRef.current)", legacyRealtimeFailureStart),
);
assert.match(legacyRealtimeFailureBlock, /presenceRegistrationRef\.current\.subscribed = false/u,
  "Realtime terminal/error states immediately revoke the current subscription receipt");
assert.match(legacyRealtimeFailureBlock,
  /requestLegacySessionRestart\(status === "CHANNEL_ERROR"\s*\? "realtime_error"\s*: status === "TIMED_OUT"\s*\? "realtime_timeout"\s*: "realtime_closed", sessionGeneration\)/u,
  "every Realtime terminal/error status rebuilds the exact-generation transport instead of only changing UI state");
assert.match(communicationSessionSource, /mappedState === "failed"\) requestLegacySessionRestart\("peer_failed", generation\)[\s\S]{0,140}mappedState === "disconnected"\) requestLegacySessionRestart\("peer_disconnected", generation\)/u, "peer failures enter the same generation-bound recovery supervisor");
const activeInviteReconciliationSource = chatThreadSource.slice(
  chatThreadSource.indexOf("const reconcileActiveInvite"),
  chatThreadSource.indexOf("const otherMember ="),
);
assert.match(
  activeInviteReconciliationSource,
  /subscribeToChillyChatCallInvite\(inviteId/u,
  "both call participants must subscribe to terminal invite state",
);
assert.match(
  activeInviteReconciliationSource,
  /terminalReconciliationInterval = setInterval\([\s\S]{0,220}reconcileActiveInvite\(\)[\s\S]{0,220}ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS/u,
  "accepted calls must reconcile terminal invite truth when Realtime reconnects without replaying the terminal update",
);
assert.match(
  activeInviteReconciliationSource,
  /clearInterval\(terminalReconciliationInterval\)/u,
  "terminal invite fallback polling must stop with the accepted-call subscription",
);
assert.match(
  activeInviteReconciliationSource,
  /finishTerminalInviteCleanup\(latestInvite, ownsContext, `invite_\$\{latestInvite\.status\}`\)/u,
  "remote terminal invite state enters the exact owned native/media cleanup operation",
);
assert.match(
  chatThreadSource,
  /leaveLabel=\{outgoingCallRinging \? "Cancel Call" : "End Call"\}/u,
  "ringing callers can cancel and accepted participants can end the call",
);
assert.match(inRoomPanelSource, /leaveLabel \?\? \(isHost \? "End Call" : "Leave"\)/u, "room surfaces retain their host/participant label policy");
assert.match(
  chatThreadSource,
  /Call is still connected\. Tap Open Call to return\./u,
  "Back to Thread must truthfully tell the user that the call remains connected",
);
assert.match(retryWorkerSource, /"x-chillywood-retry-token": retryToken/u, "retry worker must use the dedicated Vault-held token across functions");
assert.doesNotMatch(
  retryWorkerSource,
  /Authorization: `Bearer \$\{serviceRoleKey\}`/u,
  "retry worker must not use the database service-role key as a cross-function bearer token",
);
assert.match(dispatchSource, /authorize_chilly_chat_call_transition_retry/u, "dispatcher must verify retry authorization before terminal delivery");
assert.doesNotMatch(iosVoipDispatchSource, /authorize_chilly_chat_call_transition_retry/u, "VoIP dispatcher must never receive terminal retry work");
assert.match(
  dispatchSource,
  /if \(action === "missed"\) \{\s*if \(status !== "missed"\)/u,
  "missed dispatch requires the durable transition to finish first",
);

const gate = visibleReadGate.createBoundedVisibleReadGate();
assert.equal(gate.shouldRun(true), true, "first sheet opening may read the provider once");
for (let index = 0; index < 25; index += 1) {
  assert.equal(gate.shouldRun(true), false, "rerenders during one opening cannot repeat the provider read");
}
assert.equal(gate.shouldRun(false), false);
assert.equal(gate.shouldRun(true), true, "a later sheet opening may perform one new provider read");
const tipSheetSource = await readFile(new URL("components/monetization/tip-sheet.tsx", root), "utf8");
assert.match(tipSheetSource, /\}, \[iosProductIdSignature, visible\]\);/u);
assert.match(tipSheetSource, /setIosProductPriceLabels\(\(current\) =>/u);
assert.doesNotMatch(tipSheetSource, /readRevenueCatNonSubscriptionProducts\([\s\S]{0,120}iosTipOptions/u);

const copyChannel = (pushSent, presentationAcknowledged = false) => ({
  ...createChillyChatCallChannelResult(),
  presentationAcknowledged,
  pushSent,
});
const deliveryFixture = (channels) => ({
  channels: {
    androidNative: copyChannel(false),
    iosVoip: copyChannel(false),
    ordinaryPush: copyChannel(false),
    inAppNotification: copyChannel(false),
    ...channels,
  },
  notificationCreated: false,
  pushSent: true,
  status: "sent",
});
assert.equal(deliveryCopy.getChillyChatCallDeliveryMessage(deliveryFixture({ androidNative: copyChannel(true) })), "Android call alert sent.");
assert.equal(deliveryCopy.getChillyChatCallDeliveryMessage(deliveryFixture({ iosVoip: copyChannel(true, true) })), "Native iPhone call alert presented.");
assert.equal(deliveryCopy.getChillyChatCallDeliveryMessage(deliveryFixture({ ordinaryPush: copyChannel(true) })), "Push notification sent.");
assert.equal(deliveryCopy.getChillyChatCallDeliveryMessage(deliveryFixture({
  androidNative: copyChannel(true),
  iosVoip: copyChannel(true, true),
})), "Call alert sent through available device channels.");
const inAppOnlyDelivery = {
  ...deliveryFixture({}),
  notificationCreated: true,
  pushSent: false,
  status: "created",
};
assert.equal(
  deliveryCopy.getChillyChatCallDeliveryMessage(inAppOnlyDelivery),
  "Call invite saved for in-app delivery. No recipient device alert was confirmed.",
  "creating a database notification cannot be presented as receiver delivery",
);
assert.equal(deliveryCopy.isChillyChatCallDeviceAlertConfirmed(inAppOnlyDelivery), false);
assert.equal(deliveryCopy.isChillyChatCallDeviceAlertConfirmed(deliveryFixture({ iosVoip: copyChannel(true, true) })), true);
const providerAcceptedOnly = deliveryFixture({ iosVoip: copyChannel(true, false) });
providerAcceptedOnly.pushSent = false;
providerAcceptedOnly.status = "created";
providerAcceptedOnly.notificationCreated = true;
assert.equal(deliveryCopy.isChillyChatCallDeviceAlertConfirmed(providerAcceptedOnly), false);
assert.equal(
  deliveryCopy.getChillyChatCallDeliveryMessage(providerAcceptedOnly),
  "Call invite saved for in-app delivery. No recipient device alert was confirmed.",
  "APNs acceptance alone must never be customer-visible ringing confirmation",
);
assert.doesNotMatch(chatThreadSource, /\bis being notified\b/u, "the caller UI cannot imply receiver delivery before a device channel confirms it");
assert.match(chatThreadSource, /outgoingDeviceAlertConfirmed/u, "the ringing label must be bound to confirmed device-alert dispatch");
assert.match(chatThreadSource, /statusLabelOverride=\{outgoingCallRinging \? outgoingDeviceAlertConfirmed \? "Ringing" : "Calling" : null\}/u);
assert.ok(
  dispatchSource.indexOf("const iosVoip = await iosVoipPromise")
    < dispatchSource.indexOf("resolveChillyChatOrdinaryPushFallbackPolicy({"),
  "the ordinary iOS fallback decision must use the completed PushKit result",
);
assert.match(dispatchSource, /interruptionLevel: input\.action === "incoming" \? "time-sensitive" : "active"/u);
assert.match(notificationsSource, /setNotificationCategoryAsync\(IOS_INCOMING_CALL_NOTIFICATION_CATEGORY_ID/u);

console.log("Chi'lly Chat schema, token, preference, terminal, delivery-copy, and bounded tip-read fixtures passed.");
