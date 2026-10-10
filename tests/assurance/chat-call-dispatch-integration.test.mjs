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

const missedPushes = (h) => sends(h, "/push/send").filter((event) => event.body.data.action === "missed");
const missedRows = (h) => h.tables.notifications.filter((row) => row.notification_type === "chilly_chat_missed_call");
const expiredMissed = (options = {}) => createCallDispatchHarness({
  status: "missed", expiresInMs: -1000, pushTokens: [androidFcm, androidExpo, iosExpo], ...options,
});
const timeoutRequest = (h) => ({ action: "timeout", inviteId: h.ids.invite });

for (const callType of ["voice", "video"]) {
  test(`missed ${callType}: durable timeout clears native UI and creates unread bell plus both ordinary pushes`, async () => {
    const h = expiredMissed({ callType });
    h.tables.notifications.push({ id: "incoming-row", source_type: "chat_call_invite", source_id: h.ids.invite,
      notification_type: "chilly_chat_call", user_id: h.ids.callee, status: "sent" });
    const result = await h.dispatch(timeoutRequest(h));
    assert.equal(result.status, 200);
    assert.equal(result.body.result.status, "sent");
    const cleanup = sends(h, "fcm.googleapis.com")[0].body.message.data;
    assert.equal(cleanup.action, "timeout");
    assert.equal(cleanup.dismissCall, "true");
    assert.equal(cleanup.callInviteId, h.ids.invite);
    assert.equal(h.tables.notifications[0].status, "dismissed");
    assert.ok(h.tables.notifications[0].read_at);
    const [row] = missedRows(h);
    assert.equal(missedRows(h).length, 1);
    assert.equal(row.user_id, h.ids.callee);
    assert.equal(row.source_id, h.ids.invite);
    assert.equal(row.target_entity_id, h.ids.thread);
    assert.equal(row.target_route, "/chat/[threadId]");
    assert.equal(row.read_at ?? null, null);
    assert.equal(row.dismissed_at ?? null, null);
    assert.equal(row.target_context.expiresAt, undefined, "ringing expiry cannot instantly expire missed activity");
    assert.equal(row.target_context.callExpiresAt, h.tables.chat_call_invites[0].expires_at);
    assert.equal(row.target_context.openCall, false);
    const pushes = missedPushes(h);
    assert.equal(pushes.length, 2);
    for (const push of pushes) {
      assert.equal(push.body.data.callInviteId, h.ids.invite);
      assert.equal(push.body.data.threadId, h.ids.thread);
      assert.equal(push.body.data.openCall, "false");
      assert.equal(push.body.data.notificationId, row.id);
      assert.equal(push.body.data.dismissCall, undefined, "presentation cannot be consumed as terminal cleanup");
      assert.match(push.body.title, new RegExp(`Missed .* ${callType} call`));
      assert.equal(push.body.sound, "default");
      assert.equal(push.body.ttl, 3600);
      assert.equal(push.body.data.path, `/chat/${h.ids.thread}?callInviteId=${h.ids.invite}`);
    }
    assert.equal(pushes.find((p) => p.body.to === androidExpo.token).body.channelId, "chilly_chat_missed_calls");
    assert.equal(pushes.find((p) => p.body.to === iosExpo.token).body.categoryId, "chillywood_missed_call");
    assert.equal(sends(h, "push.apple.com").length, 0);
    assert.equal(sends(h, "ios-voip-call-dispatch").length, 0, "missed activity cannot synthesize a new CallKit invite");
  });
}

test("missed: concurrent and repeated timeout/direct requests reserve one presentation but retain cleanup", async () => {
  const h = expiredMissed();
  await Promise.all([h.dispatch(timeoutRequest(h)), h.dispatch({ action: "missed", inviteId: h.ids.invite })]);
  await h.dispatch(timeoutRequest(h));
  assert.equal(missedRows(h).length, 1);
  assert.equal(h.tables.notification_event_dedupes.length, 1);
  assert.equal(missedPushes(h).length, 2, "one per eligible platform, not one per request");
  assert.equal(sends(h, "fcm.googleapis.com").length, 3, "idempotent terminal cleanup is not suppressed by presentation dedupe");
});

for (const [options, rows, pushes] of [
  [{ callsEnabled: false }, 0, 0],
  [{ inAppEnabled: false }, 0, 2],
  [{ pushEnabled: false }, 1, 0],
  [{ env: { IOS_ORDINARY_PUSH_ROLLOUT_ENABLED: "false" } }, 1, 1],
]) {
  test(`missed: preference/rollout gates ${JSON.stringify(options)} do not suppress native cleanup`, async () => {
    const h = expiredMissed(options);
    await h.dispatch(timeoutRequest(h));
    assert.equal(missedRows(h).length, rows);
    assert.equal(missedPushes(h).length, pushes);
    assert.equal(sends(h, "fcm.googleapis.com").length, 1);
    assert.equal(sends(h, "fcm.googleapis.com")[0].body.message.data.action, "timeout");
  });
}

for (const enabled of [false, true]) {
  test(`missed: unavailable preferences fail closed after cleanup and recover without reserving work (${enabled})`, async () => {
    const options = { status: "missed", expiresInMs: -1000,
      callsEnabled: enabled, pushEnabled: enabled, inAppEnabled: enabled,
      databaseFailure: "notification_preferences", pushTokens: [androidFcm, androidExpo, iosExpo] };
    const h = createCallDispatchHarness(options);
    const failed = await h.dispatch(timeoutRequest(h));
    assert.equal(failed.status, 500);
    assert.match(failed.body.message, /missed_notification_preferences_unavailable/u);
    assert.equal(sends(h, "fcm.googleapis.com").length, 1, "terminal cleanup remains independent of missing preferences");
    assert.equal(sends(h, "fcm.googleapis.com")[0].body.message.data.action, "timeout");
    assert.equal(missedRows(h).length, 0);
    assert.equal(missedPushes(h).length, 0);
    assert.equal(h.tables.notification_event_dedupes.length, 0, "failed preference reads cannot consume presentation eligibility");

    options.databaseFailure = undefined;
    const recovered = await h.dispatch(timeoutRequest(h));
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.result.status, enabled ? "sent" : "blocked");
    assert.equal(missedRows(h).length, enabled ? 1 : 0);
    assert.equal(missedPushes(h).length, enabled ? 2 : 0);
    assert.equal(h.tables.notification_event_dedupes.length, enabled ? 1 : 0);
    await h.dispatch(timeoutRequest(h));
    assert.equal(missedRows(h).length, enabled ? 1 : 0);
    assert.equal(missedPushes(h).length, enabled ? 2 : 0, "recovered presentation remains deduplicated");
    assert.equal(sends(h, "fcm.googleapis.com").length, 3);
  });
}

for (const options of [{ status: "accepted" }, { status: "declined" }, { status: "canceled" },
  { status: "ended" }, { status: "busy" }, { status: "ringing" }, { expiresInMs: 30_000 }]) {
  test(`missed: forged direct presentation rejected for ${JSON.stringify(options)}`, async () => {
    const h = expiredMissed(options);
    const result = await h.dispatch({ action: "missed", inviteId: h.ids.invite });
    assert.equal(result.body.eligible, false);
    assert.equal(h.tables.notifications.length, 0);
    assert.equal(sends(h, "").length, 0);
  });
}

test("missed: invalid deadline cannot authorize either direct presentation or timeout", async () => {
  const h = expiredMissed();
  h.tables.chat_call_invites[0].expires_at = "invalid";
  for (const action of ["missed", "timeout"]) assert.equal((await h.dispatch({ action, inviteId: h.ids.invite })).body.eligible, false);
  assert.equal(sends(h, "").length, 0);
});

test("missed: nonparticipant and missing exact thread membership cannot send an alert", async () => {
  const outsider = expiredMissed({ actorUserId: "00000000-0000-4000-8000-000000000099" });
  assert.equal((await outsider.dispatch(timeoutRequest(outsider))).status, 403);
  assert.equal(sends(outsider, "").length, 0);
  const h = expiredMissed();
  h.tables.chat_thread_members.splice(1, 1);
  assert.equal((await h.dispatch(timeoutRequest(h))).status, 403);
  assert.equal(sends(h, "").length, 0);
});

for (const [status, action, actorUserId] of [
  ["declined", "declined", DISPATCH_IDS.callee], ["canceled", "cancel", DISPATCH_IDS.caller],
  ["busy", "timeout", DISPATCH_IDS.callee],
]) {
  test(`missed: ${status} remains cleanup-only`, async () => {
    const h = expiredMissed({ status, actorUserId });
    const result = await h.dispatch({ action, inviteId: h.ids.invite });
    assert.equal(result.status, 200);
    assert.equal(missedRows(h).length, 0);
    assert.equal(missedPushes(h).length, 0);
    assert.equal(sends(h, "ios-voip-call-dispatch").length, 0);
  });
}

for (const failure of ["expoFailure", "expoTransportError"]) {
  test(`missed: cleanup success cannot hide ${failure}; uncertain delivery is not replayed`, async () => {
    const options = { [failure]: true };
    const h = expiredMissed(options);
    const result = await h.dispatch(timeoutRequest(h));
    assert.equal(result.body.channels.androidNative.pushSent, true);
    assert.equal(result.body.channels.ordinaryPush.pushSent, false);
    assert.equal(result.body.channels.ordinaryPush.failedCount, 2);
    assert.equal(result.body.result.status, "failed");
    assert.equal(result.body.result.reason, "missed_presentation_failed");
    assert.equal(missedRows(h)[0].delivered_at, null);
    assert.equal(JSON.stringify(result).includes("private-provider-detail"), false);
    const before = missedPushes(h).length;
    const retry = await h.dispatch(timeoutRequest(h));
    assert.equal(missedPushes(h).length, before);
    assert.equal(retry.body.result.status, "skipped");
    assert.equal(retry.body.result.reason, "missed_duplicate_prevented", "cleanup cannot label an un-replayed presentation sent");
  });
}

test("missed: reservation database failure is not mislabeled as an existing duplicate", async () => {
  const h = expiredMissed({ databaseFailure: "notification_event_dedupes" });
  const result = await h.dispatch(timeoutRequest(h));
  assert.equal(result.status, 500);
  assert.equal(sends(h, "fcm.googleapis.com").length, 1);
  assert.equal(missedPushes(h).length, 0);
});

test("missed: row insertion failure sends no ordinary push and releases only its reservation", async () => {
  const h = expiredMissed({ databaseFailure: "notifications", databaseFailureOperation: "insert" });
  const result = await h.dispatch(timeoutRequest(h));
  assert.equal(result.body.result.status, "failed");
  assert.equal(result.body.channels.inAppNotification.reason, "notification_insert_failed");
  assert.equal(missedPushes(h).length, 0);
  assert.equal(h.tables.notification_event_dedupes.length, 0);
});

test("missed: failed token lookup does not reserve presentation and recovered replay sends once", async () => {
  const options = { status: "missed", expiresInMs: -1000, databaseFailure: "user_push_tokens",
    pushTokens: [androidFcm, androidExpo, iosExpo] };
  const h = createCallDispatchHarness(options);
  const failed = await h.dispatch(timeoutRequest(h));
  assert.equal(failed.status, 500);
  assert.match(failed.body.message, /missed_notification_tokens_unavailable/u);
  assert.equal(missedRows(h).length, 0);
  assert.equal(missedPushes(h).length, 0);
  assert.equal(h.tables.notification_event_dedupes.length, 0);

  options.databaseFailure = undefined;
  const recovered = await h.dispatch(timeoutRequest(h));
  assert.equal(recovered.body.result.status, "sent");
  assert.equal(missedRows(h).length, 1);
  assert.equal(missedPushes(h).length, 2);
  assert.equal(sends(h, "fcm.googleapis.com").length, 1);
  await h.dispatch(timeoutRequest(h));
  assert.equal(missedRows(h).length, 1);
  assert.equal(missedPushes(h).length, 2);
});

test("missed: unsent reservation release failure is explicit and never guessed safe to delete on replay", async () => {
  let h;
  let failWrites = true;
  const options = { status: "missed", expiresInMs: -1000, pushTokens: [androidFcm, androidExpo, iosExpo],
    get databaseFailure() {
      // Inject returned SDK errors for these two writes only, using the real
      // handler's recorded operation. No provider request has been attempted.
      const operation = h?.events.at(-1);
      return failWrites && operation?.kind === "database"
        && ((operation.table === "notifications" && operation.operation === "insert")
          || (operation.table === "notification_event_dedupes" && operation.operation === "delete"))
        ? operation.table : undefined;
    } };
  h = createCallDispatchHarness(options);
  const failed = await h.dispatch(timeoutRequest(h));
  assert.equal(failed.status, 500);
  assert.match(failed.body.message, /missed_unsent_release_failed/u);
  assert.equal(missedRows(h).length, 0);
  assert.equal(missedPushes(h).length, 0);
  assert.equal(h.tables.notification_event_dedupes.length, 1);

  failWrites = false;
  const retryStart = h.events.length;
  const replay = await h.dispatch(timeoutRequest(h));
  assert.equal(replay.body.result.status, "skipped");
  assert.equal(replay.body.result.reason, "missed_duplicate_prevented");
  assert.equal(missedRows(h).length, 0);
  assert.equal(missedPushes(h).length, 0);
  assert.equal(h.tables.notification_event_dedupes.length, 1);
  assert.equal(h.events.slice(retryStart).filter((event) => event.kind === "database"
    && event.table === "notification_event_dedupes" && event.operation === "delete").length, 0);
});

for (const expoMode of ["hold_fetch", "hold_body"]) {
  test(`missed: ${expoMode} is bounded unknown, retains dedupe and ignores late success`, async () => {
    const h = expiredMissed({ expoMode, manualTimers: true, pushTokens: [iosExpo] });
    let settled = false;
    const run = h.dispatch(timeoutRequest(h)).then((result) => { settled = true; return result; });
    await h.waitForHold(expoMode === "hold_fetch" ? "fetch" : "body");
    await h.advance(60_000);
    assert.equal(settled, true, "ordinary provider wait must terminate within its bounded deadline");
    const result = await run;
    assert.equal(result.body.result.status, "failed");
    assert.equal(result.body.channels.ordinaryPush.reason, "expo_timeout_unknown");
    const hold = h.events.find((event) => event.kind === "provider_hold");
    assert.equal(hold.signal?.aborted, true);
    assert.equal(missedRows(h).length, 1);
    assert.equal(missedRows(h)[0].delivered_at, null);
    assert.equal(h.tables.notification_delivery_attempts.filter((attempt) => attempt.status === "sent").length, 0);
    const attempts = h.tables.notification_delivery_attempts.length;
    await h.releaseProviderHolds();
    assert.equal(h.tables.notification_delivery_attempts.length, attempts, "late response cannot append a successful receipt");
    const retry = await h.dispatch(timeoutRequest(h));
    assert.equal(retry.body.result.reason, "missed_duplicate_prevented");
    assert.equal(missedPushes(h).length, 1, "unknown provider acceptance must not be replayed");
  });
}

for (const expoMode of ["reject_body", "missing_ticket_id", "null_body", "null_ticket"]) {
  test(`missed: ${expoMode} cannot claim confirmed Expo delivery or replay uncertain send`, async () => {
    const h = expiredMissed({ expoMode, pushTokens: [iosExpo] });
    const result = await h.dispatch(timeoutRequest(h));
    assert.equal(result.status, 200);
    assert.equal(result.body.result.status, "failed");
    assert.equal(result.body.channels.ordinaryPush.pushSent, false);
    assert.equal(missedRows(h)[0].delivered_at, null);
    const attempt = h.tables.notification_delivery_attempts[0];
    assert.equal(attempt.status, "failed");
    assert.equal(attempt.provider_message_id, null);
    await h.dispatch(timeoutRequest(h));
    assert.equal(missedPushes(h).length, 1);
  });
}

test("missed: held old-receipt reconciliation is bounded before reservation and cannot send later", async () => {
  const h = expiredMissed({ receiptMode: "hold", manualTimers: true, pushTokens: [iosExpo] });
  h.tables.notification_delivery_attempts.push({ id: "old-attempt", recipient_user_id: h.ids.callee,
    push_token_id: h.tables.user_push_tokens[0].id, provider: "expo", provider_message_id: "old-ticket", status: "sent" });
  let settled = false;
  const run = h.dispatch(timeoutRequest(h)).then((result) => { settled = true; return result; });
  await h.waitForHold("receipts");
  // Cleanup and missed presentation each encounter the held old receipt read.
  await h.advance(60_000);
  await h.advance(60_000);
  assert.equal(settled, true, "old receipt reconciliation must not hold the new action indefinitely");
  assert.equal((await run).status, 500);
  assert.equal(h.tables.notification_event_dedupes.length, 0);
  assert.equal(missedRows(h).length, 0);
  assert.equal(missedPushes(h).length, 0);
  await h.releaseProviderHolds();
  assert.equal(missedPushes(h).length, 0, "late old reconciliation cannot resume abandoned new dispatch");
  assert.equal((await h.dispatch(timeoutRequest(h))).body.result.status, "sent");
  assert.equal(missedRows(h).length, 1);
  assert.equal(missedPushes(h).length, 1);
});

for (const owner of [DISPATCH_IDS.caller, DISPATCH_IDS.callee]) for (const blocked of [false, true]) {
  test(`missed: unknown directed block ${owner} fails after cleanup; recovered blocked=${blocked} is honored`, async () => {
    const options = { status: "missed", expiresInMs: -1000, blockReadFailureOwner: owner,
      pushTokens: [androidFcm, androidExpo, iosExpo] };
    const h = createCallDispatchHarness(options);
    if (blocked) h.tables.channel_audience_blocks.push({ channel_user_id: owner,
      blocked_user_id: owner === h.ids.caller ? h.ids.callee : h.ids.caller });
    const failed = await h.dispatch(timeoutRequest(h));
    assert.equal(failed.status, 500);
    assert.match(failed.body.message, /missed_audience_block_read_failed/u);
    assert.equal(sends(h, "fcm.googleapis.com").length, 1);
    assert.equal(sends(h, "fcm.googleapis.com")[0].body.message.data.action, "timeout");
    assert.equal(missedRows(h).length, 0);
    assert.equal(missedPushes(h).length, 0);
    assert.equal(h.tables.notification_event_dedupes.length, 0);
    options.blockReadFailureOwner = undefined;
    const recovered = await h.dispatch(timeoutRequest(h));
    assert.equal(recovered.body.result.status, blocked ? "blocked" : "sent");
    assert.equal(missedRows(h).length, blocked ? 0 : 1);
    assert.equal(missedPushes(h).length, blocked ? 0 : 2);
    await h.dispatch(timeoutRequest(h));
    assert.equal(missedRows(h).length, blocked ? 0 : 1);
    assert.equal(missedPushes(h).length, blocked ? 0 : 2);
    assert.equal(sends(h, "fcm.googleapis.com").length, 3, "known block cannot leave the retired native alert active");
  });
}

for (const unknown of [false, true]) {
  test(`missed: account eligibility unknown=${unknown} suppresses presentation after validated cleanup`, async () => {
    const h = expiredMissed({ accountRestrictedUserId: DISPATCH_IDS.callee, accountReadError: unknown });
    const result = await h.dispatch(timeoutRequest(h));
    assert.equal(result.status, unknown ? 500 : 200);
    if (!unknown) assert.equal(result.body.result.status, "blocked");
    assert.equal(sends(h, "fcm.googleapis.com").length, 1);
    assert.equal(missedRows(h).length, 0);
    assert.equal(missedPushes(h).length, 0);
    assert.equal(h.tables.notification_event_dedupes.length, 0);
  });
}

for (const [name, from, to, options, action, verify] of [
  ["missing presentation pass", 'const presentsMissedCall = (action === "timeout" || action === "missed") && status === "missed";',
    "const presentsMissedCall = false;", {}, "timeout", (h) => assert.equal(missedRows(h).length, 1)],
  ["dropped native cleanup", 'action: presentsMissedCall ? "timeout" : action,',
    'action: presentsMissedCall ? "missed" : action,', {}, "timeout", (h) => assert.equal(sends(h, "fcm.googleapis.com").length, 1)],
  ["unexpired direct missed accepted", 'if (!Number.isFinite(expiresAt) || expiresAt > now) {',
    "if (false) {", { expiresInMs: 30_000 }, "missed", (h) => assert.equal(missedRows(h).length, 0)],
  ["missed activity immediately expired", '? { callExpiresAt: input.invite.expires_at }',
    '? { expiresAt: input.invite.expires_at }', {}, "timeout", (h) => assert.equal(missedRows(h)[0].target_context.expiresAt, undefined)],
]) {
  test(`missed mutation: ${name} is caught by actual handler assertions`, async () => {
    const h = expiredMissed({ ...options, sourceMutations: {
      "chilly-chat-call-dispatch/index.ts": (source) => source.replace(from, to),
    } });
    await h.dispatch({ action, inviteId: h.ids.invite });
    assert.throws(() => verify(h), assert.AssertionError);
  });
}

test("missed mutation: successful cleanup masking failed presentation is caught", async () => {
  const h = expiredMissed({ expoTransportError: true, sourceMutations: {
    "_shared/chilly-chat-call-dispatch-policy.mjs": (source) => source.replace(
      'result.result.status = cleanup.result.status === "failed" || missedFailed',
      'result.result.status = cleanup.result.status === "failed"',
    ).replace('? "failed" : missed.result.status;', '? "failed" : cleanup.result.status;'),
  } });
  const result = await h.dispatch(timeoutRequest(h));
  assert.equal(result.body.channels.androidNative.pushSent, true);
  assert.equal(result.body.channels.ordinaryPush.failedCount, 2);
  assert.throws(() => assert.equal(result.body.result.status, "failed"), assert.AssertionError);
});
