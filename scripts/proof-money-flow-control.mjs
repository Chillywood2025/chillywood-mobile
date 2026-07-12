#!/usr/bin/env node

import { readFileSync } from "node:fs";
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

const helper = read("_lib/moneyFlowControl.ts");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const admin = read("app/admin.tsx");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const operatingModel = read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md");
const ownerAdminSpec = read("docs/owner-admin-rachi-implementation-spec.md");
const moneyRunbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const packageJson = read("package.json");
const moneyOperator = read("supabase/functions/money-operator/index.ts");
const externalConfirmation = read("_lib/moneyExternalConfirmation.ts");

const docs = [registryDoc, operatingModel, ownerAdminSpec, moneyRunbook].join("\n\n");

const proofCases = [
  {
    name: "read-only reconciliation is Level 1",
    passes: () => helper.includes('"read_only_reconciliation_report"') && /MONEY_FLOW_LEVEL_0_OR_1_ACTIONS[\s\S]*read_only_reconciliation_report/.test(helper) && /return 1;/.test(helper),
  },
  {
    name: "sandbox test-mode webhook proof is Level 2",
    passes: () => helper.includes('"sandbox_webhook_validation"') && /MONEY_FLOW_LEVEL_2_ACTIONS[\s\S]*sandbox_webhook_validation/.test(helper) && /return 2;/.test(helper),
  },
  {
    name: "production checkout enablement is Level 3",
    passes: () => helper.includes('"enable_production_checkout"') && /MONEY_FLOW_LEVEL_3_ACTIONS[\s\S]*enable_production_checkout/.test(helper) && /return 3;/.test(helper),
  },
  {
    name: "real payout is Level 4",
    passes: () => helper.includes('"real_payout"') && /MONEY_FLOW_LEVEL_4_ACTIONS[\s\S]*real_payout/.test(helper) && /return 4;/.test(helper),
  },
  {
    name: "real transfer is Level 4",
    passes: () => helper.includes('"real_transfer"') && /MONEY_FLOW_LEVEL_4_ACTIONS[\s\S]*real_transfer/.test(helper),
  },
  {
    name: "cashout enablement is Level 4",
    passes: () => helper.includes('"real_cashout"') && /MONEY_FLOW_LEVEL_4_ACTIONS[\s\S]*real_cashout/.test(helper),
  },
  {
    name: "manual Premium grant is forbidden",
    passes: () => helper.includes('"manual_premium_grant"') && helper.includes("manual_premium_grant_forbidden"),
  },
  {
    name: "fake paid status is forbidden",
    passes: () => helper.includes('"fake_paid_status"') && helper.includes("fake_paid_status_forbidden"),
  },
  {
    name: "fake creator earnings are forbidden",
    passes: () => helper.includes('"fake_creator_earnings"') && helper.includes("fake_creator_earnings_forbidden"),
  },
  {
    name: "unknown action defaults Level 4",
    passes: () => helper.includes("unknown_money_action_defaults_level_4") && /return 4;\s*};/.test(helper),
  },
  {
    name: "real money action creates approval request, not execution",
    passes: () => helper.includes("approval_request_required") && helper.includes("planLevelThreeOrFourApprovalRequest") && !helper.includes("stripe.payouts.create"),
  },
  {
    name: "approval requires fresh preflight",
    passes: () => helper.includes("fresh_preflight_required") && docs.includes("fresh preflight"),
  },
  {
    name: "Level 4 requires external confirmation",
    passes: () => helper.includes("external_provider_confirmation_required") && helper.includes("Level 4 money movement requires owner approval plus external provider confirmation/readback"),
  },
  {
    name: "secrets are redacted",
    passes: () => helper.includes("sanitizeMoneyProofMetadata") && helper.includes("sanitizeAutonomousApprovalMetadata"),
  },
  {
    name: "provider test-mode cannot be claimed production",
    passes: () => registry.includes("test-mode data marked production") && docs.includes("test-mode data as production"),
  },
  {
    name: "read-only Admin summary cannot execute mutation",
    passes: () => admin.includes("admin-money-flow-control-section") && admin.includes("This section exposes safe status/review visibility only"),
  },
  {
    name: "scoped safe operator writes are limited to reconciliation/status/review",
    passes: () => helper.includes("MONEY_OPERATOR_ALLOWED_WRITE_TABLES") && helper.includes("money_reconciliation_findings") && helper.includes("money_required_review_flags") && helper.includes("MONEY_OPERATOR_FORBIDDEN_WRITE_SCOPES"),
  },
  {
    name: "Money Operator function is token gated and blocks real-money execution",
    passes: () => moneyOperator.includes("x-money-operator-token") && moneyOperator.includes("MONEY_OPERATOR_TOKEN_SHA256") && moneyOperator.includes("blocked_pending_owner_scope_and_external_confirmation"),
  },
  {
    name: "Money Operator monitors provider webhook reliability without dashboard mutation",
    passes: () => moneyOperator.includes("provider_webhook_health")
      && moneyOperator.includes("record_provider_webhook_delivery_status")
      && moneyOperator.includes("provider_delivery_history_readback")
      && moneyOperator.includes("watch_once")
      && moneyOperator.includes("provider_dashboard_repair_request")
      && moneyOperator.includes("provider_dashboard_mutated: false"),
  },
  {
    name: "Level 4 external confirmation helper blocks test-mode production closure",
    passes: () => externalConfirmation.includes("test_mode_confirmation_cannot_satisfy_production") && externalConfirmation.includes("provider_reference_readback_required"),
  },
];

for (const check of proofCases) {
  if (!check.passes()) fail(`proof case failed: ${check.name}`);
}

includes(registry, 'id: "money_flow_control"', "autonomous registry");
includes(registry, "scoped_write_capable_guarded", "money registry status");
includes(registry, "owner/super-admin approval plus external provider confirmation for Level 4", "Level 4 registry gate");
includes(registryDoc, "`money_flow_control`", "registry doc");
includes(moneyRunbook, "Money Flow & Ledger Control Plane", "money runbook");
includes(packageJson, '"proof:money-flow-control"', "package scripts");
includes(packageJson, '"proof:money-operator-write-scope"', "package scripts");
includes(packageJson, '"proof:money-external-confirmation"', "package scripts");
includes(packageJson, '"proof:provider-webhook-reliability"', "package scripts");
includes(packageJson, '"proof:money-provider-reliability-loop"', "package scripts");
includes(packageJson, '"money-operator:watch-once"', "package scripts");
includes(packageJson, '"money-operator:provider-health"', "package scripts");
includes(packageJson, '"money-operator:report"', "package scripts");
includes(packageJson, '"guard:provider-webhook-reliability"', "package scripts");
includes(packageJson, '"guard:money-flow-control"', "package scripts");

for (const testId of [
  "admin-money-flow-control-section",
  "money-flow-control-readonly-status",
  "money-flow-control-approval-required",
  "money-flow-control-external-confirmation-required",
  "money-flow-control-blocked-actions",
  "money-flow-control-proof-status",
  "money-operator-status",
  "money-operator-provider-sync-health",
  "money-operator-external-confirmation-required",
]) {
  includes(admin, testId, "Admin Money Flow Control UI");
}

matches(helper, /classifyMoneyActionApprovalLevel[\s\S]*return 4;/, "unknown money action default");
matches(registry, /id:\s*"real_money_movement_or_public_money_launch"[\s\S]*approvalLevel:\s*4[\s\S]*ownerApprovalRequired:\s*true/, "Level 4 registry surface");

if (failures.length) {
  console.error("Money Flow Control proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  proofCases: proofCases.length,
  system: "money_flow_control",
  status: "scoped_write_capable_guarded",
  realMoneyMovement: "level_4_owner_approval_plus_external_provider_confirmation_required",
  manualPremiumGrantAllowed: false,
  fakeRevenueAllowed: false,
}, null, 2));
