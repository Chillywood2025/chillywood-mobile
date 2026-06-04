#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Money Center policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const channelSettings = read("app/channel-settings.tsx");
const monetizeRoute = read("app/monetize.tsx");
const revenueRoute = read("app/revenue.tsx");
const payoutsRoute = read("app/payouts.tsx");
const packageJson = read("package.json");
const providerReadiness = read("_lib/providerReadiness.ts");
const paymentRailPolicy = read("_lib/paymentRailPolicy.ts");
const moneyFeatureFlags = read("_lib/moneyFeatureFlags.ts");
const moneyAuditEvents = read("_lib/moneyAuditEvents.ts");
const admin = read("app/admin.tsx");
const moneyKillSwitchMigration = read("supabase/migrations/202605270001_platform_money_kill_switches.sql");
const operatorTabsBlock = admin.match(/const operatorTabs:[\s\S]*?\n\];/)?.[0] ?? "";

assertIncludes(packageJson, "guard:money-center-policy", "package guard script");

[
  "Money Center",
  "Digital Sales",
  "Tips",
  "Watch-Party Seats",
  "Paid Content",
  "Merch",
  "Creator Balance",
  "Payouts",
  "Tax & Legal",
  "Provider Status",
  "Future Tools",
  "Technical checks",
].forEach((section) => {
  assertIncludes(channelSettings, section, `Money Center section ${section}`);
});

assertIncludes(channelSettings, "Digital Sales", "digital sales readiness section");
assertIncludes(channelSettings, "Sandbox proved", "sandbox-proved digital sales copy");
assertIncludes(channelSettings, "Your balance will appear after verified sales.", "ledger-first balance copy");
assertIncludes(channelSettings, "No verified earnings yet", "no fake earnings copy");
assertIncludes(channelSettings, "Tips will unlock after store products and payout rules are verified.", "tips readiness copy");
assertIncludes(channelSettings, "No tip totals, tip balance, or tip checkout is available here.", "no fake tips copy");
assertIncludes(channelSettings, "Stripe is not used to charge Android users for in-app digital access.", "Android digital Stripe block");
assertIncludes(channelSettings, "Stripe Connect is for creator payouts only.", "Stripe Connect payout boundary");
assertIncludes(channelSettings, "Physical merch can use a separate approved checkout", "merch separation copy");
assertIncludes(channelSettings, "Digital app access stays separate from merch", "digital merch separation");
assertIncludes(channelSettings, "Provider checks are the source of readiness truth.", "provider readiness visible source");
assertIncludes(channelSettings, "readProviderReadinessSummary", "provider readiness integration");
assertIncludes(providerReadiness, "readProviderReadinessSummary", "provider readiness helper");
assertIncludes(providerReadiness, "isLiveMoneyEnabled: false", "provider readiness fallback live money false");
assertIncludes(paymentRailPolicy, "ANDROID_DIGITAL_CREATOR_CONTENT_STRIPE_ENABLED = false", "payment rail Stripe block");

assertIncludes(moneyFeatureFlags, "readMoneyFeatureFlagSummary", "Money feature flag client creator summary");
assertIncludes(moneyFeatureFlags, "setPlatformMoneyKillSwitchState", "Money kill switch admin writer");
assertIncludes(moneyFeatureFlags, "live_money_enabled: \"off\"", "live money default remains off");
assertIncludes(channelSettings, "readMoneyFeatureFlagSummary", "creator Money Center switch summary integration");
assertIncludes(channelSettings, "renderCreatorMoneyEventRows", "creator Money Center drilldown rows");
assertIncludes(channelSettings, "Money Event Detail", "creator Money event detail sheet");
assertIncludes(channelSettings, "Not payable", "creator non-payable labeling");
assertIncludes(channelSettings, "Sandbox only", "creator sandbox labeling");
assertIncludes(channelSettings, "Sandbox testing is complete for digital access. Live money is not active.", "creator launch summary copy");
assertIncludes(channelSettings, "Sandbox activity is inspection-only and not payable.", "creator sandbox-only not-payable copy");
assertIncludes(channelSettings, "Real provider refund/revoke and delayed-payment pending proof still need provider/device support.", "creator provider-tooling gap copy");
assertIncludes(channelSettings, "Tips, paid content, tickets, seats, and event passes have real Google Play / RevenueCat sandbox proof.", "creator sandbox proof product copy");
assertIncludes(channelSettings, "Setup and sandbox money rows cannot become payable earnings.", "creator setup/sandbox not-payable proof copy");
assertIncludes(channelSettings, "money_center_visible", "Money Center visibility switch");
assertIncludes(channelSettings, "digital_sales_enabled", "Digital sales switch");
assertIncludes(channelSettings, "payouts_enabled", "Payouts switch");
assertIncludes(channelSettings, "live_money_enabled", "Live money switch");
assertIncludes(channelSettings, "isMoneyFeatureSandboxOrOn", "sandbox-only setup gate");
assertIncludes(admin, "Owner/Admin Money Center", "Owner/Admin Money Center UI");
assertIncludes(admin, "Money Audit Explorer", "Owner/Admin Money Audit Explorer");
assertIncludes(admin, "renderAdminMoneyAuditExplorer", "Owner/Admin money audit explorer renderer");
assertIncludes(admin, "selectedAdminMoneyAuditEvent", "Owner/Admin money event detail state");
assertIncludes(admin, "Safe Technical Details", "Owner/Admin money detail safe technical section");
assertIncludes(admin, "Inspect only", "Owner/Admin money detail action safety copy");
assertIncludes(operatorTabsBlock, "{ key: \"money-center\", label: \"Money Center\" }", "Admin Money Center tab");
assertIncludes(admin, "ADMIN_MONEY_LEGACY_TAB_SECTIONS", "legacy Admin money tab mapping");
assertIncludes(admin, "useLocalSearchParams", "Admin Money Center deep-link query mapping");
assertIncludes(admin, "Premium / RevenueCat / Google Play", "Admin Premium provider consolidation");
assertIncludes(admin, "Sponsors / Ads", "Admin sponsor and ads consolidation");
assertIncludes(admin, "Fraud & Risk", "Admin fraud and risk consolidation");
assertIncludes(admin, "Provider Webhooks", "Admin provider webhook consolidation");
assertIncludes(admin, "revenuecat_google_play_enabled", "RevenueCat / Google Play high-risk switch");
assertIncludes(admin, "HIGH_RISK_MONEY_SWITCHES", "high-risk Money switch confirmation list");
assertIncludes(admin, "setPlatformMoneyKillSwitchState", "backend Money switch write");
assertIncludes(admin, "Backend RPC writes the switch and immutable audit", "Money switch confirmation audit copy");
assertIncludes(admin, "No provider secrets, checkout, transfer, withdrawal, payout, balance, or live-money movement is created.", "Money switch no-money-movement copy");
assertIncludes(admin, "Launch review state: sandbox digital access proof is complete, live money and payouts are off, sandbox/setup rows are not payable, and no cash-out or withdrawal action exists.", "Owner/Admin launch review summary");
assertIncludes(admin, "Product Catalog", "Owner/Admin Product Catalog launch metric");
assertIncludes(admin, "Provider Events", "Owner/Admin Provider Events launch metric");
assertIncludes(admin, "Purchase Intents", "Owner/Admin Purchase Intents launch metric");
assertIncludes(admin, "Access Grants", "Owner/Admin Access Grants launch metric");
assertIncludes(admin, "Ledger Events", "Owner/Admin Ledger Events launch metric");
assertIncludes(admin, "Payable sandbox/setup rows", "Owner/Admin payable rows launch metric");
assertIncludes(admin, "Duplicate webhook idempotency", "Owner/Admin idempotency proof row");
assertIncludes(admin, "Admin revoke", "Owner/Admin admin revoke proof row");
assertIncludes(admin, "Failed/expired intent", "Owner/Admin failed expired intent proof row");
assertIncludes(admin, "Event pass safety", "Owner/Admin event pass safety proof row");
assertIncludes(admin, "Stripe Android digital checkout", "Owner/Admin Stripe Android digital checkout absence row");
assertIncludes(moneyAuditEvents, "readAdminMoneyAuditSourceRows", "admin safe money source row reader");
assertIncludes(moneyAuditEvents, "readCreatorMoneyAuditSourceRows", "creator scoped money source row reader");
assertIncludes(moneyAuditEvents, "buildAdminMoneyAuditEvents", "admin normalized money event builder");
assertIncludes(moneyAuditEvents, "buildCreatorMoneyAuditEvents", "creator normalized money event builder");
assertIncludes(moneyAuditEvents, "\"Sandbox only\"", "sandbox-only money event labels");
assertIncludes(moneyAuditEvents, "\"Not payable\"", "non-payable money event labels");
assertIncludes(moneyAuditEvents, "provider_event_id", "safe provider event id support");
assertIncludes(moneyAuditEvents, "idempotency", "idempotency proof support");
assertIncludes(moneyAuditEvents, "SENSITIVE_FIELD_PARTS", "secret/raw payload redaction list");
[
  "{ key: \"premium\", label: \"Premium\" }",
  "{ key: \"kill-switches\", label: \"Kill Switches\" }",
  "{ key: \"ads\", label: \"Ads\" }",
  "{ key: \"revenue\", label: \"Revenue\" }",
  "{ key: \"payouts\", label: \"Payouts\" }",
  "{ key: \"sponsors\", label: \"Sponsors\" }",
  "{ key: \"fraud\", label: \"Fraud\" }",
].forEach((tab) => {
  assertNotIncludes(operatorTabsBlock, tab, "duplicate Admin money tab");
});
assertIncludes(moneyKillSwitchMigration, "create table if not exists public.\"platform_money_kill_switches\"", "Money switch table");
assertIncludes(moneyKillSwitchMigration, "create table if not exists public.\"platform_money_kill_switch_audit\"", "Money switch audit table");
assertIncludes(moneyKillSwitchMigration, "get_money_feature_flags_summary", "creator-safe switch RPC");
assertIncludes(moneyKillSwitchMigration, "get_platform_money_kill_switches", "owner switch RPC");
assertIncludes(moneyKillSwitchMigration, "set_platform_money_kill_switch_state", "owner switch write RPC");
assertIncludes(moneyKillSwitchMigration, "assert_money_feature_allowed", "backend money feature assertion");
assertIncludes(moneyKillSwitchMigration, "public.\"platform_admin_audit_logs\"", "Money switch admin audit integration");
assertIncludes(moneyKillSwitchMigration, "('live_money_enabled', 'off'", "live money seeded off");
[
  "money_center_visible",
  "digital_sales_enabled",
  "tips_enabled",
  "watch_party_seats_enabled",
  "paid_content_enabled",
  "merch_enabled",
  "creator_balance_visible",
  "payouts_enabled",
  "stripe_connect_enabled",
  "revenuecat_google_play_enabled",
  "provider_webhooks_enabled",
  "live_money_enabled",
].forEach((key) => {
  assertIncludes(moneyKillSwitchMigration, `'${key}'`, `Money kill switch key ${key}`);
});

assertIncludes(monetizeRoute, "focus=overview", "old monetize route maps to Money Center overview");
assertIncludes(revenueRoute, "focus=balance", "old revenue route maps to Money Center balance");
assertIncludes(payoutsRoute, "focus=payouts", "old payouts route maps to Money Center payouts");
assertIncludes(channelSettings, "normalized === \"monetize\" || normalized === \"payouts\" || normalized === \"revenue\"", "old tab params normalize to Monetization");
assertIncludes(channelSettings, "normalized === \"stripe\"", "old Stripe focus maps to payouts");
assertIncludes(channelSettings, "normalized === \"store\"", "old store focus maps to provider status");

assertNotIncludes(channelSettings, "{ id: \"monetize\", label: \"Monetize\" }", "duplicate Monetize tab");
assertNotIncludes(channelSettings, "{ id: \"revenue\", label: \"Revenue\" }", "duplicate Revenue tab");
assertNotIncludes(channelSettings, "{ id: \"payouts\", label: \"Payouts\" }", "duplicate Payouts tab");
assertNotIncludes(channelSettings, "foundation row found", "creator-facing confusing foundation row copy");
assertNotIncludes(channelSettings, "foundation event found", "creator-facing confusing foundation event copy");
assertNotIncludes(channelSettings, "foundation import row", "creator-facing confusing foundation import copy");
assertNotIncludes(channelSettings, "fake purchase", "fake purchase copy in Studio");
assertNotIncludes(channelSettings, "fake tip", "fake tip copy in Studio");
assertNotIncludes(channelSettings, "fake earnings", "fake earnings copy in Studio");
assertNotIncludes(channelSettings, "fake payout", "fake payout copy in Studio");
assertNotIncludes(channelSettings, "Mini Platform", "user-facing Mini Platform copy");
assertNotIncludes(channelSettings, "STRIPE_SECRET_KEY", "Stripe secret in Studio");
assertNotIncludes(channelSettings, "REVENUECAT_SECRET_API_KEY", "RevenueCat secret in Studio");
assertNotIncludes(channelSettings, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "Google service account in Studio");
assertNotIncludes(channelSettings, "whsec_", "webhook secret value in Studio");
assertNotIncludes(channelSettings, "sk_live_", "Stripe live secret in Studio");
assertNotIncludes(channelSettings, "sk_test_", "Stripe test secret in Studio");
assertNotIncludes(channelSettings, "checkout.session.create", "Stripe checkout creation in Studio");
assertNotIncludes(channelSettings, "PaymentIntent", "Stripe payment intent in Studio");
assertNotIncludes(channelSettings, "transferCreated: true", "transfer creation in Studio");
assertNotIncludes(channelSettings, "payoutCreated: true", "payout creation in Studio");

if (process.exitCode) {
  process.exit();
}

console.log("Money Center policy guard passed.");
