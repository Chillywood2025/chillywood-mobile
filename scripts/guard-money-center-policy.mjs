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
const moneyCenterSectionVisibility = read("_lib/moneyCenterSectionVisibility.ts");
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
[
  "money-feature-tips-cta",
  "money-feature-paid_video-cta",
  "money-feature-watch_party_ticket-cta",
  "money-feature-channel_subscription-cta",
  "money-feature-vip-cta",
  "money-feature-event_pass-cta",
].forEach((testID) => {
  assertIncludes(channelSettings, testID, `Money Center actual tappable feature CTA ${testID}`);
});
assertIncludes(channelSettings, "focusMoneyCenterSection", "Money Center route/deep-link focus handler");
assertIncludes(channelSettings, "isMoneyCenterSectionBodyVisible(expanded)", "Money Center expanded-section visibility contract");
assertIncludes(moneyCenterSectionVisibility, "=> expanded", "Money Center selected sections remain visible when expanded");
assertNotIncludes(channelSettings, "expanded && id !== activeMoneyCenterFocusSection", "Money Center focus state must not suppress the selected section body");
assertNotIncludes(channelSettings, "activeMoneyCenterFocusSection", "Money Center must not retain the obsolete split focus/display state");
assertIncludes(channelSettings, "{renderMoneyCenterOverviewContent()}", "Money Center renders one canonical overview surface");
assertNotIncludes(channelSettings, "{renderMoneyCenterFocusTabs()}", "Money Center must not render duplicate focus tabs");
assertNotIncludes(channelSettings, "{renderActiveMoneyCenterFocusContent()}", "Money Center must not render duplicate focused content above accordions");
assertNotIncludes(channelSettings, "money-center-focus-tabs", "Money Center duplicate focus-tab surface removed");
assertNotIncludes(channelSettings, "money-center-ways-to-earn-focused-panel", "Money Center duplicate focused Ways to Earn panel removed");
assertIncludes(channelSettings, 'renderWaysToEarnContent("money-center-ways-to-earn-panel")', "Money Center has one canonical Ways to Earn panel");
assertNotIncludes(channelSettings, 'id: "overview",\n            title: "Overview"', "Money Center duplicate Overview accordion removed");
assertNotIncludes(channelSettings, "money-center-creator-setup-button", "Creator setup CTA belongs only in advanced Sandbox QA");
assertIncludes(channelSettings, "money-sandbox-setup-button", "Advanced Sandbox QA retains creator setup action");
assertIncludes(channelSettings, "money-payout-review-readiness-button", "Cashout readiness keeps one canonical action");
assertIncludes(channelSettings, "activeMoneyManageTarget === feature.key ?", "Money Center manager renders inline after selected feature card");
assertIncludes(channelSettings, "moneyFeatureManagerInline", "Money Center inline manager occupies full feature grid width");
assertIncludes(channelSettings, "money-manager-close-button", "Money Center manager close action");
assertIncludes(channelSettings, "money-manager-tips", "Tips manager panel test id");
assertIncludes(channelSettings, "money-manager-paid_video", "Paid Video manager panel test id");
assertIncludes(channelSettings, "money-manager-watch_party_ticket", "Watch-Party Seat Pass manager panel test id");
assertIncludes(channelSettings, "money-manager-channel_subscription", "Channel Subscription manager panel test id");
assertIncludes(channelSettings, "money-manager-vip", "VIP manager panel test id");
assertIncludes(channelSettings, "money-manager-event_pass", "Event Pass manager panel test id");
assertIncludes(channelSettings, "money-manager-cashout-readiness", "Cashout readiness focused panel test id");
assertIncludes(channelSettings, "money-manager-tips-review-cashout-button", "Tips manager cashout readiness action");
assertIncludes(channelSettings, "money-manager-paid-videos-open-content-button", "Paid Videos manager content action");
assertIncludes(channelSettings, "money-manager-watch-party-create-target-button", "Watch-Party Seat Pass manager target action");
assertIncludes(channelSettings, "money-manager-channel-subscription-enable-button", "Channel Subscription manager action");
assertIncludes(channelSettings, "money-manager-vip-pass-enable-button", "VIP Pass manager action");
assertIncludes(channelSettings, "money-manager-paid-events-open-live-button", "Event Pass manager event action");
assertIncludes(channelSettings, "formatWatchPartySeatPassDisplayTitle", "Watch-Party Seat Pass stale title normalizer");
assertIncludes(channelSettings, "title: formatWatchPartySeatPassDisplayTitle(existingWatchPartyOffer.title)", "Watch-Party setup save normalized title");
assertIncludes(channelSettings, "formatWatchPartySeatPassDisplayTitle(transaction.roomTitle)", "Watch-Party transaction room title normalization");
assertIncludes(channelSettings, "formatWatchPartySeatPassDisplayTitle(config.displayName)", "saved Watch-Party setup config title normalization");
assertIncludes(channelSettings, "accessibilityLabel={`Save setup config for ${displayTitle}`}", "Watch-Party setup accessibility title normalization");
const watchPartyOfferTitleNormalizationCount = (channelSettings.match(/formatWatchPartySeatPassDisplayTitle\(offer\.title\)/g) ?? []).length;
if (watchPartyOfferTitleNormalizationCount < 2) {
  fail("Watch-Party offer titles must be normalized in both manager and Offers readback rows");
}
assertIncludes(channelSettings, "id: \"testing_proof\"", "Money Center collapsed testing/proof section");
assertIncludes(channelSettings, "title: \"Sandbox QA\"", "Money Center advanced testing label");
assertIncludes(monetizationRouteTargets, "manage: \"tips\"", "Tips route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"paid_videos\"", "Paid Videos route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"paid_watch_parties\"", "Paid Watch-Parties route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"channel_subscriptions\"", "Channel Subscriptions route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"vip_passes\"", "VIP Passes route target manage key");
assertIncludes(monetizationRouteTargets, "manage: \"paid_events\"", "Paid Events route target manage key");
assertNotIncludes(channelSettings, "feature.manageTarget === \"tips\" || feature.manageTarget === \"ways_to_earn\"", "feature card manage CTA must not only expand accordions");
const staleSeatPassCopy = [
  [["Watch-Party", "Ticket"].join(" "), "visible Watch-Party Seat Pass copy"],
  [["Watch", "Party", "Ticket"].join(" "), "visible Watch-Party Seat Pass copy"],
  [["watch-party", "ticket"].join(" "), "visible Watch-Party Seat Pass copy"],
  [["ticket", "sold"].join(" "), "visible Seat Pass sold copy"],
  [["ticket", "ready"].join(" "), "visible Seat Pass ready copy"],
  [["ticket", "manager"].join(" "), "visible Seat Pass manager copy"],
];
[
  ["_lib/sevenFlowSwitchboard.ts", read("_lib/sevenFlowSwitchboard.ts")],
  ["_lib/creatorMonetizationFeatures.ts", monetizationFeatureCatalog],
  ["app/channel-settings.tsx", channelSettings],
].forEach(([fileLabel, source]) => {
  staleSeatPassCopy.forEach(([needle, label]) => {
    assertNotIncludes(source, needle, `${label} in ${fileLabel}`);
  });
});
if (channelSettings.indexOf("title: \"Ways to Earn\"") > channelSettings.indexOf("Sandbox Tester Experience")) {
  fail("Ways to Earn must appear before Sandbox Tester Experience in creator-facing Money Center source order");
}
assertIncludes(channelSettings, "Premium is separate from creator purchases.", "Premium separation warning");
assertIncludes(channelSettings, "Fans do not buy Chi'llywood Premium", "creator purchase separation copy");
assertIncludes(channelSettings, "getCachedMonetizationSnapshot", "Channel Studio premium gate must read monetization snapshot used by Premium screen");
assertIncludes(channelSettings, "subscribeToMonetizationSnapshot", "Channel Studio premium gate must observe Premium screen sandbox purchase updates");
assertIncludes(channelSettings, "readMonetizationSnapshot({ forceRefresh: true, userId: String(user.id) })", "Channel Studio premium gate must refresh RevenueCat/Google Play snapshot for current user");
assertIncludes(channelSettings, "premiumEntitlement?.isActive === true || premiumSnapshotActive || hasOwnerOperatorStudioAccess", "Channel Studio premium gate must not rely only on backend entitlement rows after sandbox Subscribe");
assertIncludes(channelSettings, "authLoading || betaLoading || (canUseChannelSettings && loading)", "Channel Studio premium gate must wait for role/Premium readback");
assertIncludes(channelSettings, "money-center-open-ways-to-earn-button", "Money Center open Ways to Earn action");
assertIncludes(channelSettings, "onPress={openWaysToEarn}", "Money Center open Ways to Earn human-tap action");
assertIncludes(channelSettings, "money-center-monetization-section-stack", "Money Center monetization section stack anchor");
assertIncludes(channelSettings, "money-section-${id}", "Money Center section focus anchors");
assertNotIncludes(channelSettings, "monetizationStackOffsetRef.current + sectionOffset", "Money Center must not depend on absolute section offsets");
assertNotIncludes(channelSettings, "startingScrollY + 920", "Money Center must not depend on forward scroll guesses");
assertNotIncludes(channelSettings, "id === \"ways_to_earn\" ? 3600 : 2600", "Money Center must not depend on hardcoded Ways to Earn offsets");
assertNotIncludes(channelSettings, "studioScrollRef.current?.scrollTo", "Money Center focus must not require imperative scrollTo");
assertNotIncludes(channelSettings, "focusActiveMoneyManagerPanel", "Money Center manager focus must not use timed scroll retries");
assertNotIncludes(channelSettings, "money-center-creator-setup-button", "Money Center duplicate creator setup action removed");
assertNotIncludes(channelSettings, "money-center-cashout-readiness-button", "Money Center duplicate cashout action removed");
assertIncludes(channelSettings, "money-sandbox-setup-button", "Sandbox QA owns creator setup action");
assertIncludes(channelSettings, "money-payout-review-readiness-button", "Payout readiness owns cashout review action");
assertIncludes(channelSettings, "Available balance", "overview available balance");
assertIncludes(channelSettings, "Transactions", "canonical overview transactions summary");
assertIncludes(channelSettings, "Payout readiness", "canonical overview payout-readiness summary");
assertIncludes(channelSettings, "Sandbox/test mode. No real charges, payouts, cashout, or withdrawals.", "single Money Center sandbox safety summary");
assertIncludes(channelSettings, "Cashout not live yet.", "cashout readiness not-live copy");
assertIncludes(channelSettings, "No real payout will be sent", "cashout readiness no payout copy");
assertIncludes(channelSettings, "Payouts and cashout remain OFF for production money movement.", "payout/cashout production-off copy");
assertIncludes(channelSettings, "Payments are unavailable right now.", "payments unavailable warning");
assertIncludes(channelSettings, "Offer type: paid_video", "paid video offer row");
assertIncludes(channelSettings, "Offer type: paid_watch_party", "paid watch-party offer row");
assertIncludes(channelSettings, "Offer type: channel_subscription", "channel subscription offer row");
assertIncludes(channelSettings, "Offer type: vip_pass", "VIP offer row");
assertIncludes(channelSettings, "Offer type: paid_event", "paid event offer row");
assertIncludes(channelSettings, "Offer type: merch", "merch offer row");
assertIncludes(channelSettings, "moneyTransactionFilter", "single filtered transactions list");
assertIncludes(creatorMonetizationSetupRoute, "focus=offers", "creator setup compatibility redirect");
assertIncludes(monetizeRoute, "focus=offers", "monetize compatibility redirect");
assertIncludes(channelSettings, "Sandbox ready", "sandbox-ready digital sales copy");
assertIncludes(channelSettings, "listMyCreatorSandboxMonetizationConfigs", "creator sandbox config readback wiring");
assertIncludes(channelSettings, "saveCreatorSetupConfig", "shared creator setup save wrapper");
assertIncludes(channelSettings, "money-saved-sandbox-config-readback", "saved sandbox config visible readback");
assertIncludes(channelSettings, "money-manager-watch-party-save-config-button", "Watch-Party setup save config action");
assertIncludes(channelSettings, "watchPartySetupSavingId", "Watch-Party setup save busy state");
assertIncludes(channelSettings, "canStartStripeSetup = isMoneyFeatureSandboxOrOn(stripeConnectFlag.state)", "safe payout setup readiness visibility");
assertIncludes(channelSettings, "No verified tips yet.", "no fake earnings copy");
assertIncludes(channelSettings, 'const storeProviderName = Platform.OS === "ios" ? "App Store" : "Google Play"', "platform-aware store provider naming");
assertIncludes(channelSettings, "It does not charge users for digital goods.", "digital Stripe block");
assertIncludes(channelSettings, "Stripe Connect is payout setup only.", "Stripe Connect payout boundary");
assertIncludes(channelSettings, "Physical goods stay separate from digital access.", "merch separation copy");
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
assertIncludes(moneyFeatureFlags, "digital_sales_enabled: \"sandbox_only\"", "digital sales setup default");
assertIncludes(moneyFeatureFlags, "tips_enabled: \"sandbox_only\"", "tips setup default");
assertIncludes(moneyFeatureFlags, "watch_party_tickets_enabled: \"sandbox_only\"", "Watch-Party setup default");
assertIncludes(moneyFeatureFlags, "paid_content_enabled: \"sandbox_only\"", "paid content setup default");
assertIncludes(moneyFeatureFlags, "payouts_enabled: \"off\"", "payouts production default off");
assertIncludes(channelSettings, "previewCreatorPayoutPreproductionWorkflow", "cashout readiness dry-run preview");
assertNotIncludes(channelSettings, "onPress={handleStartPayoutProviderSetup}\n                    hitSlop={LAUNCH_CRITICAL_HIT_SLOP}\n                    accessibilityRole=\"button\"\n                    accessibilityLabel=\"Connect payouts\"", "creator-facing Tips manager must not expose provider mutation as connect payouts");
assertIncludes(admin, "Owner/Admin Money Center", "Owner/Admin Money Center UI");
assertIncludes(admin, "Money Audit Explorer", "Owner/Admin Money Audit Explorer");
assertIncludes(admin, "renderAdminMoneyAuditExplorer", "Owner/Admin money audit explorer renderer");
assertIncludes(admin, "selectedAdminMoneyAuditEvent", "Owner/Admin money event detail state");
assertIncludes(admin, "Safe Technical Details", "Owner/Admin money detail safe technical section");
assertIncludes(admin, "Inspect only", "Owner/Admin money detail action safety copy");
assertIncludes(operatorTabsBlock, "{ key: \"money-center\", label: \"Money Center\" }", "Admin Money Center tab");
assertIncludes(admin, "ADMIN_MONEY_LEGACY_TAB_SECTIONS", "legacy Admin money tab mapping");
assertIncludes(admin, "useLocalSearchParams", "Admin Money Center deep-link query mapping");
assertIncludes(admin, 'title: `Premium / RevenueCat / ${storeProviderName}`', "Admin Premium provider consolidation");
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
assertIncludes(admin, "Launch review state: sandbox digital access evidence is complete, live money and payouts are off, sandbox/setup rows are not payable, and no cash-out or withdrawal action exists.", "Owner/Admin launch review summary");
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
assertIncludes(admin, '{ label: "Stripe digital checkout", value: "Absent" }', "Owner/Admin Stripe digital checkout absence row");
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

assertIncludes(monetizeRoute, "focus=offers", "old monetize route maps to Money Center Offers setup");
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
