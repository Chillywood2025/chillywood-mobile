import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createCallDispatchHarness, DISPATCH_IDS } from "./helpers/chat-call-dispatch-handler-harness.mjs";

// Production handler orchestration, with controlled SDK/provider receipts.
// PASS here is not APNs/FCM delivery, CallKit presentation, or device latency.
const sends = (harness, fragment) => harness.events.filter((event) => event.kind === "http" && event.url.includes(fragment));
const iosExpo = { platform: "ios", provider: "expo", token: "ExpoPushToken[test-ios]" };
const androidFcm = { platform: "android", provider: "fcm", token: "test-android-fcm" };
const androidExpo = { platform: "android", provider: "expo", token: "ExpoPushToken[test-android]" };

for (const callType of ["voice", "video"]) {
  test(`dispatch chain: ${callType} incoming preserves exact invite across FCM and APNs presentation`, async () => {
    const h = createCallDispatchHarness({ callType, presentationReceipt: true, pushTokens: [androidFcm, androidExpo, iosExpo] });
    const result = await h.dispatch();
    assert.equal(result.status, 200);
    assert.equal(result.body.channels.androidNative.pushSent, true);
    assert.equal(result.body.channels.iosVoip.presentationAcknowledged, true);
    assert.equal(result.body.result.pushSent, true);
    const fcm = sends(h, "fcm.googleapis.com")[0];
    const apns = sends(h, "push.apple.com")[0];
    assert.equal(fcm.body.message.data.callInviteId, h.ids.invite);
    assert.equal(fcm.body.message.data.threadId, h.ids.thread);
    assert.equal(fcm.body.message.data.callType, callType);
    assert.equal(fcm.body.message.data.action, "incoming");
    assert.equal(fcm.body.message.android.priority, "HIGH");
    assert.equal(fcm.body.message.android.ttl, "90s");
    assert.equal(apns.body.callInviteId, h.ids.invite);
    assert.equal(apns.body.callType, callType);
    assert.equal(apns.headers["apns-expiration"], "0");
    assert.equal(apns.headers["apns-push-type"], "voip");
    assert.equal(apns.body.recipientSessionGeneration, h.ids.session);
    assert.equal(sends(h, "/push/send").length, 0, "confirmed primary rails suppress redundant ordinary pushes");
  });
}

test("dispatch chain: APNs acceptance alone leaves notification pending without a presentation receipt", async () => {
  const h = createCallDispatchHarness();
  const { body } = await h.dispatch();
  assert.equal(body.channels.iosVoip.pushSent, true);
  assert.equal(body.channels.iosVoip.presentationAcknowledged, false);
  assert.equal(body.channels.iosVoip.reason, "provider_accepted_unacknowledged");
  assert.equal(body.result.pushSent, false);
  assert.equal(body.result.status, "created");
  assert.equal(h.tables.notifications[0].status, "pending");
  assert.equal(h.tables.notifications[0].delivered_at, null);
});

test("dispatch chain: APNs acceptance without presentation takes enabled iOS ordinary fallback", async () => {
  const h = createCallDispatchHarness({ pushTokens: [iosExpo] });
  const { body } = await h.dispatch();
  assert.equal(body.channels.iosVoip.presentationAcknowledged, false);
  assert.equal(body.channels.ordinaryPush.pushSent, true);
  const expo = sends(h, "/push/send");
  assert.equal(expo.length, 1);
  assert.equal(expo[0].body.data.callInviteId, h.ids.invite);
  assert.equal(expo[0].body.data.callType, "video");
});

test("dispatch chain: failed FCM uses Android ordinary fallback while retaining primary failure", async () => {
  const h = createCallDispatchHarness({ fcmFailure: true, voipToken: false, pushTokens: [androidFcm, androidExpo] });
  const { body } = await h.dispatch();
  assert.equal(body.channels.androidNative.failedCount, 1);
  assert.equal(body.channels.androidNative.pushSent, false);
  assert.equal(body.channels.ordinaryPush.pushSent, true);
  assert.equal(sends(h, "/push/send").length, 1);
  assert.equal(h.tables.notification_delivery_attempts.some((attempt) => attempt.provider === "fcm" && attempt.status === "failed"), true);
});

for (const failure of ["fcmTransportError", "fcmOAuthTransportError", "fcmOAuthFailure"]) {
  test(`dispatch chain: ${failure} preserves Android fallback and repeat dedupe`, async () => {
    const options = { [failure]: true, voipToken: false, pushTokens: [androidFcm, androidExpo] };
    const h = createCallDispatchHarness(options);
    const first = await h.dispatch();
    assert.equal(first.status, 200);
    assert.equal(first.body.channels.androidNative.failedCount, 1);
    assert.equal(first.body.channels.androidNative.pushSent, false);
    assert.equal(first.body.channels.androidNative.reason, "fcm_transport_unavailable");
    assert.equal(first.body.channels.ordinaryPush.pushSent, true);
    assert.equal(first.body.result.pushSent, true);
    assert.equal(sends(h, "/push/send").length, 1);
    const attempts = h.tables.notification_delivery_attempts;
    assert.equal(attempts.filter((a) => a.provider === "fcm" && a.status === "failed").length, 1);
    assert.equal(attempts.filter((a) => a.provider === "expo" && a.status === "sent").length, 1);
    assert.equal(h.tables.user_push_tokens.every((token) => token.enabled), true,
      "transport/auth service errors do not prove a permanently invalid token");
    assert.equal(JSON.stringify({ attempts, response: first }).includes("private-provider-detail"), false);

    options[failure] = false;
    const fcmBeforeRetry = sends(h, "fcm.googleapis.com").length;
    const expoBeforeRetry = sends(h, "/push/send").length;
    const retry = await h.dispatch();
    assert.equal(retry.status, 200);
    assert.equal(retry.body.channels.androidNative.reason, "duplicate_prevented");
    assert.equal(retry.body.channels.ordinaryPush.reason, "duplicate_prevented");
    assert.equal(retry.body.result.pushSent, false);
    assert.equal(sends(h, "fcm.googleapis.com").length, fcmBeforeRetry);
    assert.equal(sends(h, "/push/send").length, expoBeforeRetry,
      "recovering the provider does not duplicate the fallback already sent for this invite");
    assert.equal(h.tables.notifications.length, 1);
    assert.equal(h.tables.notification_event_dedupes.length, 1);
    assert.equal(attempts.length, 2);
  });
}

test("dispatch chain: unconfirmed FCM transport and failed fallback never claim delivery or replay", async () => {
  const options = { fcmTransportError: true, expoFailure: true, inAppEnabled: false,
    voipToken: false, pushTokens: [androidFcm, androidExpo] };
  const h = createCallDispatchHarness(options);
  const first = await h.dispatch();
  assert.equal(first.status, 200);
  assert.equal(first.body.result.status, "failed");
  assert.equal(first.body.result.pushSent, false);
  assert.equal(first.body.channels.androidNative.failedCount, 1);
  assert.equal(first.body.channels.ordinaryPush.failedCount, 1);
  assert.equal(h.tables.notifications.length, 0);
  assert.equal(h.tables.notification_delivery_attempts.length, 2);
  options.fcmTransportError = false;
  options.expoFailure = false;
  const fcmBeforeRetry = sends(h, "fcm.googleapis.com").length;
  const expoBeforeRetry = sends(h, "/push/send").length;
  const retry = await h.dispatch();
  assert.equal(retry.body.result.pushSent, false);
  assert.equal(retry.body.channels.androidNative.reason, "duplicate_prevented");
  assert.equal(sends(h, "fcm.googleapis.com").length, fcmBeforeRetry);
  assert.equal(sends(h, "/push/send").length, expoBeforeRetry,
    "a lost FCM response can hide acceptance; do not erase dedupe and replay automatically");
});

for (const options of [
  { apnsTransportError: true, reason: "provider_failed" },
  { iosUnavailable: true, reason: "ios_voip_dispatch_unavailable" },
]) {
  test(`dispatch chain: ${options.reason} remains failure when fallback also fails`, async () => {
    const h = createCallDispatchHarness({ ...options, expoFailure: true, pushTokens: [iosExpo] });
    const { body } = await h.dispatch();
    assert.equal(body.channels.iosVoip.reason, options.reason);
    assert.equal(body.channels.iosVoip.failedCount, 1);
    assert.equal(body.channels.ordinaryPush.failedCount, 1);
    assert.equal(body.result.pushSent, false);
    assert.equal(h.tables.notifications[0].status, "pending");
    assert.equal(h.tables.user_push_tokens[0].enabled, false, "permanent Expo token rejection retires only that token");
  });
}

test("dispatch chain: permanent APNs rejection retires token and never records presentation", async () => {
  const h = createCallDispatchHarness({ apnsStatus: 410, apnsReason: "Unregistered" });
  const { body } = await h.dispatch();
  assert.equal(body.channels.iosVoip.failedCount, 1);
  assert.equal(body.channels.iosVoip.presentationAcknowledged, false);
  assert.equal(h.tables.user_voip_push_tokens[0].enabled, false);
  assert.equal(h.tables.user_voip_push_tokens[0].ownership_state, "INVALID");
});

for (const state of ["accepted", "canceled", "declined", "ended", "missed", "busy"]) {
  test(`dispatch chain: ${state} authoritative invite cannot create a new incoming notification`, async () => {
    const h = createCallDispatchHarness({ status: state, pushTokens: [androidFcm, iosExpo] });
    assert.equal((await h.dispatch()).body.eligible, false);
    assert.equal((await h.dispatch(undefined, { ios: true })).body.reason, "invite_not_ringing");
    assert.equal(sends(h, "").length, 0);
    assert.equal(h.tables.notifications.length, 0);
  });
}

test("dispatch chain: expired incoming invite is stopped before any provider or notification write", async () => {
  const h = createCallDispatchHarness({ expiresInMs: -1, pushTokens: [androidFcm, iosExpo] });
  assert.equal((await h.dispatch()).body.result.reason, "invite_expired");
  assert.equal((await h.dispatch(undefined, { ios: true })).body.reason, "invite_expired");
  assert.equal(sends(h, "").length, 0);
  assert.equal(h.tables.notifications.length, 0);
});

test("dispatch chain: cancel dismisses the existing notification without synthesizing a new VoIP call", async () => {
  const h = createCallDispatchHarness({ presentationReceipt: true, pushTokens: [androidFcm] });
  await h.dispatch();
  const voipBefore = sends(h, "ios-voip-call-dispatch").length;
  h.tables.chat_call_invites[0].status = "canceled";
  const { body } = await h.dispatch({ action: "cancel", inviteId: h.ids.invite });
  assert.equal(body.channels.iosVoip.reason, "non_incoming_uses_authoritative_state");
  assert.equal(sends(h, "ios-voip-call-dispatch").length, voipBefore);
  assert.equal(h.tables.notifications.length, 1);
  assert.equal(h.tables.notifications[0].status, "dismissed");
  assert.equal(sends(h, "fcm.googleapis.com").at(-1).body.message.data.dismissCall, "true");
});

test("dispatch chain: repeated incoming request does not duplicate APNs, FCM, or in-app presentation", async () => {
  const h = createCallDispatchHarness({ presentationReceipt: true, pushTokens: [androidFcm, iosExpo] });
  await h.dispatch();
  const second = await h.dispatch();
  assert.equal(sends(h, "push.apple.com").length, 1);
  assert.equal(sends(h, "fcm.googleapis.com").length, 1);
  assert.equal(sends(h, "/push/send").length, 0);
  assert.equal(h.tables.notifications.length, 1);
  assert.equal(second.body.channels.iosVoip.reason, "duplicate_prevented");
});

test("dispatch chain: disabled call preference prevents every incoming presentation rail", async () => {
  const h = createCallDispatchHarness({ callsEnabled: false, pushTokens: [androidFcm, iosExpo] });
  assert.equal((await h.dispatch()).body.eligible, false);
  assert.equal(sends(h, "").length, 0);
  assert.equal(h.tables.notifications.length, 0);
});

for (const receipt of [false, true]) {
  test(`dispatch chain: presentation acknowledgment reports the actual ${receipt} database receipt`, async () => {
    const h = createCallDispatchHarness({ ackReceipt: receipt });
    const capability = "a".repeat(43);
    const attempt = "00000000-0000-4000-8000-000000000099";
    const result = await h.dispatch({ action: "presentation_ack", inviteId: DISPATCH_IDS.invite,
      presentationAttemptId: attempt, recipientUserId: DISPATCH_IDS.callee,
      presentationAckToken: capability }, { ios: true });
    assert.equal(result.status, receipt ? 200 : 202);
    assert.equal(result.body.acknowledged, receipt);
    const rpc = h.events.find((event) => event.name === "whole_app_acknowledge_ios_callkit_presentation");
    assert.deepEqual(rpc.parameters, {
      p_attempt_id: attempt, p_call_invite_id: DISPATCH_IDS.invite,
      p_recipient_user_id: DISPATCH_IDS.callee,
      p_capability_hash: createHash("sha256").update(capability).digest("hex"),
    });
    assert.equal(sends(h, "").length, 0);
  });
}

test("dispatch chain mutation: accepting APNs transport as presentation is detected", async () => {
  const h = createCallDispatchHarness({ sourceMutations: {
    "_shared/chilly-chat-call-dispatch-policy.mjs": (source) => source.replace(
      "|| channels.iosVoip.presentationAcknowledged === true;",
      "|| channels.iosVoip.pushSent === true;",
    ),
  } });
  const { body } = await h.dispatch();
  assert.equal(body.channels.iosVoip.pushSent, true, "real production send path reached the controlled APNs response");
  assert.equal(body.channels.iosVoip.presentationAcknowledged, false);
  assert.throws(() => assert.equal(body.result.pushSent, false), assert.AssertionError,
    "the acceptance-only assertion must reject the altered aggregator");
});

test("dispatch chain mutation: suppressing fallback on APNs acceptance is detected", async () => {
  const h = createCallDispatchHarness({ pushTokens: [iosExpo], sourceMutations: {
    "_shared/chilly-chat-call-dispatch-policy.mjs": (source) => source.replace(
      'action === "incoming" && input.iosVoipPresented !== true',
      'action === "incoming" && input.iosVoipSent !== true',
    ),
  } });
  const { body } = await h.dispatch();
  assert.equal(body.channels.iosVoip.pushSent, true);
  assert.equal(body.channels.iosVoip.presentationAcknowledged, false);
  assert.throws(() => assert.equal(sends(h, "/push/send").length, 1), assert.AssertionError,
    "the ordinary fallback assertion must reject the altered dispatcher policy");
});

test("dispatch chain mutation: ignoring terminal state in the main handler is detected", async () => {
  const h = createCallDispatchHarness({ status: "ended", pushTokens: [androidFcm], sourceMutations: {
    "chilly-chat-call-dispatch/index.ts": (source) => source.replace(
      'if (status !== "ringing") {', 'if (false) {',
    ),
  } });
  await h.dispatch();
  assert.throws(() => assert.equal(h.tables.notifications.length, 0), assert.AssertionError,
    "terminal-state assertion must reject a new in-app incoming presentation");
  assert.throws(() => assert.equal(sends(h, "fcm.googleapis.com").length, 0), assert.AssertionError,
    "terminal-state assertion must also reject the Android provider send");
});
