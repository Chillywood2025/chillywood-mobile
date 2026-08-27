#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const fail = (message) => {
  console.error(`Premium sandbox policy guard failed: ${message}`);
  process.exitCode = 1;
};
const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};
const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const listFiles = (...roots) => execFileSync("rg", ["--files", ...roots], {
  cwd: root,
  encoding: "utf8",
}).split(/\r?\n/u).filter(Boolean);

const shippableFiles = listFiles("_lib", "app", "components", "hooks", "supabase/functions", "supabase/migrations")
  .filter((file) => !file.startsWith("artifacts/") && !file.startsWith("supabase/.temp/"));
const shippableText = shippableFiles.map((file) => `${file}\n${read(file)}`).join("\n");

assertNotIncludes(shippableText, "PREMIUM_LIVE_GATE_PROOF_HOLD", "shippable Premium proof-hold bypass");
assertNotIncludes(shippableText, "PROOF HOLD", "user-facing Premium setup copy");
if (/premium[-_ ]?live[-_ ]?gate[-_ ]?proof[-_ ]?hold/iu.test(shippableText)) {
  fail("shippable code still contains Premium live proof-hold wording");
}
if (/premium proof[-_ ]?hold/iu.test(shippableText)) {
  fail("shippable code still contains Premium proof-hold wording");
}

const appConfig = read("app.config.ts");
const runtimeConfig = read("_lib/runtimeConfig.ts");
const revenueCat = read("_lib/revenuecat.ts");
const monetization = read("_lib/monetization.ts");
const featureFlags = read("_lib/featureFlags.ts");
const premiumWatchPartyAccess = read("_lib/premiumWatchPartyAccess.ts");
const premiumEntitlements = read("_lib/premiumEntitlements.ts");
const entitlementAuthority = read("_lib/entitlementAuthority.ts");
const entitlementMigration = read("supabase/migrations/202604260001_billing_entitlement_foundation.sql");
const wave1AuthorityMigration = read("supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql");
const mediaStorage = read("supabase/functions/media-storage/index.ts");
const spectatorStartRoom = read("supabase/functions/spectator-start-room/index.ts");
const creatorToolMigration = read("supabase/migrations/202606010001_premium_creator_tool_guards.sql");
const moneyFeatureFlags = read("_lib/moneyFeatureFlags.ts");
const moneySwitchMigration = read("supabase/migrations/202605270001_platform_money_kill_switches.sql");
const paymentRail = read("_lib/paymentRailPolicy.ts");
const serverPaymentRail = read("supabase/functions/_shared/payment-rail-policy.ts");
const validateRuntime = read("scripts/validate-runtime.mjs");
const channelSettings = read("app/channel-settings.tsx");
const adminSandboxRoute = read("app/admin-money-sandbox-purchases.tsx");
const accessSheet = read("components/monetization/access-sheet.tsx");
const subscribe = read("app/subscribe.tsx");
const watchPartyRoute = read("app/watch-party/[partyId].tsx");
const liveStageRoute = read("app/watch-party/live-stage/[partyId].tsx");

assertIncludes(appConfig, "EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY || existingRevenueCat.androidPublicSdkKey", "Expo production RevenueCat public key wiring");
assertIncludes(appConfig, "EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV || existingRevenueCat.androidDebugPublicSdkKey", "Expo debug RevenueCat public key wiring");
assertIncludes(runtimeConfig, "EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY || revenueCatExtra.androidPublicSdkKey", "runtime production RevenueCat public key wiring");
assertIncludes(runtimeConfig, "EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV || revenueCatExtra.androidDebugPublicSdkKey", "runtime debug RevenueCat public key wiring");
assertIncludes(validateRuntime, "revenueCatAndroidPublicKeyConfigured: !!readConfigValue(revenueCat, \"androidPublicSdkKey\")", "runtime validation production RevenueCat key result");
assertIncludes(revenueCat, "androidProductionPublicKeyConfigured = !!runtime.revenueCat.androidPublicSdkKey", "RevenueCat production readiness");
assertIncludes(revenueCat, "mode: \"android-release\"", "RevenueCat Android release mode");
assertIncludes(revenueCat, "apiKey: runtime.revenueCat.androidPublicSdkKey", "RevenueCat release public key use");

assertIncludes(monetization, "PREMIUM_PURCHASE_SHELL_ON_HOLD = true", "Premium purchase shell closed by default");
assertIncludes(monetization, "Premium purchase is temporarily unavailable while Google Play and RevenueCat setup is verified.", "Premium setup-needed fallback copy");
assertIncludes(monetization, "INTERNAL_TESTER_SANDBOX_PURCHASE_MODE", "bounded internal tester sandbox mode");
assertIncludes(monetization, "isPremiumPurchaseShellAvailableForMode", "mode-specific Premium purchase availability");
assertIncludes(monetization, "mode === INTERNAL_TESTER_SANDBOX_PURCHASE_MODE", "internal tester sandbox override is explicit");
assertIncludes(monetization, "&& !runtime.liveMoneyEnabled", "internal tester sandbox blocks live money");
assertIncludes(monetization, "&& !runtime.payoutsEnabled", "internal tester sandbox blocks payouts");
assertIncludes(monetization, "&& !runtime.cashoutEnabled", "internal tester sandbox blocks cash-out");
assertIncludes(monetization, "resolveInternalTesterSandboxPurchaseMode", "approved tester resolver");
assertIncludes(monetization, "providerSandboxCandidate", "provider-backed sandbox candidate state");
assertIncludes(monetization, "Internal tester roles are diagnostics only", "internal tester role diagnostic copy");
assertNotIncludes(monetization, "const enabled = roles.length > 0", "sandbox mode must not require owner/operator/internal-tester role");
assertNotIncludes(monetization, "This account is not approved for internal tester sandbox purchases.", "sandbox mode must not reject solely for missing internal tester role");
assertIncludes(monetization, "No production money, payouts, cash-out, withdrawal, transfer, or payable balance is enabled", "sandbox not-payable copy");
assertIncludes(monetization, "snapshot.targets.premium_subscription.hasEntitlement", "RevenueCat entitlement still required");
assertIncludes(featureFlags, "premiumPurchaseEnabled: false", "default Premium purchase runtime flag");
assertNotIncludes(featureFlags, "premiumPurchaseEnabled: true", "default Premium purchase runtime flag");
assertIncludes(monetization, "Premium access must be granted by billing or an operator-backed entitlement.", "fake Premium rejection");
assertIncludes(monetization, "ownerPlatformAccessCanSatisfyGate = ownerPlatformAccess && !options.strictEntitlementRequired", "owner setup strict gate exclusion");
assertIncludes(monetization, "snapshot.targets.premium_subscription.hasEntitlement", "RevenueCat Premium entitlement path");
assertIncludes(monetization, "readCurrentUserEntitlements(", "backend Premium entitlement path");
assertIncludes(monetization, '["premium", "premium_watch_party", "premium_live", "paid_content"]', "bounded backend Premium entitlement keys");
assertIncludes(premiumWatchPartyAccess, "strictEntitlementRequired: true", "strict Watch-Party Premium entitlement gate");
assertIncludes(premiumEntitlements, "USER_ENTITLEMENTS_TABLE = \"user_entitlements\"", "backend entitlement table helper");
assertIncludes(premiumEntitlements, 'ENTITLEMENT_AUTHORITY_READBACK_RPC = "wave1_entitlement_authority_readback"', "authoritative Premium entitlement RPC");
assertIncludes(premiumEntitlements, "normalizeEntitlementAuthorityReadback", "authoritative Premium entitlement normalization");
assertIncludes(premiumEntitlements, 'unknownDecision(key, "query_failed", authority)', "Premium query failure UNKNOWN fallback");
assertIncludes(premiumEntitlements, 'unknownDecision(key, "stale_generation", authority)', "Premium stale-session UNKNOWN fallback");
assertNotIncludes(premiumEntitlements, ".from(USER_ENTITLEMENTS_TABLE)", "direct client Premium entitlement table authority");
assertIncludes(entitlementAuthority, "decision?.authoritative === true", "authoritative Premium access requirement");
assertIncludes(entitlementAuthority, 'decision.state === "ACTIVE" || decision.state === "GRACE"', "ACTIVE/GRACE-only Premium access grant");
assertIncludes(wave1AuthorityMigration, 'v_row."metadata"->>\'revenuecat_event_type\'=\'REFUND\' then \'REFUNDED\'', "provider refund denial");
assertIncludes(wave1AuthorityMigration, 'v_row."revoked_at" is not null or v_row."status"=\'revoked\' then \'REVOKED\'', "provider revocation denial");
assertIncludes(wave1AuthorityMigration, 'v_row."status"=\'expired\' or (v_row."expires_at" is not null and v_row."expires_at"<=timezone', "expired entitlement denial");
assertIncludes(wave1AuthorityMigration, 'where entitlement."user_id"=((v_session->>\'userId\')::uuid)::text', "exact authenticated-user entitlement binding");
assertIncludes(entitlementMigration, "alter table public.\"user_entitlements\" enable row level security", "user_entitlements RLS");
assertIncludes(entitlementMigration, "with check (public.has_platform_role(array['owner', 'operator']))", "operator-only entitlement writes");
assertIncludes(entitlementMigration, "for insert", "entitlement insert policy");
assertIncludes(entitlementMigration, "for update", "entitlement update policy");
assertIncludes(entitlementMigration, "for delete", "entitlement delete policy");

assertIncludes(creatorToolMigration, "has_active_premium_creator_tool_access", "creator-tool Premium backend guard");
assertIncludes(creatorToolMigration, "entitlement.\"entitlement_key\" = 'premium'", "creator-tool Premium entitlement key");
assertIncludes(creatorToolMigration, "entitlement.\"status\" in ('active', 'trialing', 'grace_period')", "creator-tool active entitlement statuses");
assertIncludes(mediaStorage, "Premium required. Creator video uploads require active Premium entitlement or owner/operator setup access.", "creator upload Premium denial copy");
assertIncludes(mediaStorage, 'actorClient.rpc("monetization_has_active_premium"', "media-storage exact caller Premium entitlement check");
assertIncludes(spectatorStartRoom, ".from(\"user_entitlements\")", "spectator room backend entitlement read");
assertIncludes(channelSettings, "readCurrentUserEntitlement(\"premium\")", "Platform Studio Premium entitlement read");
assertIncludes(channelSettings, "title=\"Premium required\"", "Platform Studio Premium denial copy");
assertIncludes(adminSandboxRoute, "Sandbox Purchase Testing", "sandbox tester purchase route");
assertIncludes(adminSandboxRoute, "Start real sandbox purchase", "sandbox tester digital purchase action");
assertIncludes(adminSandboxRoute, "Start physical merch sandbox checkout", "sandbox tester merch checkout action");
assertIncludes(adminSandboxRoute, "Payout readiness", "sandbox tester payout readiness section");
assertIncludes(adminSandboxRoute, "cannot request, trigger, simulate, cash out", "sandbox tester payout execution blocked");
assertIncludes(accessSheet, "const renderDeferredUnavailable = deferredMonetization && !isPremiumGateSheet", "Premium gates ignore deferred unavailable dead-end mode");
assertIncludes(accessSheet, "if (renderDeferredUnavailable)", "deferred unavailable close path is bounded away from Premium gates");
assertIncludes(accessSheet, "if (isPremiumGateSheet && sheetState?.primaryAction !== \"purchase\")", "Premium gate routes to subscribe only when sandbox purchase is not ready");
assertIncludes(accessSheet, "sheetState?.primaryAction === \"purchase\"", "Premium gate sheet can directly launch provider-backed sandbox purchase");
assertIncludes(monetization, "readMoneyFeatureFlagSummaryWithStatus", "sandbox purchase server-rail readback");
assertIncludes(monetization, "storePurchaseRailState !== \"sandbox_only\"", "bounded sandbox server-rail requirement");
assertIncludes(monetization, "storePurchaseRailReadback.readbackComplete", "missing server-rail readback fail-closed behavior");
assertIncludes(subscribe, "disabled={busy}", "purchase CTA remains actionable for exact readiness explanation");
assertIncludes(subscribe, "premium-purchase-blocked-reason", "visible purchase readiness blocker");
assertIncludes(subscribe, '"testing-details": true', "purchase readiness failure opens diagnostics");
assertNotIncludes(subscribe, "disabled={busy || (!hasPremium && !canPurchase)}", "purchase explanation hidden behind disabled CTA");
const liveTab = read("app/(tabs)/live.tsx");
assertIncludes(liveTab, "requireLiveFirstPremium({ accessKey: \"bottom-live-tab\" })", "Live tab keeps strict Premium access check");
assertIncludes(liveTab, "setPremiumGateVisible(true)", "Live tab Premium denial opens actionable Premium sheet");
assertIncludes(liveTab, "live-tab-start-sandbox-premium-test", "Live tab sandbox purchase test id");
assertIncludes(liveTab, "live-tab-premium-recheck-access", "Live tab entitlement recheck test id");
assertIncludes(watchPartyRoute, "accessGateSheetReason === \"premium_required\" ? \"View Premium\" : \"Review Access\"", "Watch-Party Premium gate uses View Premium action");
assertIncludes(liveStageRoute, "blockedRoomAccessSheetReason === \"premium_required\"", "Live Stage blocked Premium access gets a Premium-specific action");
assertIncludes(liveStageRoute, "? \"View Premium\"", "Live Stage blocked Premium primary label");
assertIncludes(liveStageRoute, "if (blockedRoomAccessSheetReason) {\n                  setLiveWatchPartyAccessSheetVisible(true);", "Live Stage blocked access opens the access sheet instead of Open Party Room");

assertIncludes(moneyFeatureFlags, "live_money_enabled: \"off\"", "live money default off");
for (const key of ["live_money_enabled", "watch_party_seats_enabled", "tips_enabled", "paid_content_enabled", "payouts_enabled"]) {
  assertIncludes(moneySwitchMigration, `('${key}', 'off'`, `${key} seeded off`);
}
assertIncludes(paymentRail, "PREMIUM_PAYMENT_RAIL = \"google_play_revenuecat\"", "Premium payment rail");
assertIncludes(paymentRail, "ANDROID_DIGITAL_CREATOR_CONTENT_STRIPE_ENABLED = false", "Android digital Stripe disabled");
assertIncludes(serverPaymentRail, "PREMIUM_PAYMENT_RAIL = \"google_play_revenuecat\"", "server Premium payment rail");
assertIncludes(serverPaymentRail, "ANDROID_DIGITAL_CREATOR_CONTENT_STRIPE_ENABLED = false", "server Android digital Stripe disabled");

const publicClientFiles = listFiles("_lib", "app", "components", "hooks");
const publicClientText = publicClientFiles.map((file) => `${file}\n${read(file)}`).join("\n");
for (const forbidden of [
  "REVENUECAT_SECRET_API_KEY",
  "REVENUECAT_WEBHOOK_SECRET",
  "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
]) {
  assertNotIncludes(publicClientText, forbidden, `client/normal script secret reference ${forbidden}`);
}

if (process.exitCode) {
  process.exit();
}

console.log("Premium sandbox policy guard passed.");
