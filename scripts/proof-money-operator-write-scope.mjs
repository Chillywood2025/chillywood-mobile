#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const fail = (message) => failures.push(message);
const includes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
};
const matches = (source, pattern, label) => {
  if (!pattern.test(source)) fail(`${label} must match ${pattern}`);
};
const notMatches = (source, pattern, label) => {
  if (pattern.test(source)) fail(label);
};

const migrationName = readdirSync(path.join(root, "supabase/migrations"))
  .filter((file) => file.endsWith("_money_operator_scoped_writes.sql"))
  .sort()
  .at(-1);
if (!migrationName) fail("money operator scoped write migration missing");

const migration = migrationName ? read(`supabase/migrations/${migrationName}`) : "";
const helper = read("_lib/moneyFlowControl.ts");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const functionSource = read("supabase/functions/money-operator/index.ts");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const docs = [
  read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md"),
  read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md"),
  read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md"),
  read("docs/owner-admin-rachi-implementation-spec.md"),
].join("\n\n");

const operatorTables = [
  "money_operator_events",
  "money_reconciliation_runs",
  "money_reconciliation_findings",
  "money_provider_sync_status",
  "money_duplicate_event_detections",
  "money_required_review_flags",
  "money_flow_health_snapshots",
  "money_operator_learning_state",
];

for (const table of operatorTables) {
  includes(migration, `public.${table}`, "money operator migration");
  includes(migration, `alter table public.${table} enable row level security`, `${table} RLS`);
  includes(migration, `revoke all on public.${table} from anon, authenticated`, `${table} client write denial`);
  includes(helper, `"${table}"`, "money helper allowed write table");
  includes(registry, `"${table}"`, "money registry allowed write table");
}

for (const action of [
  "health_snapshot",
  "reconciliation_plan",
  "run_readonly_reconciliation",
  "sync_provider_status_safe",
  "record_duplicate_event",
  "mark_requires_review",
  "create_approval_request",
  "mark_sandbox_proof_result",
  "learning_report",
  "execute_approved_money_action_dry_run",
  "execute_approved_money_action",
  "provider_webhook_health",
  "provider_webhook_test_plan",
  "record_provider_webhook_delivery_status",
  "provider_dashboard_repair_request",
  "provider_webhook_reliability_report",
]) {
  includes(functionSource, `action === "${action}"`, "money operator action");
}

for (const helperExport of [
  "classifyMoneyWriteScope",
  "canMoneyOperatorWrite",
  "validateMoneyOperatorAction",
  "buildMoneyApprovalRequest",
  "assertExternalConfirmationForLevel4",
  "sanitizeMoneyOperatorMetadata",
]) {
  includes(helper, helperExport, "money operator helper export");
}

for (const safeAction of [
  "record reconciliation findings",
  "mark provider sync stale/synced/failed",
  "mark duplicate provider/webhook event",
  "mark ledger/payout/revenue item requires_review",
  "create approval request",
  "record blocked action",
  "record external confirmation requirement",
  "write sandbox/test-mode proof result",
  "update learning state",
]) {
  includes(helper, safeAction, "safe money operator action");
}

for (const blocked of [
  "manual Premium grant",
  "fake revenue",
  "fake payable balance",
  "mark payout paid",
  "release payout",
  "charge customer",
  "enable cashout",
]) {
  includes(helper, blocked, "forbidden money operator scope");
}

for (const testId of [
  "money-operator-status",
  "money-operator-latest-reconciliation-runs",
  "money-operator-required-review-flags",
  "money-operator-duplicate-detections",
  "money-operator-provider-sync-health",
  "money-operator-blocked-actions",
  "money-operator-external-confirmation-required",
]) {
  includes(admin, testId, "Admin Money Operator visibility");
}

includes(packageJson, '"proof:money-operator-write-scope"', "package script");
includes(packageJson, '"proof:money-external-confirmation"', "package script");
includes(functionSource, "x-money-operator-token", "money operator token header");
includes(functionSource, "MONEY_OPERATOR_TOKEN_SHA256", "money operator token hash secret");
includes(functionSource, "constantTimeEqual", "money operator constant-time auth");
includes(functionSource, "moneyMoved: false", "money operator no money movement responses");
includes(functionSource, "blocked_pending_owner_scope_and_external_confirmation", "real money action block");
includes(migration, "money_moved boolean not null default false check (money_moved = false)", "money moved false constraint");
includes(registry, "scoped_write_capable_guarded", "registry scoped write status");
includes(docs, "scoped write", "docs scoped write authority");

matches(helper, /MONEY_OPERATOR_ALLOWED_WRITE_TABLES[\s\S]*money_operator_events[\s\S]*money_operator_learning_state[\s\S]*autonomous_approval_requests/, "allowed operator write tables");
matches(helper, /MONEY_OPERATOR_FORBIDDEN_WRITE_SCOPES[\s\S]*mark payout paid[\s\S]*manual Premium grant[\s\S]*fake payable balance/, "forbidden operator write scopes");
matches(functionSource, /LEVEL_4_ACTIONS[\s\S]*real_payout[\s\S]*real_transfer[\s\S]*real_cashout/, "Level 4 actions remain classified");

notMatches(functionSource, /\bstripe\.(payouts|transfers|charges|checkout|paymentLinks|invoices)\.create\b/i, "money operator can create provider money movement");
notMatches(functionSource, /\.from\(["'](?:payouts|creator_payouts|premium_entitlements|monetization_entitlements|money_access_ledger)["']\)\.(?:insert|update|upsert|delete)/i, "money operator mutates forbidden product/entitlement/payout tables");
notMatches(functionSource, /grantPremium|manualPremium|releasePayout|markPayoutPaid|createTransfer|createPaymentLink|createInvoice|chargeCustomer/i, "money operator exposes forbidden imperative action");
notMatches(admin, /onPress=\{[^}]*\b(releasePayout|processPayout|createPayout|markPayoutPaid|markPaid|grantPremium|manualPremium|createCheckout|createPaymentLink|createInvoice|createTransfer|sendMoney|enableCashout)\b/i, "Admin exposes active forbidden money handler");

if (failures.length) {
  console.error("Money Operator write-scope proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  proof: "money-operator-write-scope",
  scopedWriteTables: operatorTables.length,
  realMoneyMovementAllowed: false,
  manualPremiumGrantAllowed: false,
}, null, 2));
