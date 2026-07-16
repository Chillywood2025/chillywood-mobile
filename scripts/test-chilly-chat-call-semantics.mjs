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

const root = new URL("../", import.meta.url);
const schemaSource = await readFile(new URL("_lib/chillyChatCallDispatchSchema.ts", root), "utf8");
const transpiledSchema = ts.transpileModule(schemaSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const schema = await import(`data:text/javascript;base64,${Buffer.from(transpiledSchema).toString("base64")}`);

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
assert.ok(dispatchSource.indexOf("const iosVoipPromise = invokeIosVoipDispatch") < dispatchSource.indexOf("const tokens = pushAllowed"));
assert.doesNotMatch(dispatchSource, /if \(!tokens\.length\)[\s\S]{0,220}return/u);
assert.match(voipSource, /\.eq\("enabled", true\)[\s\S]*\.is\("revoked_at", null\)/u);
assert.match(voipSource, /return data\?\.chilly_chat_calls_enabled !== false/u);
assert.doesNotMatch(voipSource, /data\?\.push_enabled !== false/u);
assert.match(voipSource, /ios_voip:\$\{invite\.id\}:\$\{tokenRow\.id\}:\$\{action\}/u);
assert.match(nativeCoordinatorSource, /if isTerminalInvite\(inviteId\)[\s\S]*completion\(\)/u);

console.log("Chi'lly Chat call schema, channel, token, terminal-action, and idempotency fixtures passed.");
