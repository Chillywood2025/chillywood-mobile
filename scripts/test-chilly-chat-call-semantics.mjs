import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
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
assert.equal(terminalPreference.iosVoip, true, "terminal cleanup may close an existing iPhone native call");
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

for (const action of ["cancel", "declined", "end", "timeout"]) {
  const androidData = buildChillyChatNativeActionData({ ...actionScope, action });
  const voipData = buildIosVoipApnsPayload({ ...actionScope, action });
  for (const payload of [androidData, voipData]) {
    assert.equal(payload.action, action);
    assert.equal(payload.callUuid, actionScope.callInviteId);
    assert.equal(payload.callInviteId, actionScope.callInviteId);
    assert.equal(payload.threadId, actionScope.threadId);
    assert.equal(payload.expiresAt, actionScope.expiresAt);
    assert.equal(payload.callType, actionScope.callType);
  }
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
const liveKitBootstrapSource = await readFile(new URL("_lib/livekit/bootstrap.ts", root), "utf8");
const communicationSessionSource = await readFile(new URL("hooks/use-communication-room-session.ts", root), "utf8");
const inRoomPanelSource = await readFile(
  new URL("components/communication/in-room-communication-panel.tsx", root),
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
assert.ok(dispatchSource.indexOf("const iosVoipPromise = invokeIosVoipDispatch") < dispatchSource.indexOf("const tokens = pushAllowed"));
assert.doesNotMatch(dispatchSource, /if \(!tokens\.length\)[\s\S]{0,220}return/u);
assert.match(voipSource, /\.eq\("enabled", true\)[\s\S]*\.is\("revoked_at", null\)/u);
assert.match(voipSource, /return data\?\.chilly_chat_calls_enabled !== false/u);
assert.doesNotMatch(voipSource, /data\?\.push_enabled !== false/u);
assert.match(voipSource, /ios_voip:\$\{invite\.id\}:\$\{tokenRow\.id\}:\$\{action\}/u);
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
  /incomingCallInvite && !callPanelOpen && !iosNativeCallPresentationOwned/u,
  "the same-thread React banner is hidden when CallKit owns iOS presentation",
);
assert.match(
  chatThreadSource,
  /leaveLabel=\{outgoingCallRinging \? "Cancel Call" : "End Call"\}/u,
  "a ringing caller receives an explicit cancel-call action",
);
assert.match(
  chatThreadSource,
  /showControls=\{outgoingCallRinging \|\| \(activeCallInvite\?\.status === "accepted"/u,
  "the cancel-call action remains visible before acceptance",
);
assert.doesNotMatch(chatThreadSource, /styles\.incomingCallSheet/u, "same-thread foreground calls cannot use the large blocking modal");
assert.match(rootLayoutSource, /testID="app-wide-incoming-call-banner"/u, "foreground calls outside the thread use the compact top banner");
assert.doesNotMatch(rootLayoutSource, /app-wide-incoming-call-modal/u, "foreground calls cannot use the large app-wide modal");
assert.doesNotMatch(rootLayoutSource, /<Modal/u, "background/full-screen presentation remains native rather than a React modal");
assert.match(rootLayoutSource, /presentation === "native_background"/u, "background state defers to native CallStyle or CallKit");
assert.match(rootLayoutSource, /presentation === "native_ios"/u, "CallKit ownership suppresses the duplicate app-wide React banner");
assert.match(rootLayoutSource, /params\.set\("nativeCallAction", "answer"\)/u, "foreground Answer uses the durable callee accept route");
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
  /requestedNativeCallAction === "answer"[\s\S]{0,420}completeIosNativeCallAnswer\([\s\S]{0,160}true[\s\S]{0,300}rememberHandledIncomingInvite\(acceptedInvite\)/u,
  "a server-accepted CallKit answer is fulfilled before accepted media initialization can publish",
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
  /showMediaControls=\{!outgoingCallRinging\}/u,
  "mic and camera controls stay hidden until the receiver accepts",
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
assert.match(iosVoipDispatchSource, /authorize_chilly_chat_call_transition_retry/u, "VoIP dispatcher must verify retry authorization before terminal cleanup");
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
