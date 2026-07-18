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
  resolveIncomingCallRoomJoinAction,
  resolveIosChatCallAudioRoute,
  setActiveCommunicationTracksEnabled,
  shouldPreserveNativeCallBackgroundAudio,
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

const emptyChannels = () => ({
  androidNative: createChillyChatCallChannelResult(),
  iosVoip: createChillyChatCallChannelResult(),
  ordinaryPush: createChillyChatCallChannelResult(),
  inAppNotification: createChillyChatCallChannelResult(),
});

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
const communicationSessionSource = await readFile(new URL("hooks/use-communication-room-session.ts", root), "utf8");
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
assert.ok(dispatchSource.indexOf("const iosVoipPromise = invokeIosVoipDispatch") < dispatchSource.indexOf("const tokens = pushAllowed"));
assert.doesNotMatch(dispatchSource, /if \(!tokens\.length\)[\s\S]{0,220}return/u);
assert.match(voipSource, /\.eq\("enabled", true\)[\s\S]*\.is\("revoked_at", null\)/u);
assert.match(voipSource, /return data\?\.chilly_chat_calls_enabled !== false/u);
assert.doesNotMatch(voipSource, /data\?\.push_enabled !== false/u);
assert.match(voipSource, /ios_voip:\$\{invite\.id\}:\$\{tokenRow\.id\}:\$\{action\}/u);
assert.match(nativeCoordinatorSource, /if isTerminalInvite\(inviteId\)[\s\S]*completion\(\)/u);
assert.match(retryWorkerSource, /claim_chilly_chat_call_transition_delivery_batch/u);
assert.match(retryWorkerSource, /complete_chilly_chat_call_transition_delivery/u);
assert.match(retryWorkerSource, /AbortSignal\.timeout\(12_000\)/u);
assert.doesNotMatch(retryWorkerSource, /console\./u);
assert.match(retryMigrationSource, /for update skip locked/u);
assert.match(retryMigrationSource, /"attempt_count" < 10/u);
assert.match(retryMigrationSource, /make_interval\(secs => least\(300/u);

assert.doesNotMatch(dispatchSource, /markInviteMissed/u, "dispatch endpoint cannot own call-state transitions");
assert.doesNotMatch(
  dispatchSource,
  /\.from\("chat_call_invites"\)[\s\S]{0,180}\.update\(/u,
  "dispatch endpoint cannot mutate chat_call_invites",
);
assert.match(chatThreadSource, /readLatestChillyChatCallInviteForRoom/u, "callee join must reconcile the invite by room");
assert.match(chatThreadSource, /subscribeToChillyChatCallInvite\(visibleInvite\.id/u, "incoming presentation must follow authoritative invite state");
assert.match(chatThreadSource, /setIosNativeCallAudioRoute\(route\)/u, "iOS chat calls must apply the call-type audio route");
assert.doesNotMatch(
  rootLayoutSource,
  /event\.type === "muted" \|\| event\.type === "unmuted"\)[\s\S]{0,260}routeNativeAction/u,
  "CallKit mute must not navigate to a duplicate chat screen",
);
assert.match(communicationSessionSource, /setLocalMediaKindEnabled\("audio", false\)/u, "mute must preserve the negotiated audio sender");
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
