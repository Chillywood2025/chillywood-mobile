import assert from "node:assert/strict";
import test from "node:test";
import { createRevenueCatNotificationHarness, ids } from "./revenuecat-notification-harness.mjs";

// Match the actual SQL duplicate branch, which does not return intent/grant/
// ledger IDs. The production Edge writer and notification code run unchanged.
const duplicate = { status: "processed", reason: "duplicate_provider_event",
  providerEventId: ids.provider, duplicateProviderEvent: true, authorityGranted: false };

for (const platform of ["ios", "android"]) {
  for (const productType of ["live_watch_party_access_pass", "live_watch_party_seat_pass"]) {
    test(`${platform} ${productType}: sparse provider replay recovers a proven-unsent receipt`, async () => {
      const first = { status: "processed", productKey: "synthetic-product", productType,
        purchaseIntentId: ids.intent, providerEventId: ids.provider, ledgerEventId: ids.ledger };
      const h = createRevenueCatNotificationHarness({ writer: "live", platform, productType,
        preferenceFailure: ids.buyer, atomicResults: [first, duplicate, duplicate] });
      await assert.rejects(h.run(), /preferences_unavailable/);
      assert.deepEqual(h.tables.notifications.map((n) => n.user_id), [ids.creator]);
      h.setPreferenceFailure(false);
      await h.run();
      await h.run();
      assert.deepEqual(h.tables.notifications.map((n) => n.user_id).sort(), [ids.buyer, ids.creator].sort());
      assert.equal(h.sends().length, 2, "same immutable receipt cannot duplicate deliveries");
      assert.ok(h.tables.notifications.every((n) => n.target_context.ledger_event_id === ids.ledger));
      assert.equal(h.rpcs().length, 3, "one original atomic call per webhook, no extra money mutation");
      assert.ok(h.events.filter((e) => e.table === "money_access_ledger_events" || e.table === "money_purchase_intents")
        .every((e) => e.operation === "select"));
    });
  }
  for (const event_timestamp_ms of [undefined, null, "invalid", 0, -1, Infinity]) {
    test(`${platform} active Live Stage timestamp ${String(event_timestamp_ms)} fails closed before money RPC`, async () => {
      const h = createRevenueCatNotificationHarness({ writer: "live", platform,
        productType: "live_watch_party_access_pass", event: { event_timestamp_ms } });
      const result = await h.run();
      assert.equal(result.status, "ignored");
      assert.equal(result.reason, "provider_occurred_at_missing_or_invalid");
      assert.equal(h.rpcs().length, 0);
      assert.equal(h.tables.notifications.length, 0);
    });
  }
}

for (const mismatch of ["user_id", "creator_id", "source_id", "source_type", "product_id"]) {
  test(`sparse Live Stage replay rejects mismatched durable ${mismatch}`, async () => {
    const h = createRevenueCatNotificationHarness({ writer: "live", productType: "live_watch_party_access_pass",
      atomicResults: [duplicate] });
    h.tables.money_access_ledger_events[0][mismatch] = "different-identity";
    await assert.rejects(h.run(), /provenance unavailable/);
    assert.equal(h.tables.notifications.length, 0);
    assert.equal(h.sends().length, 0);
  });
}

test("sparse Live Stage replay remains retryable on ledger lookup failure", async () => {
  const h = createRevenueCatNotificationHarness({ writer: "live", productType: "live_watch_party_access_pass",
    ledgerReadFailure: true, atomicResults: [duplicate, duplicate] });
  await assert.rejects(h.run(), /ledger lookup failed/);
  assert.equal(h.tables.notifications.length, 0);
  h.setLedgerReadFailure(false);
  await h.run();
  assert.equal(h.tables.notifications.length, 2);
});

test("ignored provider result never recovers purchase notifications", async () => {
  const h = createRevenueCatNotificationHarness({ writer: "live", productType: "live_watch_party_access_pass",
    atomicResults: [{ ...duplicate, status: "ignored" }] });
  assert.equal((await h.run()).status, "ignored");
  assert.equal(h.tables.notifications.length, 0);
  assert.equal(h.events.filter((e) => e.table === "money_access_ledger_events").length, 0);
});
