import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));

const manifest = json("config/ios/app-store-products.json");
const storeKit = json("config/ios/Chillywood.storekit");
const runtimeCatalog = read("_lib/iosAppStoreCommerce.ts");
const clientPolicy = read("_lib/paymentRailPolicy.ts");
const serverPolicy = read("supabase/functions/_shared/payment-rail-policy.ts");
const readiness = read("supabase/migrations/202608210001_creator_money_production_readiness_ios_parity.sql");
const routing = read("supabase/migrations/202608210002_ios_creator_money_rpc_routing.sql");
const atomic = read("supabase/migrations/202608210003_ios_creator_money_atomic_provider_processing.sql");
const settlement = read("supabase/migrations/202608210004_creator_money_settlement_and_payout_safety.sql");
const convergence = read("supabase/migrations/202608210005_creator_money_terminal_reconciliation_and_payout_allocations.sql");
const payoutCompletion = read("supabase/migrations/202608210006_creator_money_payout_processing_recovery_completion.sql");
const payoutLocking = read("supabase/migrations/202608210007_creator_money_payout_result_locking_fix.sql");
const paidVideo = read("_lib/creatorPaidVideos.ts");
const paidEvents = read("_lib/paidCreatorEvents.ts");
const vipPasses = read("_lib/creatorVipPasses.ts");
const seatPasses = read("_lib/paidWatchPartyTickets.ts");
const channelSubscriptions = read("_lib/channelSubscriptions.ts");
const creatorMonetizationGuard = read("scripts/guard-creator-monetization-policy.mjs");
const premiumEntitlements = read("_lib/premiumEntitlements.ts");
const entitlementAuthority = read("_lib/entitlementAuthority.ts");
const wave1AuthorityMigration = read("supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql");

const conceptCount = (concept) => manifest.catalog.filter((entry) => entry.concept === concept).length;

test("finite iOS creator-money catalog is complete and activation stays off", () => {
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.bundleIdentifier, "com.chillywood.mobile");
  assert.equal(manifest.liveMoneyEnabled, false);
  assert.equal(manifest.productionActivation.enabled, false);
  assert.equal(manifest.productionActivation.requiresProviderProof, true);
  assert.equal(manifest.productionActivation.requiresOwnerApproval, true);
  assert.equal(manifest.productionActivation.requiresWave1CreatorEligibility, true);
  assert.equal(manifest.productionActivation.requiresPhysicalDeviceProof, true);
  assert.equal(manifest.catalog.length, 30);
  assert.equal(new Set(manifest.catalog.map((entry) => entry.productId)).size, 30);
  assert.equal(conceptCount("premium"), 2);
  assert.equal(conceptCount("creator_tip"), 4);
  assert.equal(conceptCount("seat_pass"), 4);
  assert.equal(conceptCount("paid_video"), 4);
  assert.equal(conceptCount("event_pass"), 4);
  assert.equal(conceptCount("vip_pass"), 4);
  assert.equal(conceptCount("channel_subscription"), 8);
  assert.deepEqual(manifest.disabledDynamicConcepts, []);
});

test("StoreKit configuration exactly matches the canonical finite catalog", () => {
  const records = [
    ...(storeKit.products ?? []).map((entry) => ({ entry, group: null })),
    ...(storeKit.subscriptionGroups ?? []).flatMap((group) =>
      (group.subscriptions ?? []).map((entry) => ({ entry, group }))),
  ];
  const ids = records.map(({ entry }) => entry.productID);
  assert.deepEqual(ids.sort(), manifest.catalog.map((entry) => entry.productId).sort());
  assert.equal((storeKit.subscriptionGroups ?? []).length, 9);
  const creatorGroups = (storeKit.subscriptionGroups ?? []).filter((group) =>
    (group.subscriptions ?? []).some((entry) => entry.productID?.startsWith("com.chillywood.channel.subscription.slot")),
  );
  assert.equal(creatorGroups.length, 8);
  assert.equal(new Set(creatorGroups.map((group) => group.id)).size, 8);

  const byId = new Map(records.map((record) => [record.entry.productID, record]));
  for (const manifestEntry of manifest.catalog) {
    const local = byId.get(manifestEntry.productId);
    assert.ok(local, manifestEntry.productId);
    const expectedType = manifestEntry.type === "consumable" ? "Consumable" : "RecurringSubscription";
    assert.equal(local.entry.type, expectedType, `${manifestEntry.productId} type`);
    if (manifestEntry.type === "auto_renewable_subscription") {
      const expectedGroupId = `group-${manifestEntry.subscriptionGroup}`;
      assert.equal(local.entry.recurringSubscriptionPeriod, manifestEntry.duration, `${manifestEntry.productId} duration`);
      assert.equal(local.group?.id, expectedGroupId, `${manifestEntry.productId} group ID`);
      assert.equal(local.group?.name, manifestEntry.subscriptionGroup, `${manifestEntry.productId} group name`);
      assert.equal(local.entry.subscriptionGroupID, expectedGroupId, `${manifestEntry.productId} group binding`);
    } else {
      assert.equal(local.group, null, `${manifestEntry.productId} consumable group`);
      assert.equal(local.entry.recurringSubscriptionPeriod, undefined, `${manifestEntry.productId} consumable duration`);
      assert.equal(local.entry.subscriptionGroupID, undefined, `${manifestEntry.productId} consumable group binding`);
    }
  }
});

test("RevenueCat purchase selection fails closed on mismatched iOS product identity", () => {
  for (const source of [paidVideo, paidEvents, vipPasses, seatPasses]) {
    assert.doesNotMatch(source, /\?\?\s*products\[0\]/u);
    assert.match(source, /products\.find\(\(entry\) => String\(entry\.identifier \?\? ""\)\.trim\(\) === productId\) \?\? null/u);
  }
  assert.match(channelSubscriptions, /return normalized \? \[normalized\] : \[\];/u);
  const candidateBuilder = channelSubscriptions.match(
    /const buildSubscriptionProductIdentifierCandidates = \(productId: string\) => \{[\s\S]*?\n\};/u,
  )?.[0] ?? "";
  assert.doesNotMatch(candidateBuilder, /withoutBasePlan|:monthly/u,
    "the client cannot derive a different Google Play base-plan SKU after exact server readback");
  assert.doesNotMatch(candidateBuilder, /\bCHANNEL_SUBSCRIPTION_SANDBOX_PROVIDER_PRODUCT_ID\b/u,
    "a different global sandbox SKU cannot satisfy an exact Android purchase intent");
  assert.doesNotMatch(candidateBuilder, /\bCHANNEL_SUBSCRIPTION_SANDBOX_PROVIDER_PRODUCT_BASE_PLAN_ID\b/u,
    "a different global sandbox base-plan SKU cannot satisfy an exact Android purchase intent");
  assert.match(channelSubscriptions, /if \(!periodEnd\) return false;/u,
    "missing subscription expiry remains fail closed in client readback");
});

test("Premium policy guard follows authoritative RPC revocation and UNKNOWN semantics", () => {
  assert.match(creatorMonetizationGuard, /ENTITLEMENT_AUTHORITY_READBACK_RPC = "wave1_entitlement_authority_readback"/u);
  assert.match(creatorMonetizationGuard, /authoritative: false, grantsProtectedAccess: false/u);
  assert.match(creatorMonetizationGuard, /decision\.state === "ACTIVE" \|\| decision\.state === "GRACE"/u);
  assert.doesNotMatch(creatorMonetizationGuard, /assertIncludes\(premiumEntitlements, "revoked_at"/u);
  assert.match(premiumEntitlements, /normalizeEntitlementAuthorityReadback/u);
  assert.doesNotMatch(premiumEntitlements, /\.from\(USER_ENTITLEMENTS_TABLE\)/u);
  assert.doesNotMatch(premiumEntitlements, /\.from\(["']user_entitlements["']\)/u);
  assert.match(entitlementAuthority, /authoritative: false, grantsProtectedAccess: false/u);
  assert.match(entitlementAuthority, /decision\?\.authoritative === true/u);
  assert.match(wave1AuthorityMigration, /v_row\."revoked_at" is not null or v_row\."status" = 'revoked' then 'REVOKED'/u);
  assert.match(wave1AuthorityMigration, /'grantsProtectedAccess', v_state in \('ACTIVE', 'GRACE'\)/u);
});

test("runtime and server policies route iOS creator digital money through finite App Store authority", () => {
  for (const marker of ["paid_video", "event_pass", "vip_pass", "channel_subscription", "listIosChannelSubscriptionSlots"]) {
    assert.match(runtimeCatalog, new RegExp(marker));
  }
  for (const policy of [clientPolicy, serverPolicy]) {
    assert.match(policy, /PAYMENT_RAIL_POLICY_VERSION = "2026-05-15"/);
    assert.match(policy, /ios_creator_paid_digital_uses_finite_app_store_catalog_server_authority/);
    assert.match(policy, /createsPayableBalance: false/);
    assert.match(policy, /grantsLiveKitAuthority: false/);
  }
});

test("purchase authority requires exact source, eligibility, provider proof, and remains non-payable", () => {
  assert.match(readiness, /owner_required_for_high_risk_money_activation/);
  assert.match(readiness, /wave1_creator_eligibility/);
  assert.match(readiness, /owner_release_approved/);
  assert.match(readiness, /physical_device_proof/);
  assert.match(readiness, /provider_proof/);
  assert.match(routing, /create_ios_creator_money_purchase_intent/);
  assert.match(convergence, /canonical_content_type/);
  assert.match(convergence, /creator_video/);
  assert.match(atomic, /pending_verification/);
  assert.match(atomic, /grants_livekit_publish/);
  assert.match(atomic, /grants_payout_access/);
});

test("provider processing cannot skip settlement and hold before payout availability", () => {
  assert.match(settlement, /finalize_creator_money_settlement/);
  assert.match(settlement, /release_mature_creator_money_settlements/);
  assert.match(settlement, /payout_hold_days_min/);
  assert.match(settlement, /pending_verification/);
  assert.match(settlement, /payout_switches_not_enabled/);
  assert.match(settlement, /settlement_reference_hash/);
});

test("refund, reversal, partial payout, in-flight payout, and post-payout recovery are represented", () => {
  assert.match(convergence, /lifecycle_no_financial_reversal/);
  assert.match(convergence, /creator_money_reversal_links/);
  assert.match(convergence, /creator_payout_allocations/);
  assert.match(convergence, /payout_allocation_incomplete/);
  assert.match(payoutCompletion, /creator_money_payout_incidents/);
  assert.match(payoutCompletion, /provider_processing_during_reversal/);
  assert.match(payoutCompletion, /paid_after_reversal/);
  assert.match(payoutCompletion, /creator_money_recovery_obligations/);
  assert.match(payoutCompletion, /payable_state"='paid/);
  assert.match(payoutLocking, /creator-payout-result:/);
  assert.match(payoutLocking, /creator-payout:/);
  assert.match(payoutLocking, /paid_payout_allocation_mismatch/);
});

test("source-only readiness migrations contain no outbound provider money movement", () => {
  const source = [readiness, routing, atomic, settlement, convergence, payoutCompletion, payoutLocking].join("\n");
  for (const forbidden of ["stripe.transfers.create", "stripe.payouts.create", "api.stripe.com", "api.revenuecat.com"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
