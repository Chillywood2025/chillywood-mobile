#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Provider readiness policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const migration = read("supabase/migrations/202605250002_provider_link_readiness_scaffold.sql");
const appHelper = read("_lib/providerReadiness.ts");
const edgeShared = read("supabase/functions/_shared/provider-readiness.ts");
const edgeReadiness = read("supabase/functions/provider-readiness/index.ts");
const revenueCatWebhook = read("supabase/functions/revenuecat-webhook/index.ts");
const googlePlayWebhook = read("supabase/functions/google-play-webhook/index.ts");
const channelSettings = read("app/channel-settings.tsx");
const packageJson = read("package.json");
const config = read("supabase/config.toml");
const sandboxProofMigration = read("supabase/migrations/202605250004_provider_link_sandbox_proof_status.sql");

assertIncludes(packageJson, "guard:provider-readiness-policy", "package guard script");

assertIncludes(migration, 'create table if not exists public."provider_readiness_status"', "readiness status table");
assertIncludes(migration, 'create table if not exists public."provider_readiness_audit_log"', "readiness audit table");
assertIncludes(migration, '"is_live_money_enabled" boolean not null default false', "live money default false");
assertIncludes(migration, '"is_live_money_enabled" = false or "status" = \'active\'', "live money requires active status");
assertIncludes(migration, 'provider_readiness_status_active_requires_proof_check', "active requires proof check");
assertIncludes(migration, 'alter table public."provider_readiness_status" enable row level security', "readiness RLS");
assertIncludes(migration, 'alter table public."provider_readiness_audit_log" enable row level security', "audit RLS");
assertIncludes(migration, 'revoke all on table public."provider_readiness_status" from anon, authenticated', "direct readiness revoke");
assertIncludes(migration, 'revoke all on function public."get_provider_readiness_summary"() from public', "RPC public revoke");
assertIncludes(migration, 'grant execute on function public."get_provider_readiness_summary"() to authenticated', "authenticated safe RPC");
assertIncludes(migration, 'provider_readiness_summary_requested', "readiness summary audit");
assertIncludes(migration, "'tips_enabled', false", "tips seed disabled");
assertIncludes(migration, "'payout_created', false", "payout seed disabled");
assertIncludes(migration, "'transfer_created', false", "transfer seed disabled");
assertIncludes(migration, "'balance_created', false", "balance seed disabled");
assertIncludes(migration, "'premium_granted', false", "premium grant seed disabled");
assertNotIncludes(migration, "is_live_money_enabled\", true", "live money true seed");

assertIncludes(appHelper, "readProviderReadinessSummary", "app safe readiness reader");
assertIncludes(appHelper, "getProviderReadinessFallbackSummary", "fail-closed app fallback");
assertIncludes(appHelper, "isLiveMoneyEnabled: false", "fallback live money false");
assertIncludes(appHelper, "findProviderReadinessSummary", "readiness lookup helper");
assertNotIncludes(appHelper, "STRIPE_SECRET_KEY", "app helper Stripe secret");
assertNotIncludes(appHelper, "REVENUECAT_SECRET_API_KEY", "app helper RevenueCat secret");
assertNotIncludes(appHelper, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "app helper Google secret");

assertIncludes(edgeShared, "ProviderReadinessAdapter", "provider adapter interface");
assertIncludes(edgeShared, "RevenueCatAdapter", "RevenueCat adapter");
assertIncludes(edgeShared, "GooglePlayAdapter", "Google Play adapter");
assertIncludes(edgeShared, "StripeAdapter", "Stripe adapter");
assertIncludes(edgeShared, "StripeConnectAdapter", "Stripe Connect adapter");
assertIncludes(edgeShared, "liveMoneyAction: false", "edge adapter no live money");
assertIncludes(edgeShared, "secret_values_logged: false", "audit secret redaction marker");

assertIncludes(edgeReadiness, "authenticateBearerUser", "readiness auth");
assertIncludes(edgeReadiness, "readProviderReadinessRows", "readiness sanitized rows");
assertIncludes(edgeReadiness, "liveMoneyAction: false", "readiness no live money");

assertIncludes(revenueCatWebhook, "REVENUECAT_WEBHOOK_SECRET", "RevenueCat webhook secret env");
assertIncludes(revenueCatWebhook, "premiumGranted: false", "RevenueCat no fake premium");
assertIncludes(revenueCatWebhook, "verifySharedWebhookSecret", "RevenueCat signature requirement");
assertIncludes(revenueCatWebhook, "revenuecat_webhook_setup_required", "RevenueCat missing-secret audit");
assertIncludes(googlePlayWebhook, "GOOGLE_PLAY_WEBHOOK_SECRET", "Google Play webhook secret env");
assertIncludes(googlePlayWebhook, "subscriptionGranted: false", "Google Play no fake subscription");
assertIncludes(googlePlayWebhook, "verifySharedWebhookSecret", "Google Play signature requirement");
assertIncludes(googlePlayWebhook, "google_play_webhook_setup_required", "Google Play missing-secret audit");

assertIncludes(sandboxProofMigration, "'sandbox_ready'", "Stripe sandbox proof status");
assertIncludes(sandboxProofMigration, "'stripe_webhook_sandbox_ready_proved'", "Stripe sandbox proof audit");
assertIncludes(sandboxProofMigration, "'revenuecat_webhook_setup_required_proved'", "RevenueCat setup-required proof audit");
assertIncludes(sandboxProofMigration, "'google_play_webhook_setup_required_proved'", "Google Play setup-required proof audit");
assertIncludes(sandboxProofMigration, '"is_live_money_enabled" = false', "sandbox proof live money remains false");
assertIncludes(sandboxProofMigration, "'CHILLYWOOD_LIVE_MONEY_ENABLED', 'missing'", "live money flag missing proof");
assertNotIncludes(sandboxProofMigration, "'status' = 'active'", "sandbox proof must not force active");
assertNotIncludes(sandboxProofMigration, '"is_live_money_enabled" = true', "sandbox proof must not enable live money");

assertIncludes(config, "[functions.provider-readiness]", "provider readiness function config");
assertIncludes(config, "[functions.revenuecat-webhook]", "RevenueCat webhook function config");
assertIncludes(config, "[functions.google-play-webhook]", "Google Play webhook function config");

assertIncludes(channelSettings, "readProviderReadinessSummary", "Studio readiness integration");
assertIncludes(channelSettings, "Google Play / RevenueCat Status", "Studio store status section");
assertIncludes(channelSettings, "No withdrawal, transfer, cash-out, or payout release action is available.", "Studio payout lock copy");
assertNotIncludes(channelSettings, "{ id: \"payouts\", label: \"Payouts\" }", "separate payout tab");
assertNotIncludes(channelSettings, "{ id: \"revenue\", label: \"Revenue\" }", "separate revenue tab");
assertNotIncludes(channelSettings, "STRIPE_SECRET_KEY", "Studio Stripe secret");
assertNotIncludes(channelSettings, "REVENUECAT_SECRET_API_KEY", "Studio RevenueCat secret");
assertNotIncludes(channelSettings, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "Studio Google secret");

if (process.exitCode) {
  process.exit();
}

console.log("Provider readiness policy guard passed.");
