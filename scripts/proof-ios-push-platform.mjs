#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  IOS_NOTIFICATION_CATEGORIES,
  buildPlatformExpoPushMessage,
} from "../supabase/functions/_shared/notification-payload.mjs";
import {
  isInternalIosOrdinaryPushProofRequestAllowed,
  isIosOrdinaryPushDeliveryAllowed,
} from "../supabase/functions/_shared/ios-ordinary-push-internal-proof-policy.mjs";
import { resolveChillyChatOrdinaryPushFallbackPolicy } from "../supabase/functions/_shared/chilly-chat-call-dispatch-policy.mjs";

const common = {
  androidChannelId: "default",
  body: "Body",
  categoryId: IOS_NOTIFICATION_CATEGORIES.activity,
  data: { path: "/profile/test", triggerType: "test" },
  sound: "default",
  title: "Title",
  to: "ExpoPushToken[redacted-proof-value]",
};

const android = buildPlatformExpoPushMessage({ ...common, platform: "android" });
const ios = buildPlatformExpoPushMessage({ ...common, platform: "ios" });

assert.equal(android.channelId, "default", "Android must retain its notification channel");
assert.equal(android.sound, "default", "Android payload behavior must retain its sound marker");
assert.equal("badge" in android, false, "Android must not receive the iOS badge field");
assert.equal("interruptionLevel" in android, false, "Android must not receive an iOS interruption level");

assert.equal("channelId" in ios, false, "iOS must never receive an Android channelId");
assert.equal(ios.badge, 1, "iOS ordinary pushes must carry a bounded badge update");
assert.equal(ios.categoryId, IOS_NOTIFICATION_CATEGORIES.activity, "iOS must use the registered category");
assert.equal(ios.interruptionLevel, "active", "ordinary iOS alerts must use the non-critical active level");
assert.equal(ios.sound, "default", "iOS ordinary alerts must request the default sound");
assert.deepEqual(ios.data, common.data, "platform separation must preserve route data");

const passive = buildPlatformExpoPushMessage({
  ...common,
  badge: 0,
  interruptionLevel: "passive",
  platform: "ios",
  sound: null,
});
assert.equal(passive.badge, 0, "iOS badge clearing must preserve zero");
assert.equal(passive.interruptionLevel, "passive", "policy-selected passive delivery must be retained");
assert.equal("sound" in passive, false, "passive iOS delivery may intentionally omit sound");

const proofTargetHash = "a".repeat(64);
assert.equal(isIosOrdinaryPushDeliveryAllowed({
  internalProofEnabled: true,
  internalProofTargetHashes: proofTargetHash,
  publicRolloutEnabled: false,
  targetHash: proofTargetHash,
}), true, "an exact internal proof account/device target may receive iOS ordinary push while public rollout remains off");
assert.equal(isIosOrdinaryPushDeliveryAllowed({
  internalProofEnabled: false,
  internalProofTargetHashes: proofTargetHash,
  publicRolloutEnabled: false,
  targetHash: proofTargetHash,
}), false, "the internal proof rail must have its own explicit enable switch");
assert.equal(isIosOrdinaryPushDeliveryAllowed({
  internalProofEnabled: true,
  internalProofTargetHashes: proofTargetHash,
  publicRolloutEnabled: false,
  targetHash: "b".repeat(64),
}), false, "a different account/device target must remain rollout-blocked");
assert.equal(isIosOrdinaryPushDeliveryAllowed({
  internalProofEnabled: true,
  internalProofTargetHashes: "not-a-hash",
  publicRolloutEnabled: false,
  targetHash: proofTargetHash,
}), false, "malformed internal proof configuration must fail closed");
assert.equal(isIosOrdinaryPushDeliveryAllowed({
  internalProofEnabled: false,
  internalProofTargetHashes: "not-a-hash",
  publicRolloutEnabled: true,
  targetHash: proofTargetHash,
}), true, "the existing public rollout switch remains authoritative when separately enabled");

const proofRecipientUserId = "11111111-1111-4111-8111-111111111111";
assert.equal(isInternalIosOrdinaryPushProofRequestAllowed({
  internalProofEnabled: true,
  publicRolloutEnabled: true,
  recipientUserId: proofRecipientUserId,
  serviceRoleAuthenticated: true,
}), true, "the benign internal proof trigger accepts service role with its own switch, the canonical rollout on, and an exact UUID");
assert.equal(isInternalIosOrdinaryPushProofRequestAllowed({
  internalProofEnabled: true,
  operatorAuthenticated: true,
  publicRolloutEnabled: true,
  recipientUserId: proofRecipientUserId,
  serviceRoleAuthenticated: false,
}), true, "the benign internal proof trigger accepts an already-authorized Owner/operator without weakening exact-target delivery");
for (const blocked of [
  { internalProofEnabled: false, operatorAuthenticated: false, publicRolloutEnabled: true, recipientUserId: proofRecipientUserId, serviceRoleAuthenticated: true },
  { internalProofEnabled: true, operatorAuthenticated: false, publicRolloutEnabled: false, recipientUserId: proofRecipientUserId, serviceRoleAuthenticated: true },
  { internalProofEnabled: true, operatorAuthenticated: false, publicRolloutEnabled: true, recipientUserId: proofRecipientUserId, serviceRoleAuthenticated: false },
  { internalProofEnabled: true, operatorAuthenticated: false, publicRolloutEnabled: true, recipientUserId: "not-a-user", serviceRoleAuthenticated: true },
]) assert.equal(isInternalIosOrdinaryPushProofRequestAllowed(blocked), false, "every missing internal proof boundary must fail closed");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const client = read("_lib/notifications.ts");
const layout = read("app/_layout.tsx");
const settings = read("app/settings.tsx");
const chatThread = read("app/chat/[threadId].tsx");
const tokenEndpoint = read("supabase/functions/notification-device-tokens/index.ts");
const activityDispatch = read("supabase/functions/notification-dispatch/index.ts");
const callDispatch = read("supabase/functions/chilly-chat-call-dispatch/index.ts");
const moneyDispatch = read("supabase/functions/revenuecat-webhook/index.ts");

for (const marker of [
  "export async function requestPushPermissionAndRegister",
  "export async function refreshPushRegistrationIfGranted",
  "export async function readCurrentPushRegistration",
  "Notifications.IosAuthorizationStatus.PROVISIONAL",
  "Notifications.IosAuthorizationStatus.EPHEMERAL",
  "allowAlert: true",
  "allowBadge: true",
  "allowSound: true",
]) {
  assert.ok(client.includes(marker), `client ordinary-push readiness is missing ${marker}`);
}
assert.ok(client.includes("@deprecated Use requestPushPermissionAndRegister"), "Android registration alias must remain deprecated-compatible");
assert.ok(client.includes("@deprecated Use refreshPushRegistrationIfGranted"), "Android refresh alias must remain deprecated-compatible");
const providerDeadline = Number(client.match(/const PUSH_REGISTRATION_PROVIDER_DEADLINE_MS = ([0-9_]+);/u)?.[1]?.replaceAll("_", ""));
assert.ok(Number.isFinite(providerDeadline) && providerDeadline >= 5_000 && providerDeadline <= 30_000, "post-permission push provider work must have a bounded customer-facing deadline");
assert.ok(client.includes("registerCurrentPushProvidersWithDeadline"), "register and refresh paths must share one bounded provider workflow");
assert.ok(client.includes("withAuthorityReadDeadline(registration, fallback, PUSH_REGISTRATION_PROVIDER_DEADLINE_MS)"), "token and backend uncertainty must release the registration UI with an error result");
assert.equal((client.match(/return registerCurrentPushProvidersWithDeadline\(/gu) ?? []).length, 2, "both explicit registration and lifecycle refresh must use the bounded provider workflow");
assert.ok(client.includes("handledNotificationResponseKeys"), "notification response dedupe must survive subscription replacement");
assert.ok(client.includes("clearLastNotificationResponseAsync"), "handled notification responses must be cleared from native state");
assert.ok(layout.includes("refreshPushRegistrationIfGranted"), "app activation must refresh platform-neutral registration");
assert.ok(layout.includes("preferences?.pushEnabled === false"), "app activation must preserve an account's disabled push preference");
assert.ok(layout.includes("clearApplicationNotificationBadge"), "app activation and routing must clear the iOS badge");
assert.ok(client.includes("shouldSetBadge: false"), "foreground delivery must not leave a stale iOS badge");
assert.ok(settings.includes('Platform.OS === "android"'), "Android full-screen call controls must remain platform-gated");
assert.ok(settings.includes("Linking.openSettings()"), "denied iOS permission must offer truthful Settings recovery");
assert.ok(chatThread.includes('? requestPushPermissionAndRegister()\n        : refreshPushRegistrationIfGranted()'), "an outgoing iOS call must not trigger the ordinary push permission prompt");
assert.ok(tokenEndpoint.includes('platform === "ios" && provider !== "expo"'), "iOS tokens must be constrained to the Expo provider");
assert.ok(tokenEndpoint.includes('error: "invalid_provider_for_platform"'), "token endpoint must reject iOS-as-FCM registration");

for (const source of [activityDispatch, callDispatch, moneyDispatch]) {
  assert.ok(source.includes("buildPlatformExpoPushMessage"), "every ordinary-push sender must use the shared platform builder");
  assert.ok(source.includes("IOS_ORDINARY_PUSH_ROLLOUT_ENABLED"), "iOS delivery must default off behind the rollout flag");
}
assert.ok(activityDispatch.includes('errorCode: "no_enabled_push_token"'), "activity dispatch must use a platform-neutral missing-token result");
assert.ok(activityDispatch.includes("IOS_ORDINARY_PUSH_INTERNAL_PROOF_ENABLED"), "activity dispatch must expose the bounded internal proof switch");
assert.ok(activityDispatch.includes("IOS_ORDINARY_PUSH_INTERNAL_PROOF_TARGET_HASHES"), "internal iOS proof delivery must bind to hashed account/device targets");
assert.ok(activityDispatch.includes("await isIosOrdinaryPushTargetEnabled(input.recipient.id, token.token)"), "iOS proof delivery must bind to the exact account and device token");
assert.ok(activityDispatch.includes('action === "deliver-internal-ios-proof"'), "activity dispatch must expose a benign privileged internal proof trigger");
assert.ok(activityDispatch.includes('operatorAuthenticated: auth.user.id !== "service_role"'), "internal proof trigger must recognize the already-authorized Owner/operator path");
assert.ok(activityDispatch.includes('serviceRoleAuthenticated: auth.user.id === "service_role"'), "internal proof trigger must retain the service-role path");
assert.ok(activityDispatch.includes('deliveryMode: "internal_ios_proof"'), "internal proof trigger must use its exact iOS-only delivery mode");
assert.ok(activityDispatch.includes("isIosOrdinaryPushTargetEnabled(input.recipient.id, token.token, false)"), "internal proof trigger must retain exact account/device allowlisting after ordinary iOS rollout is enabled");
assert.ok(activityDispatch.includes('deepLink: "chillywoodmobile://settings"'), "internal proof trigger must route only to non-authoritative notification settings");
assert.ok(activityDispatch.includes('deliverableTokens.length !== 1'), "internal proof trigger must require exactly one allowlisted iOS token");
assert.ok(activityDispatch.includes('triggerType === "internal_ios_delivery_proof" ? "content_dropped" : triggerType'), "internal proof must reuse a non-authoritative customer notification type already accepted by the database contract");
assert.ok(activityDispatch.includes('triggerType === "internal_ios_delivery_proof") return "content_dropped"'), "internal proof must reuse an accepted non-authoritative customer category");
assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "incoming",
  androidNativeSent: true,
  iosRolloutEnabled: true,
  iosVoipPresented: true,
  iosVoipSent: true,
}), { android: false, ios: false }, "confirmed native presentation must suppress duplicate ordinary incoming-call alerts");
assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "incoming",
  androidNativeSent: true,
  iosRolloutEnabled: true,
  iosVoipPresented: false,
  iosVoipSent: true,
}), { android: false, ios: true }, "provider-accepted but unacknowledged PushKit delivery must allow one ordinary iOS incoming-call fallback");
assert.deepEqual(resolveChillyChatOrdinaryPushFallbackPolicy({
  action: "incoming",
  androidNativeSent: true,
  iosRolloutEnabled: false,
  iosVoipPresented: false,
  iosVoipSent: false,
}), { android: false, ios: false }, "disabled ordinary iOS rollout must remain fail closed");
assert.ok(callDispatch.includes("const iosVoip = await iosVoipPromise;"), "ordinary iOS fallback must wait for the authoritative PushKit result");
assert.ok(
  callDispatch.indexOf("const iosVoip = await iosVoipPromise;")
    < callDispatch.indexOf("resolveChillyChatOrdinaryPushFallbackPolicy({"),
  "PushKit completion must precede the ordinary iOS fallback decision",
);
assert.ok(callDispatch.includes("IOS_NOTIFICATION_CATEGORIES.incomingCall"), "ordinary iOS incoming-call fallback must use the registered call category");
assert.ok(callDispatch.includes('interruptionLevel: input.action === "incoming" ? "time-sensitive" : "active"'), "ordinary iOS incoming-call fallback must request time-sensitive presentation");
assert.ok(callDispatch.includes('ttl: input.action === "incoming" ? 45 : 3600'), "ordinary iOS incoming-call fallback must expire with the call rather than becoming a stale alert");
assert.ok(callDispatch.includes('input.action === "incoming" && token.platform === "ios"'), "ordinary iOS fallback must render visible incoming-call copy");
assert.ok(moneyDispatch.includes('errorCode: "no_enabled_push_token"'), "creator-money dispatch must use a platform-neutral missing-token result");

console.log(JSON.stringify({
  status: "passed",
  checks: [
    "Android channel behavior retained",
    "iOS channelId omission enforced",
    "iOS category, badge, sound, and non-critical interruption fields enforced",
    "route data preserved across platforms",
    "platform-neutral client registration and lifecycle refresh wired",
    "post-permission provider work has a bounded failure deadline",
    "iOS-as-FCM registration rejected",
    "activity, active/missed call, and creator-money senders share platform policy",
    "PushKit-first incoming calls have a bounded ordinary iOS fallback without duplicate presentation",
    "iOS delivery remains rollout-disabled by default",
    "internal iOS proof delivery is independently enabled and exact-account/device bound",
    "internal proof trigger is privileged-only, iOS-only, exact-one-token, and routes to non-authoritative settings",
  ],
}, null, 2));
