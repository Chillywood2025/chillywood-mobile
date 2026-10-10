import assert from "node:assert/strict";
import test from "node:test";
import { createRevenueCatNotificationHarness, ids } from "./revenuecat-notification-harness.mjs";

const products = [
  ["paid_content_access", "paid_video_unlocked", "paid_video_sold", `/player/${ids.source}`],
  ["watch_party_live_ticket", "watch_party_ticket_ready", "watch_party_ticket_sold", `/watch-party/${ids.party}`],
  ["channel_subscription", "channel_subscription_active", "channel_subscription_started", `/channel-subscription/${ids.creator}`],
  ["vip_pass", "vip_access_active", "vip_pass_sold", `/vip-pass/${ids.creator}`],
  ["event_pass", "event_pass_active", "event_pass_sold", `/event/${ids.source}`],
  ["creator_tip", "tip_sent_receipt", "tip_received", `/channel/${ids.creator}`],
];
for (const platform of ["android", "ios"]) for (const [productType, buyerType, creatorType, buyerPath] of products) {
  test(`actual orchestration: ${platform} ${productType} buyer/creator + replay`, async () => {
    const h = createRevenueCatNotificationHarness({ productType, platform });
    const result = await h.run();
    assert.equal(result.status, "processed");
    assert.equal(h.rpcs().length, 1, "one modeled atomic purchase RPC per invocation");
    assert.deepEqual(h.tables.notifications.map((n) => [n.user_id, n.notification_type]), [
      [ids.buyer, buyerType], [ids.creator, creatorType],
    ]);
    assert.deepEqual(h.sends().map((e) => e.body.data.path), [buyerPath, "/channel-studio?tab=monetization&focus=transactions"]);
    for (const row of h.tables.notifications) {
      assert.equal(row.target_context.ledger_event_id, ids.ledger);
      assert.equal(row.target_context.provider_event_id, ids.provider);
      assert.equal(row.target_context.no_access_grant_from_notification, true);
      assert.equal(row.status, "sent");
    }
    for (const send of h.sends()) {
      assert.ok(h.tables.notifications.some((n) => n.id === send.body.data.notificationId));
      if (platform === "ios") assert.equal(send.body.categoryId, "chillywood_activity");
      else assert.equal(send.body.channelId, "default");
    }
    await h.run();
    assert.equal(h.rpcs().length, 2, "replay invokes only the expected atomic RPC once again");
    assert.deepEqual(h.rpcs()[0].args, h.rpcs()[1].args, "exact same event replay");
    assert.equal(h.tables.notifications.length, 2);
    assert.equal(h.sends().length, 2, "successful deliveries are not duplicated");
  });
}

test("uncertain buyer transport retains durable non-success evidence across same processed-ID replay", async () => {
  const h = createRevenueCatNotificationHarness({ pushMode: "throw_buyer" });
  const first = await h.run().then(() => "completed", () => "rejected");
  const initial = { outcome: first, rows: h.tables.notifications.length, attempts: h.tables.notification_delivery_attempts.length };
  assert.equal(h.tables.notifications.filter((n) => n.user_id === ids.creator).length, 1,
    "buyer failure does not prevent the creator notification in the original invocation");
  h.setPushMode("success");
  await h.run();
  assert.equal(h.rpcs().length, 2);
  assert.equal(h.tables.notifications.length, 2, "replay can still create the later creator row");
  console.log("buyer transport replay observation", JSON.stringify({ initial,
    buyerSendAttempts: h.sends().filter((e) => e.body.to.endsWith(ids.buyer)).length,
    buyerState: h.tables.notifications.find((n) => n.user_id === ids.buyer).status,
    creatorState: h.tables.notifications.find((n) => n.user_id === ids.creator).status }));
  assert.equal(h.sends().filter((e) => e.body.to.endsWith(ids.buyer)).length, 1,
    "generic fetch rejection may follow provider acceptance: replay must not blindly resend");
  assert.notEqual(h.tables.notifications.find((n) => n.user_id === ids.buyer).status, "sent",
    "unknown provider acceptance is not success");
  assert.ok(h.tables.notification_delivery_attempts.some((attempt) => (
    attempt.recipient_user_id === ids.buyer && attempt.status === "failed" && attempt.error_code
  )), "transport uncertainty must leave explicit durable non-success evidence rather than only a pending row");
  assert.ok(h.tables.user_push_tokens.every((token) => token.enabled && token.revoked_at === null),
    "unknown transport acceptance cannot revoke a device token");
});

test("held buyer transport has a bounded outcome and does not strand the creator notification", async () => {
  const h = createRevenueCatNotificationHarness({ pushMode: "hold_buyer" });
  let settled = false;
  const run = h.run().then(() => { settled = true; }, () => { settled = true; });
  try {
    await h.waitForBoundary("push_send", (event) => event.body.to.endsWith(ids.buyer));
    await h.advance(60_000);
    console.log("held buyer observation", JSON.stringify({ virtualElapsedMs: 60_000, settled,
      rows: h.tables.notifications.length, creatorRows: h.tables.notifications.filter((n) => n.user_id === ids.creator).length,
      providerAbortSignal: h.sends()[0].hasAbortSignal }));
    assert.equal(settled, true, "notification delivery must not hold webhook orchestration indefinitely");
    assert.equal(h.tables.notifications.filter((n) => n.user_id === ids.creator).length, 1);
  } finally { await h.release(); await run; }
});

test("failed preference lookup cannot silently treat an existing disabled preference as enabled", async () => {
  const h = createRevenueCatNotificationHarness({ preferenceFailure: true,
    preferences: { [ids.buyer]: { push_enabled: false }, [ids.creator]: { push_enabled: false } } });
  await h.run().catch(() => null);
  console.log("preference failure observation", JSON.stringify({ sends: h.sends().length, rows: h.tables.notifications.length }));
  assert.equal(h.rpcs().length, 1);
  assert.equal(h.sends().length, 0, "unavailable preference is not permission to send");
  assert.equal(h.tables.notification_event_dedupes.length, 0, "nothing was reserved before the preference read succeeded");
});

test("proven-unsent buyer preference failure retries exact processed IDs while creator success stays deduped", async () => {
  const h = createRevenueCatNotificationHarness({ preferenceFailure: ids.buyer });
  await assert.rejects(h.run(), /preferences_unavailable/);
  assert.deepEqual(h.tables.notifications.map((n) => n.user_id), [ids.creator]);
  assert.deepEqual(h.tables.notification_event_dedupes.map((n) => n.recipient_user_id), [ids.creator]);
  assert.equal(h.sends().length, 1);
  h.setPreferenceFailure(false);
  await h.run();
  assert.equal(h.rpcs().length, 2);
  assert.deepEqual(h.rpcs()[0].args, h.rpcs()[1].args);
  assert.deepEqual(h.tables.notifications.map((n) => n.user_id).sort(), [ids.buyer, ids.creator].sort());
  assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 1);
  assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.creator)).length, 1);
});

test("held old-ticket reconciliation settles before reservation and same-event replay recovers", async () => {
  const h = createRevenueCatNotificationHarness({ receiptMode: "hold" });
  h.tables.notification_delivery_attempts.push({ id: "prior-attempt", recipient_user_id: ids.buyer,
    provider: "expo", status: "sent", provider_message_id: "prior-ticket", push_token_id: "prior-token" });
  let settled = false;
  const run = h.run().then(() => { settled = true; return null; }, (e) => { settled = true; return e; });
  await h.waitForBoundary("receipt_lookup");
  await h.advance(60_000);
  assert.equal(settled, true, "wait is bounded even though the shared reconciliation HTTP cannot be aborted here");
  assert.match((await run).message, /push_timeout/);
  assert.equal(h.tables.notification_event_dedupes.filter((r) => r.recipient_user_id === ids.buyer).length, 0);
  assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 0);
  const rows = h.tables.notifications.length;
  const sends = h.sends().length;
  await h.release();
  assert.equal(h.tables.notifications.length, rows, "late old-ticket lookup cannot create a new notification");
  assert.equal(h.sends().length, sends, "late lookup cannot resume detached new sends");
  await h.run();
  assert.equal(h.rpcs().length, 2);
  assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 1);
  assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.creator)).length, 1);
});

test("provider-boundary synchronization survives delayed real hashing without consuming the virtual deadline", { timeout: 15_000 }, async () => {
  let releaseDigest;
  let enteredDigest;
  const digestGate = new Promise((resolve) => { releaseDigest = resolve; });
  const digestEntered = new Promise((resolve) => { enteredDigest = resolve; });
  const h = createRevenueCatNotificationHarness({ receiptMode: "hold", beforeDigest: async () => {
    enteredDigest(); await digestGate;
  } });
  h.tables.notification_delivery_attempts.push({ id: "prior-attempt", recipient_user_id: ids.buyer,
    provider: "expo", status: "sent", provider_message_id: "prior-ticket", push_token_id: "prior-token" });
  let settled = false;
  const run = h.run().then(() => { settled = true; return null; }, (error) => { settled = true; return error; });
  try {
    await digestEntered;
    let boundarySettled = false;
    const boundary = h.waitForBoundary("receipt_lookup").then(() => {
      boundarySettled = true; return null;
    }, (error) => { boundarySettled = true; return error; });
    // Thread-pool completion has no relationship to a count of event-loop turns.
    for (let turn = 0; turn < 200; turn++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(boundarySettled, false, "a pending hash is not a missing provider boundary");
    releaseDigest();
    assert.equal(await boundary, null);
    await h.advance(4_999);
    assert.equal(settled, false, "the real scheduling wait cannot consume the virtual provider deadline");
    await h.advance(1);
    assert.match((await run).message, /push_timeout/);
    assert.equal(h.tables.notification_event_dedupes.filter((r) => r.recipient_user_id === ids.buyer).length, 0);
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 0);
    await h.release();
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 0, "late old receipt cannot resume a send");
    await h.run();
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 1);
  } finally {
    releaseDigest(); await h.release(); await run;
  }
});

test("boundary wait has a separate real hang guard and recognizes recorded or unreachable events", { timeout: 15_000 }, async () => {
  let releaseDigest;
  let enteredDigest;
  const digestGate = new Promise((resolve) => { releaseDigest = resolve; });
  const digestEntered = new Promise((resolve) => { enteredDigest = resolve; });
  const h = createRevenueCatNotificationHarness({ beforeDigest: async () => {
    enteredDigest(); await digestGate;
  } });
  const run = h.run();
  try {
    await digestEntered;
    let boundarySettled = false;
    const boundary = h.waitForBoundary("push_send", (event) => event.body.to.endsWith(ids.buyer))
      .then(() => { boundarySettled = true; return null; }, (error) => { boundarySettled = true; return error; });
    await h.advance(60_000);
    assert.equal(boundarySettled, false, "the production clock cannot fire the host hang guard");
    assert.match((await boundary).message, /provider boundary wait exceeded real hang guard/);
    releaseDigest();
    await run;
    await h.waitForBoundary("push_send", (event) => event.body.to.endsWith(ids.buyer));
    await assert.rejects(h.waitForBoundary("never_recorded"), /production run settled without provider boundary/);
  } finally {
    releaseDigest(); await h.release(); await run;
  }
});

test("held provider body times out with no late success receipt and no replay resend", async () => {
  const h = createRevenueCatNotificationHarness({ pushMode: "hold_body_buyer" });
  const run = h.run();
  await h.waitForBoundary("push_send", (event) => event.body.to.endsWith(ids.buyer));
  await h.advance(60_000);
  await run;
  const attempt = h.tables.notification_delivery_attempts.find((a) => a.recipient_user_id === ids.buyer);
  assert.equal(attempt.status, "failed");
  assert.equal(attempt.error_code, "expo_transport_timeout_unknown");
  const attemptCount = h.tables.notification_delivery_attempts.length;
  await h.release();
  assert.equal(h.tables.notification_delivery_attempts.length, attemptCount);
  assert.equal(h.tables.notifications.find((n) => n.user_id === ids.buyer).status, "pending");
  await h.run();
  assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 1);
});

test("recipient and revoked-token filters never send a buyer notification to another owner", async () => {
  const h = createRevenueCatNotificationHarness();
  h.tables.user_push_tokens.find((t) => t.user_id === ids.buyer).revoked_at = "2026-10-10T11:00:00Z";
  h.tables.user_push_tokens.push({ id: "wrong-owner", user_id: "another-account", platform: "android",
    provider: "expo", enabled: true, revoked_at: null, token: "synthetic-other-token" });
  await h.run();
  assert.equal(h.sends().length, 1);
  assert.ok(h.sends()[0].body.to.endsWith(ids.creator));
  assert.equal(h.tables.notifications.length, 2);
});

test("missing durable ledger result never emits notifications or push", async () => {
  const h = createRevenueCatNotificationHarness({ atomicResult: { ledgerEventId: null } });
  await h.run();
  assert.equal(h.rpcs().length, 1);
  assert.equal(h.tables.notifications.length, 0);
  assert.equal(h.sends().length, 0);
});

for (const pushMode of ["reject_body_buyer", "invalid_ticket_buyer"]) {
  test(`${pushMode} records unknown delivery, never false success or blind replay`, async () => {
    const h = createRevenueCatNotificationHarness({ pushMode });
    await h.run();
    const buyer = h.tables.notifications.find((n) => n.user_id === ids.buyer);
    assert.equal(buyer.status, "pending");
    assert.equal(buyer.delivered_at, null);
    const attempt = h.tables.notification_delivery_attempts.find((a) => a.recipient_user_id === ids.buyer);
    assert.equal(attempt.status, "failed");
    assert.match(attempt.error_code, /unknown$/);
    assert.equal(h.tables.notifications.find((n) => n.user_id === ids.creator).status, "sent");
    h.setPushMode("success");
    await h.run();
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 1);
    assert.equal(h.tables.notification_delivery_attempts.length, 2);
  });
}

for (const databaseFailure of ["notification_event_dedupes:insert", "notifications:insert"]) {
  test(`proven-unsent ${databaseFailure} fails visibly and replay recovers without duplicating creator`, async () => {
    const h = createRevenueCatNotificationHarness({ databaseFailure });
    await assert.rejects(h.run(), /notification_(reservation|record)_unavailable/);
    assert.equal(h.tables.notification_event_dedupes.filter((d) => d.recipient_user_id === ids.buyer).length, 0);
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 0);
    assert.equal(h.tables.notifications.find((n) => n.user_id === ids.creator).status, "sent");
    h.setDatabaseFailure(null);
    await h.run();
    assert.equal(h.rpcs().length, 2);
    assert.deepEqual(h.rpcs()[0].args, h.rpcs()[1].args);
    assert.equal(h.tables.notifications.length, 2);
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 1);
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.creator)).length, 1);
  });
}

test("concurrent same-event invocations respect modeled unique reservation and emit each recipient once", async () => {
  const h = createRevenueCatNotificationHarness();
  await Promise.all([h.run(), h.run()]);
  assert.equal(h.rpcs().length, 2);
  assert.equal(h.tables.notifications.length, 2);
  assert.equal(h.tables.notification_event_dedupes.length, 2);
  assert.equal(h.sends().length, 2);
});

test("actual disabled push preferences retain in-app rows and skip provider delivery", async () => {
  const h = createRevenueCatNotificationHarness({ preferences: {
    [ids.buyer]: { push_enabled: false }, [ids.creator]: { push_enabled: false },
  } });
  await h.run();
  assert.equal(h.tables.notifications.length, 2);
  assert.equal(h.sends().length, 0);
  assert.deepEqual(h.tables.notification_delivery_attempts.map((a) => a.error_code), ["preference_disabled", "preference_disabled"]);
});

test("actual disabled categories suppress both rows and push", async () => {
  const h = createRevenueCatNotificationHarness({ preferences: {
    [ids.buyer]: { creator_money_purchases_enabled: false }, [ids.creator]: { creator_money_sales_enabled: false },
  } });
  await h.run();
  assert.equal(h.tables.notifications.length, 0);
  assert.equal(h.sends().length, 0);
});

test("actual iOS ordinary rollout gate prevents push without suppressing durable rows", async () => {
  const h = createRevenueCatNotificationHarness({ platform: "ios", iosRollout: false });
  await h.run();
  assert.equal(h.tables.notifications.length, 2);
  assert.equal(h.sends().length, 0);
  assert.ok(h.tables.notification_delivery_attempts.every((a) => a.error_code === "ios_push_rollout_disabled"));
});

test("actual ignored atomic purchase result creates no notification or send", async () => {
  const h = createRevenueCatNotificationHarness({ atomicStatus: "ignored" });
  assert.equal((await h.run()).status, "ignored");
  assert.equal(h.rpcs().length, 1);
  assert.equal(h.tables.notifications.length, 0);
  assert.equal(h.sends().length, 0);
});

for (const platform of ["android", "ios"]) {
  test(`proven-unsent ${platform} token lookup failure reserves nothing and exact replay recovers`, async () => {
    const h = createRevenueCatNotificationHarness({ platform, tokenReadFailure: platform });
    await assert.rejects(h.run(), /creator_money_push_tokens_unavailable/);
    assert.equal(h.tables.notification_event_dedupes.filter((d) => d.recipient_user_id === ids.buyer).length, 0);
    assert.equal(h.tables.notifications.filter((n) => n.user_id === ids.buyer).length, 0);
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 0);
    assert.equal(h.tables.notification_delivery_attempts.filter((a) => a.recipient_user_id === ids.buyer).length, 0,
      "a failed lookup is not a durable no-token skip");
    assert.equal(h.tables.notifications.find((n) => n.user_id === ids.creator).status, "sent");
    h.setTokenReadFailure(null);
    await h.run(); await h.run();
    assert.equal(h.rpcs().length, 3);
    assert.deepEqual(h.rpcs()[0].args, h.rpcs()[1].args);
    assert.equal(h.tables.notifications.length, 2, "one durable bell row per recipient");
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 1);
    assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.creator)).length, 1);
  });
}

test("one platform token lookup failure cannot partly send and consume the cross-platform event", async () => {
  const h = createRevenueCatNotificationHarness({ tokenReadFailure: "ios" });
  h.tables.user_push_tokens.push({ ...h.tables.user_push_tokens.find((t) => t.user_id === ids.buyer),
    id: "synthetic-ios-buyer", platform: "ios", token: `synthetic-ios-${ids.buyer}` });
  await assert.rejects(h.run(), /creator_money_push_tokens_unavailable/);
  assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 0);
  h.setTokenReadFailure(null);
  await Promise.all([h.run(), h.run()]);
  assert.equal(h.tables.notifications.filter((n) => n.user_id === ids.buyer).length, 1);
  assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.buyer)).length, 2,
    "one alert for each originally eligible platform after recovered lookup");
  assert.equal(h.sends().filter((s) => s.body.to.endsWith(ids.creator)).length, 1);
});

test("disabled push does not depend on token lookup availability", async () => {
  const h = createRevenueCatNotificationHarness({ tokenReadFailure: "android", preferences: {
    [ids.buyer]: { push_enabled: false }, [ids.creator]: { push_enabled: false },
  } });
  await h.run();
  assert.equal(h.tables.notifications.length, 2);
  assert.equal(h.events.filter((e) => e.kind === "db" && e.table === "user_push_tokens").length, 0);
  assert.equal(h.sends().length, 0);
});

for (const blocked of [false, true]) {
  test(`unknown audience block eligibility reserves nothing; recovered blocked=${blocked} replay obeys actual relation`, async () => {
    const h = createRevenueCatNotificationHarness({ blockReadFailure: true });
    if (blocked) h.tables.channel_audience_blocks.push({ channel_user_id: ids.creator, blocked_user_id: ids.buyer });
    await assert.rejects(h.run(), /creator_money_notification_block_check_unavailable/);
    assert.equal(h.tables.notification_event_dedupes.length, 0);
    assert.equal(h.tables.notifications.length, 0);
    assert.equal(h.sends().length, 0);
    assert.equal(h.tables.notification_delivery_attempts.length, 0);
    h.setBlockReadFailure(false);
    await h.run(); await h.run();
    assert.equal(h.rpcs().length, 3);
    assert.deepEqual(h.rpcs()[0].args, h.rpcs()[1].args, "same durable processed-event IDs are replayed");
    assert.equal(h.tables.notifications.length, blocked ? 0 : 2);
    assert.equal(h.sends().length, blocked ? 0 : 2);
    assert.equal(h.tables.notification_event_dedupes.length, blocked ? 0 : 2);
  });
}

for (const platform of ["ios", "android"]) for (const writer of ["store", "live"]) {
  test(`actual ${platform} ${writer} entry rejects unknown intent after atomic result and exact replay recovers`, async () => {
    const h = createRevenueCatNotificationHarness({ platform, writer, intentReadFailure: true,
      productType: writer === "live" ? "live_watch_party_access_pass" : "creator_tip" });
    await assert.rejects(h.run(), /notification intent lookup failed/);
    assert.equal(h.rpcs().length, 1, "the completed atomic purchase result is modeled, not modified");
    assert.equal(h.tables.notification_event_dedupes.length, 0);
    assert.equal(h.tables.notifications.length, 0);
    assert.equal(h.sends().length, 0);
    assert.equal(h.tables.notification_delivery_attempts.length, 0);
    h.setIntentReadFailure(false);
    await h.run(); await h.run();
    assert.equal(h.rpcs().length, 3);
    assert.deepEqual(h.rpcs()[0].args, h.rpcs()[1].args, "retry preserves the exact atomic RPC request");
    assert.equal(h.tables.notifications.length, 2);
    assert.deepEqual(h.tables.notifications.map((n) => n.user_id), [ids.buyer, ids.creator]);
    assert.equal(h.sends().length, 2, "recovered replay delivers once per exact recipient");
    assert.equal(h.sends()[0].body.data.path, writer === "live"
      ? `/watch-party/live-stage/${ids.party}` : `/channel/${ids.creator}`);
  });
}
