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
const firebaseCostCappedMigration = read("supabase/migrations/20260713044500_installed_qa_firebase_cost_capped_policy.sql");
const edge = read("supabase/functions/installed-product-qa-operator/index.ts");
const cli = read("scripts/installed-qa-operator-cli.mjs");
const firebaseRunner = read("scripts/installed-qa-firebase-test-lab.mjs");
const reporting = read("scripts/installed-qa-reporting.mjs");
const traversal = read("scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const runbook = existsSync(path.join(root, "docs/INSTALLED_PRODUCT_QA_OPERATOR_RUNBOOK.md"))
  ? read("docs/INSTALLED_PRODUCT_QA_OPERATOR_RUNBOOK.md")
  : "";
const firebaseRunbook = existsSync(path.join(root, "qa/firebase-test-lab/README.md"))
  ? read("qa/firebase-test-lab/README.md")
  : "";
const firebaseSystemdScript = existsSync(path.join(root, "ops/installed-product-qa-operator/systemd/installed-qa-firebase-smoke.sh"))
  ? read("ops/installed-product-qa-operator/systemd/installed-qa-firebase-smoke.sh")
  : "";
const firebaseSystemdService = existsSync(path.join(root, "ops/installed-product-qa-operator/systemd/chillywood-installed-qa-firebase-smoke.service"))
  ? read("ops/installed-product-qa-operator/systemd/chillywood-installed-qa-firebase-smoke.service")
  : "";
const firebaseSystemdTimer = existsSync(path.join(root, "ops/installed-product-qa-operator/systemd/chillywood-installed-qa-firebase-smoke.timer"))
  ? read("ops/installed-product-qa-operator/systemd/chillywood-installed-qa-firebase-smoke.timer")
  : "";

for (const phrase of [
  "installed_product_qa_operator",
  "scoped_write_capable_guarded",
  'activeActivationMode: "manual_cli"',
  "firebase_scheduler_service_completion_blocked",
  "installed_route_traversal",
  "installed_role_traversal",
  "premium_nonpremium_gates",
  "account_fixture_health",
  "device_availability",
  "firebase_test_lab_results_bucket_bootstrap",
  "two_device_realtime_proof",
  "installed_proof_blocker_tracking",
  "fake installed proof",
  "manual Premium grant",
  "claiming two-device proof without proof",
  "silent pass on route mismatch",
  "safe_installed_qa_owner_command",
  "gs://chillywood-installed-qa-testlab-results",
  "Firebase Test Lab scheduler uses bounded async matrix start/poll and cannot wait indefinitely",
  "installed-qa-testlab-runner@chillywood-app.iam.gserviceaccount.com",
  "create gs://chillywood-installed-qa-testlab-results only if billing is already active/available",
  "enable or link Google Cloud billing",
  "grant Owner IAM",
  "grant Editor IAM",
  "grant project-wide Storage Admin",
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
requireText("firebase cost migration policy", firebaseCostCappedMigration, "firebase-cost-capped-cheap-mode");
requireText("firebase cost migration supersedes zero-only blocker", firebaseCostCappedMigration, "firebase-free-quota-unknown");
requireText("firebase cost migration monthly cap", firebaseCostCappedMigration, "'monthlyBudgetUsd', 5");
requireText("firebase cost migration per-run cap", firebaseCostCappedMigration, "'maxAllowedCostUsd', 0.25");
requireText("firebase cost migration quota mode", firebaseCostCappedMigration, "'quotaMode', 'cost_capped_worst_case'");
requireText("firebase cost migration physical blocked", firebaseCostCappedMigration, "'physicalDeviceAllowedByDefault', false");
requireText("firebase cost migration broad crawl blocked", firebaseCostCappedMigration, "'broadCrawlAllowedByDefault', false");
requireText("firebase cost migration two-device blocked", firebaseCostCappedMigration, "'twoDeviceFirebaseAllowedByDefault', false");

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
  "FIREBASE_TEST_LAB_RESULTS_BUCKET_BOOTSTRAP_POLICY",
  "classifyFirebaseTestLabResultsBucketBootstrap",
  "firebase_test_lab_results_bucket_bootstrap",
  "chillywood-installed-qa-testlab-results",
  "installed-qa-testlab-runner@chillywood-app.iam.gserviceaccount.com",
  "google_cloud_billing_required_for_dedicated_test_lab_bucket",
  "enable or link Google Cloud billing",
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
  "installed-qa:firebase-test-plan",
  "installed-qa:firebase-test-run",
  "installed-qa-operator:firebase-test-lab:status",
  "installed-qa-operator:firebase-test-lab:start",
  "installed-qa-operator:firebase-test-lab:poll",
  "installed-qa-operator:firebase-test-lab:run",
  "installed-qa-operator:firebase-test-lab:run-bounded",
  "installed-qa-operator:firebase-test-lab:self-test",
]) requireText("CLI/package wiring", `${cli}\n${packageJson}`, phrase);

for (const phrase of [
  "FIREBASE_TEST_LAB_MODE",
  "cost_capped",
  "FIREBASE_TEST_LAB_MONTHLY_CAP_USD",
  "FIREBASE_TEST_LAB_PER_RUN_CAP_USD",
  "FIREBASE_TEST_LAB_ALLOW_VIRTUAL",
  "FIREBASE_TEST_LAB_MAX_SCHEDULED_RUNS_PER_DAY",
  "FIREBASE_TEST_LAB_RUN_ON_OTA_CHANGE",
  "FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL",
  "FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE",
  "FIREBASE_TEST_LAB_RESULTS_BUCKET",
  "FIREBASE_TEST_LAB_MAX_WAIT_SECONDS",
  "FIREBASE_TEST_LAB_POLL_INTERVAL_SECONDS",
  "FIREBASE_TEST_LAB_ALLOW_PENDING_MATRIX",
  "FIREBASE_TEST_LAB_MAX_ACTIVE_MATRICES",
  "FIREBASE_TEST_LAB_PENDING_MATRIX_FILE",
  "DEFAULT_RESULTS_BUCKET",
  "DEFAULT_PENDING_MATRIX_PATH",
  "--results-bucket",
  "--async",
  "resultsBucket",
  "firebase_per_run_cap_exceeded",
  "firebase_monthly_cap_exceeded",
  "firebase_physical_device_blocked_by_default",
  "firebase_scheduled_daily_limit_reached",
  "firebase_cost_unbounded",
  "cost_capped_worst_case",
  "firebase_test_lab_uploaded_artifact",
  "notPlayInstalledProof: true",
  "costEstimateUsd",
  "maxAllowedCostUsd",
  "monthlyBudgetUsd",
  "monthlySpentEstimateUsd",
  "billingRisk",
  "quotaMode",
  "buildLedgerEvent",
  "startMatrixAsync",
  "pollMatrixOnce",
  "run-bounded",
  "matrix_started",
  "matrix_pending",
  "matrix_completed",
  "matrix_failed",
  "matrix_timeout",
  "matrix_posting_failed",
  "TERMINAL_MATRIX_STATES",
  "tier0",
  "tier1",
  "tier2",
  "tier3",
  "installed-qa-firebase-test-lab self-test passed",
]) requireText("firebase runner", firebaseRunner, phrase);

for (const phrase of [
  "PATH=\"/usr/local/bin:/usr/bin:/bin:${PATH:-}\"",
  "CHILLYWOOD_REPO_DIR",
  "INSTALLED_QA_OPERATOR_TOKEN",
  "FIREBASE_TEST_LAB_MODE=cost_capped",
  "FIREBASE_TEST_LAB_MONTHLY_CAP_USD=5",
  "FIREBASE_TEST_LAB_PER_RUN_CAP_USD=0.25",
  "FIREBASE_TEST_LAB_ALLOW_VIRTUAL=true",
  "FIREBASE_TEST_LAB_ALLOW_PHYSICAL=false",
  "FIREBASE_TEST_LAB_MAX_SCHEDULED_RUNS_PER_DAY=1",
  "FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL=false",
  "FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE=false",
  "FIREBASE_TEST_LAB_RUN_REASON=daily_scheduled",
  "FIREBASE_TEST_LAB_REPORT_TO_OPERATOR=true",
  "FIREBASE_TEST_LAB_RESULTS_BUCKET=chillywood-installed-qa-testlab-results",
  "FIREBASE_TEST_LAB_MAX_WAIT_SECONDS",
  "FIREBASE_TEST_LAB_POLL_INTERVAL_SECONDS",
  "FIREBASE_TEST_LAB_ALLOW_PENDING_MATRIX",
  "FIREBASE_TEST_LAB_MAX_ACTIVE_MATRICES",
  "FIREBASE_TEST_LAB_PENDING_MATRIX_FILE",
  "INSTALLED_QA_SCHEDULER=systemd_timer",
  "installed-qa:firebase-test-plan",
  "installed-qa:firebase-test-run",
  "installed-qa-operator:report",
]) requireText("Firebase systemd script", `${firebaseSystemdScript}\n${firebaseSystemdService}`, phrase);
for (const phrase of [
  "EnvironmentFile=/etc/chillywood/installed-product-qa-operator.env",
  "NoNewPrivileges=true",
  "ProtectHome=true",
  "ProtectSystem=strict",
  "PrivateTmp=true",
  "RestrictSUIDSGID=true",
  "LockPersonality=true",
  "CapabilityBoundingSet=",
  "TimeoutStartSec=20min",
  "RuntimeMaxSec=20min",
  "KillMode=control-group",
  "Restart=no",
  "ReadWritePaths=/var/lib/chillywood/installed-qa",
]) requireText("Firebase systemd service", firebaseSystemdService, phrase);
for (const phrase of [
  "OnCalendar=*-*-* 03:17:00",
  "RandomizedDelaySec=10min",
  "Unit=chillywood-installed-qa-firebase-smoke.service",
]) requireText("Firebase systemd timer", firebaseSystemdTimer, phrase);
forbidText("Firebase systemd assets service-role key", `${firebaseSystemdScript}\n${firebaseSystemdService}\n${firebaseSystemdTimer}`, "SERVICE_ROLE");
forbidText("Firebase systemd assets physical enable", `${firebaseSystemdScript}\n${firebaseSystemdService}`, "FIREBASE_TEST_LAB_ALLOW_PHYSICAL=true");
forbidText("Firebase systemd assets broad crawl enable", `${firebaseSystemdScript}\n${firebaseSystemdService}`, "FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL=true");
forbidText("Firebase systemd assets two-device enable", `${firebaseSystemdScript}\n${firebaseSystemdService}`, "FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE=true");
forbidText("Firebase systemd timer high frequency", firebaseSystemdTimer, "30min");

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
  "const canUseAdminSearch = isSignedIn",
  'hasPlatformRoleMembership(platformRoles, ["owner", "super_admin", "operator"])',
  'hasPlatformStaffPermission(platformRoles, ["admin.user.search", "user_lookup"])',
  "if (!canUseAdminSearch) return false;",
  "if (!canUseAdminSearch) return null;",
  "if (!canUseAdminSearch || queryText.length < ADMIN_SEARCH_MIN_LENGTH)",
]) requireText("installed moderator admin-search boundary", admin, phrase);

for (const phrase of [
  "Codex caught the current installed traversal blockers manually",
  "autonomous system did not catch them before",
  "Premium fixture repair is provider-backed only",
  "two-device proof requires two Play-installed devices or approved device lab",
  "schedulerStatus=firebase_scheduler_service_completion_blocked",
]) requireText("runbook", runbook, phrase);
for (const phrase of [
  "cost-capped cheap mode",
  "FIREBASE_TEST_LAB_MONTHLY_CAP_USD=5",
  "FIREBASE_TEST_LAB_PER_RUN_CAP_USD=0.25",
  "Tier 0",
  "Tier 1",
  "virtual-device",
  "not Play-installed proof",
  "Google Play Billing",
  "two-device LiveKit proof",
  "No every-30-minute Firebase device schedule is allowed",
]) requireText("firebase runbook", `${runbook}\n${firebaseRunbook}`, phrase);

if (failures.length) {
  console.error("proof:installed-product-qa-operator failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:installed-product-qa-operator passed");
console.log("- installed_product_qa_operator is registered as scoped_write_capable_guarded with Firebase scheduler service completion blocked.");
console.log("- current Codex-manual blockers are first-class QA findings.");
console.log("- watch_once records unresolved installed proof coverage gaps and safe owner-command requests.");
