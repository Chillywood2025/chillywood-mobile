#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  IOS_NOTIFICATION_CATEGORIES,
  buildPlatformExpoPushMessage,
} from "../supabase/functions/_shared/notification-payload.mjs";

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
assert.ok(
  callDispatch.includes('const expoCandidates = input.action === "missed" && iosRolloutEnabled')
    && callDispatch.includes('? [...androidExpoTokens, ...iosExpoTokens]')
    && callDispatch.includes(': androidExpoTokens;'),
  "ordinary iOS push candidates must be limited to the missed-call fallback",
);
assert.ok(callDispatch.includes('input.action === "missed" && copy'), "iOS call-related ordinary push must remain a missed-call presentation");
assert.ok(moneyDispatch.includes('errorCode: "no_enabled_push_token"'), "creator-money dispatch must use a platform-neutral missing-token result");

console.log(JSON.stringify({
  status: "passed",
  checks: [
    "Android channel behavior retained",
    "iOS channelId omission enforced",
    "iOS category, badge, sound, and non-critical interruption fields enforced",
    "route data preserved across platforms",
    "platform-neutral client registration and lifecycle refresh wired",
    "iOS-as-FCM registration rejected",
    "activity, missed-call, and creator-money senders share platform policy",
    "iOS delivery remains rollout-disabled by default",
  ],
}, null, 2));
