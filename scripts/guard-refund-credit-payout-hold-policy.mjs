#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Refund / credit / payout-hold policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const packageJson = read("package.json");
const policy = read("_lib/moneyRefundPolicy.ts");
const migration = read("supabase/migrations/20260621091458_refund_credit_payout_hold_foundation.sql");
const docs = read("docs/REFUND_CREDIT_PAYOUT_HOLD_FOUNDATION.md");
const docsLower = docs.toLowerCase();

assertIncludes(packageJson, "guard:refund-credit-payout-hold-policy", "package guard script");

[
  "money_refund_policy_rules",
  "money_refund_review_records",
  "money_credit_ledger_entries",
  "creator_obligation_review_records",
  "creator_payout_hold_records",
  "resolve_money_refund_policy",
  "resolve_creator_payout_hold_policy",
  "create_refund_review_dry_run",
  "get_my_refund_credit_summary",
  "admin_get_refund_readiness_summary",
].forEach((needle) => assertIncludes(migration, needle, `migration foundation ${needle}`));

[
  "premium_subscription",
  "creator_tip",
  "paid_creator_video",
  "watch_party_ticket",
  "live_watch_party_access_pass",
  "live_watch_party_seat_pass",
  "channel_subscription",
  "vip_pass",
  "event_pass",
  "merch_physical_good",
  "payout_readiness",
].forEach((key) => {
  assertIncludes(policy, key, `policy key ${key}`);
  assertIncludes(migration, key, `migration policy key ${key}`);
  assertIncludes(docs, key, `docs policy key ${key}`);
});

assertIncludes(policy, "Generally non-refundable after purchase/renewal", "Premium generally non-refundable policy");
assertIncludes(policy, "Premium is app-wide platform access and is not creator income.", "Premium not creator income");
assertIncludes(policy, "No standard refunds.", "tips no standard refunds");
assertIncludes(policy, "Tips unlock nothing", "tips unlock nothing");
assertIncludes(policy, "Credit-first remedy", "channel subscription credit-first remedy");
assertIncludes(policy, "Refund eligible before room entry/use", "ticket refund before entry/use");
assertIncludes(policy, "buyer has not entered/attended before cutoff", "event refund before attendance");
assertIncludes(policy, "Seat pass grants eligibility only; host approval and LiveKit token rules still win.", "seat pass host approval rule");
assertIncludes(policy, "Refund/return to original payment method", "merch original payment/return policy");
assertIncludes(policy, "Stripe/merch provider is separate from Android digital goods.", "merch provider separation");
assertIncludes(policy, "No cash-out, withdrawal, payable balance, or real payout is active.", "payout readiness setup only");

assertIncludes(migration, '"cash_equivalent" = false and "transferable" = false and "withdrawable" = false and "payable" = false', "credits non-cash/non-transferable/non-withdrawable");
assertIncludes(migration, '"spendable" = false', "credits default not spendable");
assertIncludes(migration, '"live_money_enabled_at_approval" = true', "future credit spend switch requirement");
assertIncludes(migration, '"provider_refund_status" <> \'completed_with_evidence_later\'', "provider refund completion guard");
assertIncludes(migration, '"provider_refund_evidence_id"', "provider refund evidence field");
assertIncludes(migration, '"hold_state" <> \'released_later\'', "payout hold release guard");
assertIncludes(migration, '"payouts_enabled_at_release" = true', "payout release needs payouts enabled");
assertIncludes(migration, '"live_money_enabled_at_release" = true', "payout release needs live money enabled");
assertIncludes(migration, "provider_refund_created', false", "dry-run does not create provider refund");
assertIncludes(migration, "spendable_credit_created', false", "dry-run does not create spendable credit");
assertIncludes(migration, "payout_released', false", "dry-run does not release payout");
assertIncludes(migration, "metadata\"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|raw_payload|access_token|refresh_token", "metadata secret guard");
assertIncludes(migration, 'revoke all on table public."money_refund_policy_rules" from "anon"', "anon table revoke");
assertIncludes(migration, 'grant select, insert, update on table public."money_refund_review_records" to "authenticated"', "explicit authenticated grants with RLS");
assertIncludes(migration, "public.has_platform_role(array['owner'::text, 'operator'::text])", "owner/operator RLS boundary");

[
  "grant livekit publish",
  "grant host power",
  "grant speaker authority",
  "grant moderator/admin",
  "grant payout access",
  "provider calls",
  "real refunds",
  "spendable credits",
  "payout release",
  "live money remains off",
  "payouts remain off",
].forEach((needle) => assertIncludes(docsLower, needle, `docs safety copy ${needle}`));

assertNotIncludes(policy, "refundsEnabled: true", "refund activation flag");
assertNotIncludes(policy, "payoutsEnabled: true", "payout activation flag");
assertNotIncludes(policy, "liveMoneyEnabled: true", "live money activation flag");
assertNotIncludes(migration, "stripe.refunds.create", "Stripe refund API call");
assertNotIncludes(migration, "refunds.create", "provider refund API call");
assertNotIncludes(migration, "transfers.create", "provider transfer API call");
assertNotIncludes(migration, "payouts.create", "provider payout API call");
assertNotIncludes(migration, "SUPABASE_SERVICE_ROLE_KEY", "service role env secret");
assertNotIncludes(migration, "sk_live_", "Stripe live secret");
assertNotIncludes(migration, "sk_test_", "Stripe test secret");

if (process.exitCode) {
  process.exit();
}

console.log("Refund / credit / payout-hold policy guard passed.");
