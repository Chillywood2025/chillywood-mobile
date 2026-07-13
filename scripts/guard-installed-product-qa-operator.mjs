#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const includes = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
};
const notIncludes = (source, needle, label) => {
  if (source.includes(needle)) failures.push(`${label} must not include: ${needle}`);
};

const registry = read("_lib/autonomousSystemsRegistry.ts");
const helper = read("_lib/installedProductQaOperator.ts");
const migration = read("supabase/migrations/20260713011606_installed_product_qa_operator.sql");
const edge = read("supabase/functions/installed-product-qa-operator/index.ts");
const cli = read("scripts/installed-qa-operator-cli.mjs");
const reporting = read("scripts/installed-qa-reporting.mjs");
const traversal = read("scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs");
const packageJson = read("package.json");
const autonomousApproval = read("_lib/autonomousApprovalRequests.ts");
const approvalFn = read("supabase/functions/autonomous-approval-request/index.ts");
const ownerCommand = read("_lib/ownerCommandOperator.ts");
const ownerCommandFn = read("supabase/functions/owner-command-operator/index.ts");
const auditDoc = read("docs/FULL_APP_AUTHORITY_PRODUCT_BEHAVIOR_AUDIT.md");
const runbook = existsSync(path.join(root, "docs/INSTALLED_PRODUCT_QA_OPERATOR_RUNBOOK.md"))
  ? read("docs/INSTALLED_PRODUCT_QA_OPERATOR_RUNBOOK.md")
  : "";

const registryBlockStart = registry.indexOf('id: "installed_product_qa_operator"');
const registryBlockEnd = registry.indexOf("\n  },", registryBlockStart);
const registryBlock = registryBlockStart >= 0 && registryBlockEnd > registryBlockStart
  ? registry.slice(registryBlockStart, registryBlockEnd)
  : "";

includes(registry, '| "installed_product_qa_operator"', "AutonomousSystemId");
includes(registryBlock, 'status: "scoped_write_capable_guarded"', "registry status");
includes(registryBlock, 'activeActivationMode: "manual_cli"', "registry activation");
includes(registryBlock, 'schedulerStatus: "device_lab_scheduler_pending"', "scheduler pending truth");
includes(registryBlock, "silent pass on route mismatch", "route mismatch guard");
includes(registryBlock, "fake installed proof", "fake proof ban");
includes(registryBlock, "manual Premium grant", "manual Premium ban");
includes(registryBlock, "two-device closure requires two devices or approved device lab", "two-device gate");
includes(registryBlock, "owner-command routing for source/proof/testID fixes", "owner command gate");
includes(registryBlock, "Level 3/4 approval for high-risk fixes", "approval gate");
includes(registryBlock, "scheduler cannot be claimed active without device-lab/timer proof", "scheduler overclaim guard");
includes(registryBlock, "installed_qa_high_risk_fix_request", "high-risk approval surface");
includes(registryBlock, "ownerApprovalRequired: true", "high-risk owner approval");

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
  includes(migration, `public.${table}`, "migration table");
  includes(migration, `alter table public.${table} enable row level security`, "RLS enabled");
}
includes(migration, "from anon, authenticated", "client access revoked");
includes(migration, "grant select, insert, update on table", "service role scoped writes");
includes(migration, "check (fake_proof = false)", "fake proof DB invariant");
includes(migration, "check (money_moved = false)", "money moved DB invariant");
includes(migration, "check (user_rights_changed = false)", "user rights DB invariant");
includes(migration, "check (private_evidence_stored = false)", "private evidence DB invariant");
includes(migration, "drop constraint if exists autonomous_approval_requests_requested_by_actor_type_check", "approval actor whitelist migration");
includes(migration, "drop constraint if exists owner_command_events_actor_type_check", "owner command actor whitelist migration");
notIncludes(migration, "grant all on table", "broad table grant");
notIncludes(migration, "to anon", "anon grant");
notIncludes(migration, "to authenticated", "authenticated grant");

for (const phrase of [
  "installed_qa_fake_proof_blocked",
  "installed_qa_money_movement_blocked",
  "installed_qa_user_rights_change_blocked",
  "installed_qa_high_risk_mutation_blocked",
  "HIGH_RISK_MUTATION_PATTERN",
  "recordRouteFinding",
  "recordRoleFinding",
  "recordAccountFixtureHealth",
  "recordDeviceAvailability",
  "recordManualCodexGap",
  "runWatchOnce",
  "CURRENT_MANUAL_FINDINGS",
  "createOwnerCommand",
  "createApprovalRequest",
  "constantTimeEqual",
  "containsSecretLikeValue",
  "sanitize",
  "owner_command_requests",
  "autonomous_approval_requests",
  "highRiskExecuted: false",
  "moneyMoved: false",
  "userRightsChanged: false",
  "fakeProof: false",
]) includes(edge, phrase, "edge function guard");
notIncludes(edge, "grantPremium", "edge manual Premium grant");
notIncludes(edge, "supabase.auth.admin", "edge auth admin mutation");
notIncludes(edge, "stripe.", "edge money/provider SDK");
notIncludes(edge, "Deno.run", "edge shell execution");
notIncludes(edge, "adb install", "edge sideload/install");
notIncludes(edge, "clear app data", "edge clear-data execution");

for (const phrase of [
  "manual-normal-chat-stayed-home",
  "route_contract_mismatch",
  "manual-restricted-chat-showed-inbox",
  "expected_denial_copy_missing",
  "manual-creator-monetization-marker-missing",
  "missing_testid_or_marker",
  "manual-premium-labelled-account-inactive",
  "premium_provider_state_missing",
  "manual-moderator-boundary-pending",
  "manual_codex_only_gap",
  "manual-two-device-realtime-pending",
  "second_device_required",
  "sanitizeInstalledQaProof",
]) includes(helper, phrase, "helper classification");
notIncludes(helper, "status: \"closed\"", "manual findings must not be pre-closed");

includes(reporting, "postInstalledQaFinding", "traversal reporter");
includes(reporting, "INSTALLED_QA_REPORT_REQUIRED", "report-required fail closed");
includes(traversal, "reportInstalledQaFromTraversalSummary", "installed traversal integration");
includes(traversal, "installed-qa-operator-reporting-status.json", "reporting artifact");

for (const script of [
  "installed-qa-operator:watch-once",
  "installed-qa-operator:status",
  "installed-qa-operator:report",
  "installed-qa-operator:record-finding",
  "installed-qa-operator:device-readiness",
  "installed-qa-operator:account-fixtures",
  "proof:installed-product-qa-operator",
  "guard:installed-product-qa-operator",
]) includes(packageJson, `"${script}"`, "package wiring");
includes(cli, "failClosed: true", "CLI missing env fail closed");
includes(cli, "process.exit(1)", "CLI exits nonzero on missing token/url");
notIncludes(cli, "console.log(token", "CLI token output");

for (const source of [autonomousApproval, approvalFn, ownerCommand, ownerCommandFn]) {
  includes(source, "installed_product_qa_operator", "approval/owner-command integration");
}

for (const phrase of [
  "Codex caught the current installed traversal blockers manually",
  "autonomous system did not catch them before",
  "current blockers are open QA findings",
  "Premium fixture repair is provider-backed only",
  "two-device proof requires two Play-installed devices or approved device lab",
  "scheduler pending until device-lab path exists",
]) includes(runbook + auditDoc, phrase, "docs");

if (/schedulerStatus:\s*"chillywood-installed.*timer/i.test(registryBlock)) failures.push("scheduler claimed active without device-lab/timer proof");
if (/result:\s*"pass"[\s\S]{0,200}second_device_required/.test(helper + edge)) failures.push("two-device blocker can pass");
if (/fake_proof\s*:\s*true|fakeProof:\s*true/.test(edge + helper + reporting)) failures.push("fake proof true appears in QA source");
if (/manualPremiumGrant|direct entitlement edit allowed|grantPremium/.test(edge + helper + registryBlock)) failures.push("manual Premium grant path appears");
if (/installed traversal[\s\S]{0,160}Closed[\s\S]{0,160}blocked/i.test(runbook + auditDoc)) failures.push("docs can claim Closed with blockers unresolved");
const secretScanSource = runbook + auditDoc + edge + helper + reporting;
if (/sk_live_|whsec_|SUPABASE_SERVICE_ROLE_KEY\s*=|INSTALLED_QA_OPERATOR_TOKEN\s*=|BEGIN PRIVATE KEY|signedUrl\s*[:=]|signed_url\s*[:=]/i.test(secretScanSource)) {
  failures.push("secret/private proof value pattern found");
}

if (failures.length) {
  console.error("guard:installed-product-qa-operator failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("guard:installed-product-qa-operator passed");
