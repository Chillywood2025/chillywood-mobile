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
const monetizationFeatureCatalog = read("_lib/creatorMonetizationFeatures.ts");
const monetizationRouteTargets = read("_lib/creatorMonetizationRouteTargets.ts");
const moneyScopeInfoButton = read("components/monetization/MoneyScopeInfoButton.tsx");
const creatorMonetizationSetupRoute = read("app/creator-monetization-setup.tsx");
const admin = read("app/admin.tsx");
const moneyKillSwitchMigration = read("supabase/migrations/202605270001_platform_money_kill_switches.sql");
const operatorTabsBlock = admin.match(/const operatorTabs:[\s\S]*?\n\];/)?.[0] ?? "";

assertIncludes(packageJson, "guard:money-center-policy", "package guard script");

[
  "Money Center",
  "Overview",
  "Ways to Earn",
  "Offers",
  "Transactions",
  "Payouts",
  "Tax & Legal",
  "Provider Status",
].forEach((section) => {
  assertIncludes(channelSettings, section, `Money Center section ${section}`);
});

[
  "Accept tips from fans.",
  "Charge fans to unlock selected videos.",
  "Sell Seat Pass access to hosted Watch-Party rooms.",
  "Offer monthly creator membership.",
  "Sell creator-specific VIP status and access.",
  "Sell Event Passes to live events and premieres.",
].forEach((label) => {
  assertIncludes(monetizationFeatureCatalog, label, `shared monetization feature catalog ${label}`);
});
assertIncludes(monetizationFeatureCatalog, "type MonetizationFeatureKey", "shared feature key type");
assertIncludes(moneyScopeInfoButton, "width: 30", "compact MoneyScopeInfoButton visible width");
assertIncludes(moneyScopeInfoButton, "height: 30", "compact MoneyScopeInfoButton visible height");
assertIncludes(moneyScopeInfoButton, "hitSlop", "MoneyScopeInfoButton accessible hitSlop");
assertIncludes(channelSettings, "CREATOR_MONETIZATION_FEATURE_CATALOG", "Money Center uses shared feature catalog");
assertIncludes(channelSettings, "handleManageMoneyFeature", "Money Center feature cards use real manage handler");
assertIncludes(channelSettings, "renderActiveMoneyManagerPanel", "Money Center renders dedicated active manager panel");
assertIncludes(channelSettings, "activeMoneyManageTarget", "Money Center focused manage target state");
assertIncludes(channelSettings, "moneyManageNotice", "Money Center visible manage notice");
assertIncludes(channelSettings, "testID={`money-feature-${feature.key}-cta`}", "Money Center feature CTA test ids");
assertIncludes(channelSettings, "testID={`money-manager-${activeMoneyManageTarget}`}", "Money Center manager panel test id");
assertIncludes(channelSettings, "money-manager-tips-connect-payouts-button", "Tips manager connect payouts action");
assertIncludes(channelSettings, "money-manager-paid-videos-open-content-button", "Paid Videos manager content action");
assertIncludes(channelSettings, "money-manager-watch-party-create-target-button", "Watch-Party Seat Pass manager target action");
assertIncludes(channelSettings, "money-manager-channel-subscription-enable-button", "Channel Subscription manager action");
assertIncludes(channelSettings, "money-manager-vip-pass-enable-button", "VIP Pass manager action");
assertIncludes(channelSettings, "money-manager-paid-events-open-live-button", "Event Pass manager event action");
assertIncludes(channelSettings, "id: \"testing_proof\"", "Money Center collapsed testing/proof section");
assertIncludes(channelSettings, "title: \"Testing & Proof\"", "Money Center advanced testing label");
assertIncludes(monetizationRouteTargets, "manage: \"tips\"", "Tips route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"paid_videos\"", "Paid Videos route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"paid_watch_parties\"", "Paid Watch-Parties route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"channel_subscriptions\"", "Channel Subscriptions route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"vip_passes\"", "VIP Passes route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"paid_events\"", "Paid Events route target manage key");
assertNotIncludes(channelSettings, "feature.manageTarget === \"tips\" || feature.manageTarget === \"ways_to_earn\"", "feature card manage CTA must not only expand accordions");
if (channelSettings.indexOf("title: \"Ways to Earn\"") > channelSettings.indexOf("Sandbox Tester Experience")) {
  fail("Ways to Earn must appear before Sandbox Tester Experience in creator-facing Money Center source order");
}
assertIncludes(channelSettings, "Premium is separate from creator purchases.", "Premium separation warning");
assertIncludes(channelSettings, "Fans do not buy Chi'llywood Premium", "creator purchase separation copy");
assertIncludes(channelSettings, "Available balance", "overview available balance");
assertIncludes(channelSettings, "Pending balance", "overview pending balance");
assertIncludes(channelSettings, "This month", "overview monthly earnings");
assertIncludes(channelSettings, "Lifetime earnings", "overview lifetime earnings");
assertIncludes(channelSettings, "Pending payout", "overview pending payout");
assertIncludes(channelSettings, "Set up payouts before you can receive creator earnings.", "payout setup warning");
assertIncludes(channelSettings, "Payments are unavailable right now.", "payments unavailable warning");
assertIncludes(channelSettings, "Creator earnings are temporarily disabled.", "earnings disabled warning");
assertIncludes(channelSettings, "Offer type: paid_video", "paid video offer row");
assertIncludes(channelSettings, "Offer type: paid_watch_party", "paid watch-party offer row");
assertIncludes(channelSettings, "Offer type: channel_subscription", "channel subscription offer row");
assertIncludes(channelSettings, "Offer type: vip_pass", "VIP offer row");
assertIncludes(channelSettings, "Offer type: paid_event", "paid event offer row");
assertIncludes(channelSettings, "Offer type: merch", "merch offer row");
assertIncludes(channelSettings, "moneyTransactionFilter", "single filtered transactions list");
assertIncludes(creatorMonetizationSetupRoute, "focus=offers", "creator setup compatibility redirect");
assertIncludes(channelSettings, "Sandbox ready", "sandbox-ready digital sales copy");
assertIncludes(channelSettings, "No verified tips yet.", "no fake earnings copy");
assertIncludes(channelSettings, "It is not used to charge Android users for digital access.", "Android digital Stripe block");
assertIncludes(channelSettings, "Stripe Connect is for creator payouts only.", "Stripe Connect payout boundary");
assertIncludes(channelSettings, "Physical goods stay separate from Android digital access.", "merch separation copy");
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
assertIncludes(channelSettings, "Live money stays disabled until provider checks, policy checks, and owner approval pass.", "creator launch summary copy");
assertIncludes(channelSettings, "No withdrawal, transfer, cash-out, or payout release action is available.", "creator sandbox-only not-payable copy");
assertIncludes(channelSettings, "Provider readiness is the visible source of truth for creator money tools.", "creator provider-tooling source copy");
assertIncludes(channelSettings, "Sandbox tester offers are ready. Test mode only. No real charges, creator earnings, payouts, withdrawals, or cash-out.", "creator sandbox proof product copy");
assertIncludes(channelSettings, "Sandbox setup is partially ready", "creator setup/sandbox not-payable proof copy");
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
assertIncludes(admin, "Internal Sandbox Testing", "Admin internal sandbox testing controls");
assertIncludes(admin, "Open Sandbox Tester Tools", "Admin sandbox tester tools link");
assertIncludes(admin, "Payout readiness", "Admin sandbox payout readiness boundary");
assertIncludes(admin, "Payout execution remains blocked", "Admin sandbox payout execution blocked");
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
