#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
};
const forbidText = (label, source, needle) => {
  if (source.includes(needle)) failures.push(`${label} must not include: ${needle}`);
};

const helper = read("_lib/installedProductQaOperator.ts");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const approval = read("_lib/autonomousApprovalRequests.ts");
const ownerCommand = read("_lib/ownerCommandOperator.ts");
const ownerCommandFn = read("supabase/functions/owner-command-operator/index.ts");
const approvalFn = read("supabase/functions/autonomous-approval-request/index.ts");
const migration = read("supabase/migrations/20260713011606_installed_product_qa_operator.sql");
const firebaseMigration = read("supabase/migrations/20260713033809_installed_qa_firebase_test_lab_source.sql");
const edge = read("supabase/functions/installed-product-qa-operator/index.ts");
const cli = read("scripts/installed-qa-operator-cli.mjs");
const firebaseRunner = read("scripts/installed-qa-firebase-test-lab.mjs");
const reporting = read("scripts/installed-qa-reporting.mjs");
const traversal = read("scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs");
const packageJson = read("package.json");
const runbook = existsSync(path.join(root, "docs/INSTALLED_PRODUCT_QA_OPERATOR_RUNBOOK.md"))
  ? read("docs/INSTALLED_PRODUCT_QA_OPERATOR_RUNBOOK.md")
  : "";
const firebaseRunbook = existsSync(path.join(root, "qa/firebase-test-lab/README.md"))
  ? read("qa/firebase-test-lab/README.md")
  : "";

for (const phrase of [
  "installed_product_qa_operator",
  "scoped_write_capable_guarded",
  'activeActivationMode: "manual_cli"',
  "device_lab_scheduler_pending",
  "installed_route_traversal",
  "installed_role_traversal",
  "premium_nonpremium_gates",
  "account_fixture_health",
  "device_availability",
  "two_device_realtime_proof",
  "installed_proof_blocker_tracking",
  "fake installed proof",
  "manual Premium grant",
  "claiming two-device proof without proof",
  "silent pass on route mismatch",
  "safe_installed_qa_owner_command",
  "installed_qa_high_risk_fix_request",
  "ownerApprovalRequired: true",
]) requireText("registry", registry, phrase);

for (const table of [
  "installed_qa_operator_events",
  "installed_traversal_runs",
  "route_behavior_findings",
  "role_behavior_findings",
  "account_fixture_health_findings",
  "device_availability_findings",
  "qa_required_review_flags",
  "qa_operator_learning_state",
]) {
  requireText("migration table", migration, `public.${table}`);
  requireText("migration RLS", migration, `alter table public.${table} enable row level security`);
}
requireText("migration client write denial", migration, "from anon, authenticated");
requireText("migration service role writes", migration, "to service_role");
requireText("migration fake proof check", migration, "check (fake_proof = false)");
requireText("migration no high-risk check", migration, "check (high_risk_executed = false)");
requireText("migration no money", migration, "check (money_moved = false)");
requireText("migration no rights", migration, "check (user_rights_changed = false)");
requireText("migration no private evidence", migration, "check (private_evidence_stored = false)");
requireText("migration owner command actor", migration, "'installed_product_qa_operator'");
requireText("migration route seed rows", migration, "insert into public.route_behavior_findings");
requireText("migration role seed rows", migration, "insert into public.role_behavior_findings");
requireText("migration account fixture seed rows", migration, "insert into public.account_fixture_health_findings");
requireText("migration review flag seed rows", migration, "insert into public.qa_required_review_flags");
requireText("migration device seed rows", migration, "insert into public.device_availability_findings");
requireText("migration manual normal chat seed", migration, "manual-normal-chat-stayed-home");
requireText("migration manual restricted chat seed", migration, "manual-restricted-chat-showed-inbox");
requireText("migration manual creator marker seed", migration, "manual-creator-monetization-marker-missing");
requireText("migration manual premium seed", migration, "manual-premium-labelled-account-inactive");
requireText("migration manual moderator seed", migration, "manual-moderator-boundary-pending");
requireText("migration manual two-device seed", migration, "manual-two-device-realtime-pending");
requireText("firebase migration source", firebaseMigration, "firebase_test_lab_uploaded_artifact");
requireText("firebase migration route source check", firebaseMigration, "route_behavior_findings_source_check");
requireText("firebase migration device source check", firebaseMigration, "device_availability_findings_source_check");
requireText("firebase migration quota blocker", firebaseMigration, "firebase-free-quota-unknown");
requireText("firebase migration quota risk", firebaseMigration, "firebase_free_quota_unknown");
requireText("firebase migration zero cost", firebaseMigration, "'costEstimateUsd', 0");

for (const phrase of [
  "x-installed-qa-operator-token",
  "INSTALLED_QA_OPERATOR_TOKEN_SHA256",
  "constantTimeEqual",
  "record_traversal_run",
  "firebase_test_lab_uploaded_artifact",
  "record_route_finding",
  "record_role_finding",
  "record_account_fixture_health",
  "record_device_availability",
  "record_manual_codex_gap",
  "create_owner_command",
  "create_approval_request",
  "watch_once",
  "requestedDiscoveredBy",
  "device_lab",
  "CURRENT_MANUAL_FINDINGS",
  "route_behavior_findings",
  "role_behavior_findings",
  "account_fixture_health_findings",
  "device_availability_findings",
  "qa_required_review_flags",
  "owner_command_requests",
  "autonomous_approval_requests",
  "installed_qa_fake_proof_blocked",
  "installed_qa_money_movement_blocked",
  "installed_qa_user_rights_change_blocked",
  "manual_codex_only_gap",
  "second_device_required",
  "premium_provider_state_missing",
  "highRiskExecuted: false",
  "moneyMoved: false",
  "userRightsChanged: false",
  "fakeProof: false",
]) requireText("edge function", edge, phrase);
forbidText("edge function direct install", edge, "adb install");
forbidText("edge function service credential output", edge, "console.log");

for (const phrase of [
  "CURRENT_MANUAL_BLOCKER_FINDINGS",
  "manual-normal-chat-stayed-home",
  "manual-restricted-chat-showed-inbox",
  "manual-creator-monetization-marker-missing",
  "manual-premium-labelled-account-inactive",
  "manual-moderator-boundary-pending",
  "manual-two-device-realtime-pending",
  "classifyRouteBehavior",
  "classifyAccountFixtureHealth",
  "classifyDeviceReadiness",
  "classifyFirebaseTestLabReadiness",
  "firebase_test_lab_uploaded_artifact",
  "InstalledQaBillingRisk",
  "InstalledQaQuotaMode",
  "buildInstalledTraversalPlan",
  "buildQaOwnerCommand",
  "sanitizeInstalledQaProof",
  "manual Premium grant",
  "two-device closure without two devices",
]) requireText("helper", helper, phrase);

for (const phrase of [
  "INSTALLED_QA_OPERATOR_TOKEN",
  "INSTALLED_QA_OPERATOR_FUNCTION_URL",
  "INSTALLED_QA_DEVICE_COUNT",
  "INSTALLED_QA_DEVICE_LAB_CONFIGURED",
  "failClosed: true",
  "installed-qa-operator:watch-once",
  "installed-qa-operator:record-finding",
  "installed-qa-operator:device-readiness",
  "installed-qa-operator:account-fixtures",
  "installed-qa-operator:firebase-test-lab:status",
  "installed-qa-operator:firebase-test-lab:run",
  "installed-qa-operator:firebase-test-lab:self-test",
]) requireText("CLI/package wiring", `${cli}\n${packageJson}`, phrase);

for (const phrase of [
  "FIREBASE_TEST_LAB_MAX_COST_USD",
  "FIREBASE_TEST_LAB_MAX_COST_USD\", 0",
  "firebase_free_quota_unknown",
  "paid_usage_requires_owner_approval",
  "firebase_physical_device_blocked_by_default",
  "firebase_scheduled_run_blocked_by_default",
  "firebase_test_lab_uploaded_artifact",
  "notPlayInstalledProof: true",
  "costEstimateUsd",
  "billingRisk",
  "quotaMode",
  "FIREBASE_TEST_LAB_REMAINING_FREE_VIRTUAL_MINUTES",
  "FIREBASE_TEST_LAB_ALLOW_PHYSICAL",
  "FIREBASE_TEST_LAB_ALLOW_SCHEDULED",
  "installed-qa-firebase-test-lab self-test passed",
]) requireText("firebase runner", firebaseRunner, phrase);

const firebaseSelfTest = spawnSync(process.execPath, ["scripts/installed-qa-firebase-test-lab.mjs", "self-test"], {
  cwd: root,
  encoding: "utf8",
});
if (firebaseSelfTest.status !== 0) {
  failures.push(`Firebase Test Lab cost guard self-test failed: ${firebaseSelfTest.stderr || firebaseSelfTest.stdout}`);
}

requireText("traversal reporting import", traversal, "reportInstalledQaFromTraversalSummary");
requireText("traversal reporting status", traversal, "installedProductQaOperatorReporting");
requireText("traversal installed QA blocker-only scope", traversal, "FULL_SEEDED_ONE_DEVICE_INSTALLED_QA_BLOCKERS_ONLY");
requireText("traversal current Play version guard", traversal, "FULL_SEEDED_ONE_DEVICE_EXPECTED_VERSION_CODE");
requireText("reporting helper posts route finding", reporting, "record_route_finding");
requireText("reporting helper posts role finding", reporting, "record_role_finding");
requireText("reporting helper posts account health", reporting, "record_account_fixture_health");
requireText("reporting helper posts device availability", reporting, "record_device_availability");
requireText("reporting helper fail-closed required mode", reporting, "INSTALLED_QA_REPORT_REQUIRED");

for (const source of [approval, ownerCommand, ownerCommandFn, approvalFn]) {
  requireText("owner/approval integration", source, "installed_product_qa_operator");
}

for (const phrase of [
  "Codex caught the current installed traversal blockers manually",
  "autonomous system did not catch them before",
  "Premium fixture repair is provider-backed only",
  "two-device proof requires two Play-installed devices or approved device lab",
  "schedulerStatus=device_lab_scheduler_pending",
]) requireText("runbook", runbook, phrase);
for (const phrase of [
  "zero-cost-first",
  "Default maximum cost: `FIREBASE_TEST_LAB_MAX_COST_USD=0`",
  "virtual device only",
  "not Play-installed proof",
  "Google Play Billing",
  "two-device LiveKit proof",
  "No Firebase scheduler is active by default",
]) requireText("firebase runbook", `${runbook}\n${firebaseRunbook}`, phrase);

if (failures.length) {
  console.error("proof:installed-product-qa-operator failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:installed-product-qa-operator passed");
console.log("- installed_product_qa_operator is registered as scoped_write_capable_guarded with scheduler pending.");
console.log("- current Codex-manual blockers are first-class QA findings.");
console.log("- watch_once records unresolved installed proof coverage gaps and safe owner-command requests.");
