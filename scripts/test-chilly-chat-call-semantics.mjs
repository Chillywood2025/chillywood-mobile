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
  summarizeChillyChatCallDispatch,
} from "../supabase/functions/_shared/chilly-chat-call-dispatch-policy.mjs";
import {
  buildIosVoipApnsPayload,
  isApnsInvalidVoipTokenReason,
} from "../supabase/functions/_shared/ios-voip-policy.mjs";
import {
  canAttemptNativeCallBackgroundAudio,
  doesNativeCallActionOwnTransition,
  resolveAcceptedChatCallRoomId,
  resolveChillyChatCallParticipantRole,
  resolveIncomingCallPresentation,
  resolveIncomingCallRoomJoinAction,
  resolveIosChatCallAudioRoute,
  setActiveCommunicationTracksEnabled,
  shouldActivateAcceptedChatCallMedia,
  shouldKeepAcceptedChatCallPanelOpen,
  shouldPreserveNativeCallBackgroundAudio,
  shouldShowOutgoingRingingPanel,
} from "../_lib/communicationCallMediaPolicy.mjs";
import {
  createChillyChatNativeCallRouteBuffer,
  redirectChillyChatNativeCallSystemPath,
  resolveChillyChatNativeCallActionPayload,
  resolveChillyChatNativeCallRoute,
} from "../_lib/chillyChatNativeCallRoutes.mjs";
import {createNativeCallTransitionProvenanceRegistry} from "../_lib/nativeCallTransitionProvenance.mjs";
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
    destination:
      `/chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer&openCall=1`,
    requestKey: `${nativeRouteThreadId}:${nativeRouteInviteId}:answer`,
  },
  "a terminated Android native Answer is replayed into the exact authenticated call route",
);
assert.deepEqual(
  resolveChillyChatNativeCallRoute(
    `chillywoodmobile:///chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=decline`,
  ),
  {
    destination:
      `/chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=decline`,
    requestKey: `${nativeRouteThreadId}:${nativeRouteInviteId}:decline`,
  },
  "a cold-start native Decline is replayed without acquiring call media",
);
assert.equal(
  resolveChillyChatNativeCallRoute(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=incoming`,
  ),
  null,
  "ordinary notification opens cannot be upgraded into authoritative native actions",
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
    createdAt: 1_722_000_000_000,
    nativeCallAction: "ANSWER",
    requestKey: "a".repeat(64),
    schemaVersion: 1,
    threadId: nativeRouteThreadId.toUpperCase(),
  }),
  {
    destination:
      `/chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer&openCall=1`,
    requestKey: `${nativeRouteThreadId}:${nativeRouteInviteId}:answer`,
  },
  "the one-time native store payload is independently normalized before authenticated routing",
);
assert.equal(
  resolveChillyChatNativeCallActionPayload({
    callInviteId: nativeRouteInviteId,
    createdAt: 1_722_000_000_000,
    nativeCallAction: "incoming",
    requestKey: "b".repeat(64),
    schemaVersion: 1,
    threadId: nativeRouteThreadId,
  }),
  null,
  "the one-time native store cannot elevate an ordinary incoming-open action",
);
assert.equal(
  resolveChillyChatNativeCallActionPayload({
    access_token: "forbidden",
    callInviteId: nativeRouteInviteId,
    createdAt: 1_722_000_000_000,
    nativeCallAction: "answer",
    requestKey: "c".repeat(64),
    schemaVersion: 1,
    threadId: "not-a-thread",
  }),
  null,
  "malformed native-store identities are rejected without inspecting credential-shaped fields",
);
assert.equal(
  resolveChillyChatNativeCallActionPayload({
    callInviteId: nativeRouteInviteId,
    createdAt: 1_722_000_000_000,
    nativeCallAction: "decline",
    requestKey: "not-a-hash",
    schemaVersion: 1,
    threadId: nativeRouteThreadId,
  }),
  null,
  "native-store payloads require the bounded native request-key hash contract",
);
assert.equal(
  redirectChillyChatNativeCallSystemPath(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer&openCall=1`,
  ),
  `/chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer&openCall=1`,
  "Expo Router rewrites a terminated Android Answer before caching its initial route",
);
assert.equal(
  redirectChillyChatNativeCallSystemPath(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=decline`,
  ),
  `/chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=decline`,
  "Expo Router rewrites a terminated Android Decline without adding media intent",
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
  "a valid Answer arriving before the authenticated bridge is retained",
);
const unsubscribeEarlyNativeCallRoutes = earlyNativeCallRouteBuffer.subscribe(
  (route) => bufferedNativeCallRoutes.push(route),
);
assert.deepEqual(
  bufferedNativeCallRoutes,
  [{
    destination:
      `/chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=answer&openCall=1`,
    requestKey: `${nativeRouteThreadId}:${nativeRouteInviteId}:answer`,
  }],
  "the authenticated bridge receives the exact retained Answer once",
);
assert.equal(
  earlyNativeCallRouteBuffer.capture(
    `chillywoodmobile://chat/${nativeRouteThreadId}?callInviteId=${nativeRouteInviteId}&nativeCallAction=decline`,
  ),
  true,
  "a valid live Decline reaches the mounted bridge",
);
assert.equal(
  bufferedNativeCallRoutes.at(-1)?.requestKey,
  `${nativeRouteThreadId}:${nativeRouteInviteId}:decline`,
  "the mounted bridge receives the exact live Decline action",
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

const fixtureCases = [
  ["android_native_only", { androidNative: sent("fcm_sent") }, true, "sent"],
  ["ios_voip_only", { iosVoip: sent("apns_voip_sent") }, true, "sent"],
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
    iosVoip: sent("apns_voip_sent"),
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

const tokenFixtures = [
  ["voip_token_only", { iosVoip: sent() }, "iosVoip"],
  ["expo_token_only", { ordinaryPush: sent() }, "ordinaryPush"],
  ["fcm_token_only", { androidNative: sent() }, "androidNative"],
  ["all_token_types", { androidNative: sent(), iosVoip: sent(), ordinaryPush: sent() }, "iosVoip"],
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
  alreadyOnSameThread: true,
  nativeCallPresentationOwned: true,
}), "native_ios", "CallKit ownership suppresses the duplicate React incoming-call banner");

const actionScope = {
  callInviteId: "11111111-1111-4111-8111-111111111111",
  callType: "video",
  callerName: "Caller",
  expiresAt: "2026-07-16T12:00:00.000Z",
  notificationChannelId: "chilly_chat_calls_fullscreen_v1",
  notificationId: "notification-id",
  path: "/chat/22222222-2222-4222-8222-222222222222",
  threadId: "22222222-2222-4222-8222-222222222222",
};

assert.match(buildChillyChatCallPresentationCopy({ ...actionScope, action: "incoming" }).title, /^Incoming/u);
assert.match(buildChillyChatCallPresentationCopy({ ...actionScope, action: "missed" }).title, /^Missed/u);
const incomingVoipData = buildIosVoipApnsPayload({ ...actionScope, action: "incoming" });
assert.equal(incomingVoipData.action, "incoming");
assert.equal(incomingVoipData.callUuid, actionScope.callInviteId);
assert.equal(incomingVoipData.callInviteId, actionScope.callInviteId);
assert.equal(incomingVoipData.threadId, actionScope.threadId);
assert.equal(incomingVoipData.expiresAt, actionScope.expiresAt);
assert.equal(incomingVoipData.callType, actionScope.callType);

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
const nativeCoordinatorSource = await readFile(
  new URL("modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift", root),
  "utf8",
);
const chatThreadSource = await readFile(new URL("app/chat/[threadId].tsx", root), "utf8");
const rootLayoutSource = await readFile(new URL("app/_layout.tsx", root), "utf8");
const chatLibSource = await readFile(new URL("_lib/chat.ts", root), "utf8");
const authoritativeBusyBeginSource = await readFile(
  new URL("supabase/migrations/20260730040727_chilly_chat_busy_active_thread_guard.sql", root),
  "utf8",
);
const iosNativeCallsSource = await readFile(new URL("_lib/iosNativeCalls.ts", root), "utf8");
const liveKitBootstrapSource = await readFile(new URL("_lib/livekit/bootstrap.ts", root), "utf8");
const communicationSessionSource = await readFile(new URL("hooks/use-communication-room-session.ts", root), "utf8");
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
assert.match(voipSource, /\.eq\("enabled", true\)[\s\S]*\.is\("revoked_at", null\)/u);
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
  /incomingCallInvite[\s\S]{0,160}!callPanelOpen[\s\S]{0,160}!iosNativeCallPresentationOwned[\s\S]{0,160}!waitingForIosNativePresentation/u,
  "the same-thread React banner is hidden when CallKit owns iOS presentation",
);
assert.match(
  chatThreadSource,
  /leaveLabel=\{outgoingCallRinging \? "Cancel Call" : "End Call"\}/u,
  "a ringing caller receives an explicit cancel-call action",
);
assert.match(
  chatThreadSource,
  /showControls=\{outgoingCallRinging \|\| activeCallInvite\?\.status === "accepted"\}/u,
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
assert.match(
  rootLayoutSource,
  /function AndroidNativeCallRouteBridge\(\)[\s\S]{0,3000}Linking\.getInitialURL\(\)[\s\S]{0,180}captureNativeCallRoute/u,
  "terminated Android native actions must be captured from the Activity initial URL before the authenticated navigator mounts",
);
assert.match(
  rootLayoutSource,
  /function AndroidNativeCallRouteBridge\(\)[\s\S]{0,7000}\|\| isLoading[\s\S]{0,120}\|\| !isSignedIn[\s\S]{0,120}\|\| !pendingNativeCallRoute[\s\S]{0,1200}router\.replace/u,
  "cold-start native actions must wait for the authenticated session before deterministic routing",
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
    "iOS incoming-call surfaces suppress fallback only for an exact native-presented invite",
  );
  assert.match(
    nativePresentationOwnerSource,
    /\|\| iosNativeCallPresentationOwned\s+\|\| waitingForIosNativePresentation[\s\S]{0,1200}playChillyChatCallSound/u,
    "iOS in-app ringtone and vibration wait for exact CallKit presentation ownership and bounded fallback grace",
  );
}
assert.match(iosNativeCallsSource, /const nativePresentedInviteIds = new Set<string>\(\)/u, "native presentation ownership is tracked per invite");
assert.match(iosNativeCallsSource, /event\.type === "incoming" \|\| event\.type === "recovered"/u, "only confirmed native incoming/recovered events acquire presentation ownership");
assert.match(iosNativeCallsSource, /"reportFailed"/u, "failed CallKit reporting releases fallback presentation ownership");
assert.doesNotMatch(rootLayoutSource, /<Modal/u, "background/full-screen presentation remains native rather than a React modal");
assert.match(rootLayoutSource, /presentation === "native_background"/u, "background state defers to native CallStyle or CallKit");
assert.match(rootLayoutSource, /presentation === "native_ios"/u, "CallKit ownership suppresses the duplicate app-wide React banner");
assert.doesNotMatch(rootLayoutSource, /nativeCallAction:\s*"answer"/u, "CallKit and foreground routes never carry authoritative action text");
assert.match(rootLayoutSource, /createIosCallKitAnswerRouteHandler/u, "CallKit Answer uses the canonical bridge-auth-router provenance handler");
assert.match(rootLayoutSource, /await updateChillyChatCallInviteStatus[\s\S]{0,500}status:\s*"accepted"/u, "foreground Answer requests the server-authoritative transition directly");
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
  /const invite = await resolveRequestedInvite\(\);[\s\S]{0,160}activeNativeCallActionRequestKeyRef\.current !== requestKey/u,
  "a hydrated native action must be invalidated only when its exact request changes",
);
assert.doesNotMatch(
  chatThreadSource,
  /nativeCallActionHandledRef\.current = requestKey;[\s\S]{0,120}let canceled = false/u,
  "an unrelated rerender must not cancel an already claimed native Answer transition",
);
assert.match(rootLayoutSource, /current\?\.invite \? current : current \? \{ \.\.\.current, \.\.\.nextAlert \} : nextAlert/u, "database readback must hydrate a notification-first banner before Decline");
assert.match(chatThreadSource, /subscribeToChillyChatCallInvite\(visibleInvite\.id/u, "incoming presentation must follow authoritative invite state");
assert.match(
  chatThreadSource,
  /const latestInvite = await readChillyChatCallInvite\(outgoingCallInvite\.id\)[\s\S]{0,320}latestInvite\?\.status === "accepted"[\s\S]{0,320}setActiveCallInvite\(latestInvite\)/u,
  "the caller timeout race must re-read and preserve an invite accepted at the deadline",
);
assert.match(
  chatThreadSource,
  /if \(!latestInvite \|\| latestInvite\.status !== "ringing"\) return;[\s\S]{0,420}const missedInvite = await updateChillyChatCallInviteStatus[\s\S]{0,420}if \(!missedInvite \|\| missedInvite\.status !== "missed"\) return;/u,
  "caller timeout cleanup must require both a fresh ringing read and a confirmed missed transition",
);
assert.doesNotMatch(
  chatThreadSource,
  /outgoingCallTimeoutRef\.current = setTimeout[\s\S]{0,900}updateChillyChatCallInviteStatus\([\s\S]{0,260}\.finally\(/u,
  "a rejected missed transition cannot unconditionally clear an accepted call",
);
assert.match(chatThreadSource, /setIosNativeCallAudioRoute\(route\)/u, "iOS chat calls must apply the call-type audio route");
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
  /const acceptedInvite = await updateChillyChatCallInviteStatus[\s\S]{0,620}completeTrustedIosNativeAnswer\(acceptedInvite\)[\s\S]{0,260}applyAcceptedIncomingInviteState\(acceptedInvite\)/u,
  "a server-accepted CallKit answer completes the trusted native orchestrator before accepted media state can publish",
);
assert.match(chatThreadSource, /completeIosAcceptedNativeAnswer\([\s\S]{0,520}completeNative: completeIosNativeCallAnswer/u, "the trusted completion helper delegates to the executable provenance-bound CallKit orchestrator");
assert.match(
  chatThreadSource,
  /const resumeAcceptedIncomingInvite = useCallback[\s\S]{0,2200}latestInvite\?\.status === "accepted"[\s\S]{0,700}latestThread\?\.activeCommunicationRoomId === roomId[\s\S]{0,320}snapshot\?\.room\.status === "active"/u,
  "an activity-remounted native Answer resumes only an authoritative accepted invite in its still-active room",
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
  /setIncomingCallInvite\(visibleIncomingInvite\);[\s\S]{0,180}if \(resumableAcceptedInvite\)[\s\S]{0,120}applyAcceptedIncomingInviteState\(resumableAcceptedInvite\)/u,
  "thread-state loading opens accepted receiver media without another Answer or Join tap",
);
assert.match(
  chatThreadSource,
  /nativeAudioSessionCallUuid !== requestedNativeCallUuid[\s\S]{0,900}enabled:[\s\S]{0,260}!waitingForIosNativeAudioSession/u,
  "iOS CallKit media initialization waits for the matching native audio-session activation",
);
assert.match(
  chatThreadSource,
  /event\.type === "audioSessionActivated"[\s\S]{0,180}setNativeAudioSessionCallUuid\(requestedNativeCallUuid\)/u,
  "only CallKit audio-session activation releases the matching accepted call's media gate",
);
assert.doesNotMatch(
  rootLayoutSource,
  /event\.type === "muted" \|\| event\.type === "unmuted"\)[\s\S]{0,260}routeNativeAction/u,
  "CallKit mute must not navigate to a duplicate chat screen",
);
assert.match(
  rootLayoutSource,
  /event\.type === "answerRequested"\)[\s\S]{0,120}routeNativeAnswer\(event\)/u,
  "CallKit Answer remains the only native action that opens the accepted media route",
);
assert.match(
  rootLayoutSource,
  /event\.type === "declined"\)[\s\S]{0,120}settleNativeTerminalAction\(event, "declined"\)/u,
  "CallKit Decline must directly persist the durable declined transition",
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
const cameraControlSource = communicationSessionSource.slice(
  communicationSessionSource.indexOf("const setCameraCaptureEnabled"),
  communicationSessionSource.indexOf("const toggleCamera"),
);
const microphoneControlSource = communicationSessionSource.slice(
  communicationSessionSource.indexOf("const setMicrophoneEnabled"),
  communicationSessionSource.indexOf("const toggleMic"),
);
assert.doesNotMatch(cameraControlSource, /stopLocalMediaKind/u, "camera controls must not stop a negotiated sender");
assert.equal(
  (cameraControlSource.match(/updatePresence\(/gu) ?? []).length,
  2,
  "camera control has one mutually exclusive presence write for success and permission failure",
);
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
  /const activeCallRoomId = resolveAcceptedChatCallRoomId\(\{[\s\S]{0,180}inviteRoomId: activeCallInvite\?\.communicationRoomId/u,
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
  /showMediaControls=\{!outgoingCallRinging && !callError && !callLoading\}/u,
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
  /showControls=\{outgoingCallRinging \|\| activeCallInvite\?\.status === "accepted"\}/u,
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
]) {
  assert.match(
    inRoomPanelSource,
    new RegExp(`testID="${permanentSurfaceId}"`, "u"),
    `the physical call matrix has a permanent ${permanentSurfaceId} surface target`,
  );
}
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
  /TrackSubscribed[\s\S]{0,260}track\.kind === Track\.Kind\.Audio[\s\S]{0,260}setSpeaker\(speakerRequestedRef\.current\)/u,
  "a subscribed remote audio track reasserts the platform audio session and video speaker route",
);
assert.match(
  liveKitChatCallSessionSource,
  /local_video_published[\s\S]{0,220}await setSpeaker\(speakerRequestedRef\.current\)/u,
  "camera publication cannot leave the video receiver on a stale audio route",
);
assert.match(
  liveKitChatCallSessionSource,
  /const setMicrophoneEnabled[\s\S]{0,420}if \(nextEnabled\)[\s\S]{0,180}LiveKitAudioSession\.startAudioSession/u,
  "turning the microphone back on restores the native audio session before capture",
);
assert.match(
  liveKitChatCallSessionSource,
  /const setCameraEnabled[\s\S]{0,720}local_video_published[\s\S]{0,180}await setSpeaker\(speakerRequestedRef\.current\)/u,
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
  /if \(nextState === "active"\)[\s\S]{0,260}LiveKitAudioSession\.startAudioSession\(\)[\s\S]{0,420}setSpeaker\(speakerRequestedRef\.current\)/u,
  "foreground recovery restores capture and the last selected audio output",
);
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
  /reportIosNativeCallRemoteEnd/u,
  "remote terminal invite state must close native and media state",
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

const copyChannel = (pushSent) => ({ ...createChillyChatCallChannelResult(), pushSent });
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
assert.equal(deliveryCopy.getChillyChatCallDeliveryMessage(deliveryFixture({ iosVoip: copyChannel(true) })), "Native iPhone call alert sent.");
assert.equal(deliveryCopy.getChillyChatCallDeliveryMessage(deliveryFixture({ ordinaryPush: copyChannel(true) })), "Push notification sent.");
assert.equal(deliveryCopy.getChillyChatCallDeliveryMessage(deliveryFixture({
  androidNative: copyChannel(true),
  iosVoip: copyChannel(true),
})), "Call alert sent through available device channels.");

console.log("Chi'lly Chat schema, token, preference, terminal, delivery-copy, and bounded tip-read fixtures passed.");
