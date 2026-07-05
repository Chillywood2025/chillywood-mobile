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
const entitlementMigration = read("supabase/migrations/202604260001_billing_entitlement_foundation.sql");
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
assertIncludes(monetization, "hasPlatformRoleMembership(memberships, [\"owner\", \"operator\"])", "owner/operator sandbox approval");
assertIncludes(monetization, "isBetaOperatorIdentity", "runtime allowlisted tester approval");
assertIncludes(monetization, "betaAccessActive === true", "active internal tester approval");
assertIncludes(monetization, "Rows remain sandbox/test/not payable", "sandbox not-payable copy");
assertIncludes(monetization, "snapshot.targets.premium_subscription.hasEntitlement", "RevenueCat entitlement still required");
assertIncludes(featureFlags, "premiumPurchaseEnabled: false", "default Premium purchase runtime flag");
assertNotIncludes(featureFlags, "premiumPurchaseEnabled: true", "default Premium purchase runtime flag");
assertIncludes(monetization, "Premium access must be granted by billing or an operator-backed entitlement.", "fake Premium rejection");
assertIncludes(monetization, "ownerPlatformAccessCanSatisfyGate = ownerPlatformAccess && !options.strictEntitlementRequired", "owner setup strict gate exclusion");
assertIncludes(monetization, "snapshot.targets.premium_subscription.hasEntitlement", "RevenueCat Premium entitlement path");
assertIncludes(monetization, "readCurrentUserEntitlements([\"premium\"])", "backend Premium entitlement path");
assertIncludes(premiumWatchPartyAccess, "strictEntitlementRequired: true", "strict Watch-Party Premium entitlement gate");
assertIncludes(premiumEntitlements, "USER_ENTITLEMENTS_TABLE = \"user_entitlements\"", "backend entitlement table helper");
assertIncludes(premiumEntitlements, "ACTIVE_ENTITLEMENT_STATUSES = new Set<PremiumEntitlementStatus>([\"active\", \"trialing\", \"grace_period\"])", "active-only Premium entitlement statuses");
assertIncludes(premiumEntitlements, "hasPassed(expiresAt) || status === \"expired\" || status === \"canceled\"", "expired entitlement denial");
assertIncludes(premiumEntitlements, ".eq(\"user_id\", userId)", "user-specific entitlement read");
assertIncludes(entitlementMigration, "alter table public.\"user_entitlements\" enable row level security", "user_entitlements RLS");
assertIncludes(entitlementMigration, "with check (public.has_platform_role(array['owner', 'operator']))", "operator-only entitlement writes");
assertIncludes(entitlementMigration, "for insert", "entitlement insert policy");
assertIncludes(entitlementMigration, "for update", "entitlement update policy");
assertIncludes(entitlementMigration, "for delete", "entitlement delete policy");

assertIncludes(creatorToolMigration, "has_active_premium_creator_tool_access", "creator-tool Premium backend guard");
assertIncludes(creatorToolMigration, "entitlement.\"entitlement_key\" = 'premium'", "creator-tool Premium entitlement key");
assertIncludes(creatorToolMigration, "entitlement.\"status\" in ('active', 'trialing', 'grace_period')", "creator-tool active entitlement statuses");
assertIncludes(mediaStorage, "Premium required. Creator video uploads require active Premium entitlement or owner/operator setup access.", "creator upload Premium denial copy");
assertIncludes(mediaStorage, ".eq(\"entitlement_key\", \"premium\")", "media-storage Premium entitlement check");
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
assertIncludes(accessSheet, "if (isPremiumGateSheet)", "Premium gate primary action routes to subscribe");
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
