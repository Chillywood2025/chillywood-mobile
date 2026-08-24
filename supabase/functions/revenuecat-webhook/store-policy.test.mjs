import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canReconcileExistingProviderEventIntent,
  isTerminalRevenueCatLifecycleEvent,
  isVerifiedRevenueCatTransferPolicy,
  isValidPremiumStoreProductResolution,
  resolveRevenueCatTransferUserId,
  resolveRevenueCatTransferUsers,
  resolveRevenueCatStorePolicy,
  shouldProcessRevenueCatAppStoreEvent,
} from "./store-policy.mjs";

test("terminal App Store lifecycle events remain processable while new purchases are off", () => {
  for (const eventType of [
    "CANCELLATION",
    "EXPIRATION",
    "REFUND",
    "REVOCATION",
    "SUBSCRIPTION_PAUSED",
  ]) {
    assert.equal(isTerminalRevenueCatLifecycleEvent(eventType), true);
    assert.equal(shouldProcessRevenueCatAppStoreEvent("off", "sandbox", eventType), true);
    assert.equal(shouldProcessRevenueCatAppStoreEvent("off", "production", eventType), true);
  }
});

test("new App Store purchase events still fail closed while the switch is off", () => {
  for (const eventType of ["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE", "RENEWAL", "PRODUCT_CHANGE"]) {
    assert.equal(isTerminalRevenueCatLifecycleEvent(eventType), false);
    assert.equal(shouldProcessRevenueCatAppStoreEvent("off", "sandbox", eventType), false);
    assert.equal(shouldProcessRevenueCatAppStoreEvent("off", "production", eventType), false);
  }
});

test("sandbox-only switch admits sandbox purchases but not production purchases", () => {
  assert.equal(shouldProcessRevenueCatAppStoreEvent("sandbox_only", "sandbox", "INITIAL_PURCHASE"), true);
  assert.equal(shouldProcessRevenueCatAppStoreEvent("sandbox_only", "production", "INITIAL_PURCHASE"), false);
});

test("partial provider-event retries only reuse the matching purchase intent", () => {
  const providerEventId = "provider-event-1";
  const eventOccurredAt = "2026-07-15T12:00:00.000Z";

  assert.equal(canReconcileExistingProviderEventIntent({
    status: "pending",
    expires_at: "2026-07-15T12:05:00.000Z",
    metadata: {},
  }, providerEventId, eventOccurredAt), true);
  assert.equal(canReconcileExistingProviderEventIntent({
    status: "pending",
    expires_at: "2026-07-15T11:55:00.000Z",
    metadata: {},
  }, providerEventId, eventOccurredAt), false);
  assert.equal(canReconcileExistingProviderEventIntent({
    status: "consumed",
    expires_at: "2026-07-15T12:05:00.000Z",
    metadata: { consumed_by_provider_event_id: providerEventId },
  }, providerEventId, eventOccurredAt), true);
  assert.equal(canReconcileExistingProviderEventIntent({
    status: "consumed",
    expires_at: "2026-07-15T12:05:00.000Z",
    metadata: { consumed_by_provider_event_id: "different-event" },
  }, providerEventId, eventOccurredAt), false);
});

test("Premium writes require an exact App Store product mapping", () => {
  const exactResolution = {
    product: { id: "premium-product", product_type: "premium_subscription" },
    mapping: {
      concept: "premium",
      creates_payable_balance: false,
      environment: "sandbox",
      grants_livekit_authority: false,
      platform: "ios",
      provider: "revenuecat_app_store",
      provider_product_id: "com.chillywood.premium.monthly",
      status: "sandbox",
      store: "app_store",
      unlocks_digital_access: true,
    },
    storePolicy: { provider: "revenuecat_app_store" },
  };

  assert.equal(isValidPremiumStoreProductResolution(
    exactResolution,
    "com.chillywood.premium.monthly",
    "sandbox",
    "INITIAL_PURCHASE",
  ), true);
  assert.equal(isValidPremiumStoreProductResolution(
    exactResolution,
    "com.chillywood.premium.unexpected",
    "sandbox",
    "INITIAL_PURCHASE",
  ), false);
  assert.equal(isValidPremiumStoreProductResolution(
    { ...exactResolution, mapping: { ...exactResolution.mapping, status: "off" } },
    "com.chillywood.premium.monthly",
    "sandbox",
    "REFUND",
  ), true);
  assert.equal(isValidPremiumStoreProductResolution(
    exactResolution,
    "com.chillywood.premium.monthly",
    "production",
    "INITIAL_PURCHASE",
  ), false, "a sandbox mapping must never grant a production purchase");
  assert.equal(isValidPremiumStoreProductResolution(
    {
      ...exactResolution,
      mapping: {
        ...exactResolution.mapping,
        environment: "production",
        status: "active",
      },
    },
    "com.chillywood.premium.monthly",
    "production",
    "INITIAL_PURCHASE",
  ), true, "production purchases require the independently activated mapping state");
  assert.equal(isValidPremiumStoreProductResolution(
    exactResolution,
    "com.chillywood.premium.monthly",
    "setup",
    "INITIAL_PURCHASE",
  ), false, "setup/unknown environments must fail closed");
});

test("the existing non-App-Store Premium product path remains valid", () => {
  assert.equal(isValidPremiumStoreProductResolution({
    product: {
      id: "google-premium",
      product_type: "premium_subscription",
      provider: "revenuecat_google_play",
      provider_product_id: "premium_subscription",
    },
    mapping: null,
    providerProductId: "premium_subscription",
    storePolicy: { provider: "revenuecat_google_play", supportsGoogleBasePlans: true },
  }, "premium_subscription:monthly", "sandbox", "INITIAL_PURCHASE"), true);
});

test("unknown stores cannot use a Premium entitlement signal to bypass provider mapping", () => {
  assert.equal(isValidPremiumStoreProductResolution({
    product: {
      id: "google-premium",
      product_type: "premium_subscription",
      provider: "revenuecat_google_play",
      provider_product_id: "premium_subscription",
    },
    mapping: null,
    providerProductId: "premium_subscription",
    storePolicy: { provider: "revenuecat" },
  }, "premium_subscription", "sandbox", "INITIAL_PURCHASE"), false);
});

test("TRANSFER resolves one exact UUID on each side while ignoring RevenueCat anonymous aliases", () => {
  assert.deepEqual(resolveRevenueCatTransferUsers({
    type: "TRANSFER",
    transferred_from: [
      "$RCAnonymousID:source",
      "11111111-1111-4111-8111-111111111111",
    ],
    transferred_to: [
      "$RCAnonymousID:target",
      "22222222-2222-4222-8222-222222222222",
    ],
  }), {
    sourceUserId: "11111111-1111-4111-8111-111111111111",
    targetUserId: "22222222-2222-4222-8222-222222222222",
  });
});

test("TRANSFER fails closed for missing, ambiguous, malformed, or replay-to-self identities", () => {
  assert.equal(resolveRevenueCatTransferUsers({
    type: "TRANSFER",
    transferred_from: ["$RCAnonymousID:source"],
    transferred_to: ["22222222-2222-4222-8222-222222222222"],
  }), null);
  assert.equal(resolveRevenueCatTransferUsers({
    type: "TRANSFER",
    transferred_from: [
      "11111111-1111-4111-8111-111111111111",
      "malformed-source",
    ],
    transferred_to: ["22222222-2222-4222-8222-222222222222"],
  }), null);
  assert.equal(resolveRevenueCatTransferUsers({
    type: "TRANSFER",
    transferred_from: ["11111111-1111-4111-8111-111111111111"],
    transferred_to: [
      "22222222-2222-4222-8222-222222222222",
      " malformed-target ",
    ],
  }), null);
  assert.equal(resolveRevenueCatTransferUsers({
    type: "TRANSFER",
    transferred_from: [
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    ],
    transferred_to: ["22222222-2222-4222-8222-222222222222"],
  }), null);
  assert.equal(resolveRevenueCatTransferUsers({
    type: "TRANSFER",
    transferred_from: ["not-a-uuid"],
    transferred_to: ["22222222-2222-4222-8222-222222222222"],
  }), null);
  assert.equal(resolveRevenueCatTransferUsers({
    type: "TRANSFER",
    transferred_from: ["11111111-1111-4111-8111-111111111111"],
    transferred_to: ["11111111-1111-4111-8111-111111111111"],
  }), null);
  assert.equal(resolveRevenueCatTransferUsers({
    type: "RENEWAL",
    transferred_from: ["11111111-1111-4111-8111-111111111111"],
    transferred_to: ["22222222-2222-4222-8222-222222222222"],
  }), null);
});

test("TRANSFER quarantine can narrow only one exact non-anonymous source subject", () => {
  assert.equal(resolveRevenueCatTransferUserId([
    "$RCAnonymousID:legacy-source",
    "11111111-1111-4111-8111-111111111111",
  ]), "11111111-1111-4111-8111-111111111111");
  assert.equal(resolveRevenueCatTransferUserId([
    "11111111-1111-4111-8111-111111111111",
    "33333333-3333-4333-8333-333333333333",
  ]), null);
  assert.equal(resolveRevenueCatTransferUserId([
    "11111111-1111-4111-8111-111111111111",
    "malformed-source",
  ]), null);
  assert.equal(resolveRevenueCatTransferUserId([]), null);
});

test("TRANSFER permits only exact App Store sandbox policy", () => {
  assert.equal(isVerifiedRevenueCatTransferPolicy(
    resolveRevenueCatStorePolicy("APP_STORE"),
    "sandbox",
  ), true);
  assert.equal(isVerifiedRevenueCatTransferPolicy(
    resolveRevenueCatStorePolicy("MAC_APP_STORE"),
    "sandbox",
  ), false);
  assert.equal(isVerifiedRevenueCatTransferPolicy(
    resolveRevenueCatStorePolicy("PLAY_STORE"),
    "sandbox",
  ), false);
  assert.equal(isVerifiedRevenueCatTransferPolicy(
    resolveRevenueCatStorePolicy("APP_STORE"),
    "production",
  ), false);
});

test("verified TRANSFER handling runs before the generic non-Premium path and uses the atomic RPC", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const transferWriter = source.indexOf("const writePremiumTransferFromRevenueCatEvent");
  const transferRpc = source.indexOf('.rpc("process_revenuecat_premium_transfer_atomic"', transferWriter);
  const server = source.indexOf("Deno.serve", transferRpc);
  const transferBranch = source.indexOf('normalizeEventType(event.type) === "TRANSFER"', server);
  const genericNonPremiumBranch = source.indexOf("if (!hasPremiumSignal(event))", transferBranch);

  assert.ok(transferWriter >= 0);
  assert.ok(transferRpc > transferWriter);
  assert.ok(server > transferRpc);
  assert.ok(transferBranch > server);
  assert.ok(genericNonPremiumBranch > transferBranch);
  assert.match(source, /isVerifiedRevenueCatTransferPolicy\(storePolicy, environment\)/u);
  assert.match(source, /transfer is limited to verified sandbox App Store events/u);
});

test("Premium catalog cardinality is resolved before the atomic authority projector", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const functionStart = source.indexOf("const writePremiumEntitlementFromRevenueCatEvent");
  const functionEnd = source.indexOf("Deno.serve", functionStart);
  const premiumWrite = source.slice(functionStart, functionEnd);
  const validationIndex = premiumWrite.indexOf("hasExactPremiumStoreProductIdentity(");
  const entitlementMutationIndex = premiumWrite.indexOf('.rpc("process_revenuecat_premium_event_atomic"');

  assert.ok(functionStart >= 0);
  assert.ok(validationIndex >= 0);
  assert.ok(entitlementMutationIndex >= 0);
  assert.ok(validationIndex < entitlementMutationIndex);
  assert.match(premiumWrite, /p_product_id: resolvedProductId/u);
  assert.match(premiumWrite, /p_store_mapping_id: resolvedStoreMappingId/u);
  assert.match(premiumWrite, /p_original_transaction_id: originalTransactionId/u);
});

test("iOS store and VoIP migrations retain scoped constraints and cleanup indexing", () => {
  const storeMigration = readFileSync(new URL(
    "../../migrations/20260715151250_ios_app_store_mappings.sql",
    import.meta.url,
  ), "utf8");
  const constraintStart = storeMigration.indexOf(
    'constraint "monetization_store_mappings_subscription_shape_check"',
  );
  const constraintEnd = storeMigration.indexOf(
    'constraint "monetization_store_mappings_active_proof_check"',
    constraintStart,
  );
  const subscriptionConstraint = storeMigration.slice(constraintStart, constraintEnd);
  assert.match(subscriptionConstraint, /"revenuecat_entitlement"/u);
  assert.match(subscriptionConstraint, /"platform" <> 'ios'/u);
  assert.match(subscriptionConstraint, /"store" <> 'app_store'/u);
  assert.match(subscriptionConstraint, /"apple_subscription_group"/u);

  const voipMigration = readFileSync(new URL(
    "../../migrations/20260715150522_ios_voip_push_token_foundation.sql",
    import.meta.url,
  ), "utf8");
  assert.match(
    voipMigration,
    /voip_push_delivery_attempts_token_idx[\s\S]*\("voip_push_token_id"\)[\s\S]*where "voip_push_token_id" is not null/u,
  );
});

test("affected Edge Functions use the exact reviewed Supabase client version", () => {
  for (const relativePath of [
    "../_shared/provider-readiness.ts",
    "../chilly-chat-call-dispatch/index.ts",
    "../ios-voip-call-dispatch/index.ts",
    "../ios-voip-push-tokens/index.ts",
    "../notification-device-tokens/index.ts",
    "../notification-dispatch/index.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /npm:@supabase\/supabase-js@2\.110\.6/u, relativePath);
  }
});
