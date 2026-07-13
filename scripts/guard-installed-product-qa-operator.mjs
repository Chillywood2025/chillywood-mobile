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
const firebaseMigration = read("supabase/migrations/20260713033809_installed_qa_firebase_test_lab_source.sql");
const firebaseCostCappedMigration = read("supabase/migrations/20260713044500_installed_qa_firebase_cost_capped_policy.sql");
const edge = read("supabase/functions/installed-product-qa-operator/index.ts");
const cli = read("scripts/installed-qa-operator-cli.mjs");
const firebaseRunner = read("scripts/installed-qa-firebase-test-lab.mjs");
const reporting = read("scripts/installed-qa-reporting.mjs");
const traversal = read("scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const autonomousApproval = read("_lib/autonomousApprovalRequests.ts");
const approvalFn = read("supabase/functions/autonomous-approval-request/index.ts");
const ownerCommand = read("_lib/ownerCommandOperator.ts");
const ownerCommandFn = read("supabase/functions/owner-command-operator/index.ts");
const auditDoc = read("docs/FULL_APP_AUTHORITY_PRODUCT_BEHAVIOR_AUDIT.md");
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
includes(migration, "insert into public.route_behavior_findings", "manual route finding seed rows");
includes(migration, "insert into public.role_behavior_findings", "manual role finding seed rows");
includes(migration, "insert into public.account_fixture_health_findings", "manual account fixture seed rows");
includes(migration, "insert into public.qa_required_review_flags", "manual review flag seed rows");
includes(migration, "insert into public.device_availability_findings", "manual device finding seed rows");
includes(migration, "'codex_manual'", "seed discovered_by codex manual");
includes(migration, "'manual_codex_proof'", "seed proof source manual");
includes(migration, "'open'", "seed findings open");
includes(firebaseMigration, "firebase_test_lab_uploaded_artifact", "Firebase Test Lab source check");
includes(firebaseMigration, "installed_qa_operator_events_source_check", "Firebase event source constraint");
includes(firebaseMigration, "device_availability_findings_source_check", "Firebase device source constraint");
includes(firebaseCostCappedMigration, "firebase-cost-capped-cheap-mode", "Firebase cost-capped policy seed");
includes(firebaseCostCappedMigration, "firebase-free-quota-unknown", "Firebase zero-cost blocker superseded");
includes(firebaseCostCappedMigration, "'monthlyBudgetUsd', 5", "Firebase monthly cap");
includes(firebaseCostCappedMigration, "'maxAllowedCostUsd', 0.25", "Firebase per-run cap");
includes(firebaseCostCappedMigration, "'quotaMode', 'cost_capped_worst_case'", "Firebase bounded cost quota mode");
includes(firebaseCostCappedMigration, "'physicalDeviceAllowedByDefault', false", "Firebase physical blocked by default");
includes(firebaseCostCappedMigration, "'broadCrawlAllowedByDefault', false", "Firebase broad crawl blocked by default");
includes(firebaseCostCappedMigration, "'twoDeviceFirebaseAllowedByDefault', false", "Firebase two-device blocked by default");
notIncludes(migration, "grant all on table", "broad table grant");
notIncludes(migration, "to anon", "anon grant");
notIncludes(migration, "to authenticated", "authenticated grant");

for (const phrase of [
  "installed_qa_fake_proof_blocked",
  "installed_qa_money_movement_blocked",
  "installed_qa_user_rights_change_blocked",
  "installed_qa_high_risk_mutation_blocked",
  "HIGH_RISK_MUTATION_PATTERN",
  "firebase_test_lab_uploaded_artifact",
  "recordRouteFinding",
  "recordRoleFinding",
  "recordAccountFixtureHealth",
  "recordDeviceAvailability",
  "recordManualCodexGap",
  "runWatchOnce",
  "requestedDiscoveredBy",
  "discoveredBy",
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
  "classifyFirebaseTestLabReadiness",
  "firebase_test_lab_uploaded_artifact",
  "sanitizeInstalledQaProof",
]) includes(helper, phrase, "helper classification");
notIncludes(helper, "status: \"closed\"", "manual findings must not be pre-closed");

for (const phrase of [
  "FIREBASE_TEST_LAB_MODE",
  "cost_capped",
  "FIREBASE_TEST_LAB_MONTHLY_CAP_USD",
  "numberEnv(\"FIREBASE_TEST_LAB_MONTHLY_CAP_USD\", 5)",
  "FIREBASE_TEST_LAB_PER_RUN_CAP_USD",
  "numberEnv(\"FIREBASE_TEST_LAB_PER_RUN_CAP_USD\", 0.25)",
  "FIREBASE_TEST_LAB_ALLOW_VIRTUAL",
  "FIREBASE_TEST_LAB_MAX_SCHEDULED_RUNS_PER_DAY",
  "FIREBASE_TEST_LAB_RUN_ON_OTA_CHANGE",
  "FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL",
  "FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE",
  "firebase_per_run_cap_exceeded",
  "firebase_monthly_cap_exceeded",
  "firebase_physical_device_blocked_by_default",
  "firebase_scheduled_daily_limit_reached",
  "firebase_broad_crawl_blocked_by_default",
  "firebase_two_device_blocked_by_default",
  "firebase_cost_unbounded",
  "FIREBASE_TEST_LAB_ZERO_COST_CONFIRMED",
  "FIREBASE_TEST_LAB_FREE_QUOTA_VERIFIED",
  "costEstimateUsd",
  "maxAllowedCostUsd",
  "monthlyBudgetUsd",
  "monthlySpentEstimateUsd",
  "billingRisk",
  "quotaMode",
  "notPlayInstalledProof: true",
  "cannotProve",
  "Google Play Billing or RevenueCat active Premium",
  "two-device LiveKit realtime",
]) includes(firebaseRunner, phrase, "Firebase Test Lab cost guard");
notIncludes(firebaseRunner, "FIREBASE_TEST_LAB_ALLOW_PHYSICAL\", true", "Firebase physical default");
notIncludes(firebaseRunner, "FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL\", true", "Firebase broad crawl default");
notIncludes(firebaseRunner, "FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE\", true", "Firebase two-device default");
notIncludes(firebaseRunner, "FIREBASE_TEST_LAB_MAX_SCHEDULED_RUNS_PER_DAY\", 30", "Firebase high-frequency schedule default");
notIncludes(firebaseRunner, "notPlayInstalledProof: false", "Firebase proof overclaim");

for (const phrase of [
  "EnvironmentFile=/etc/chillywood/installed-product-qa-operator.env",
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
  "INSTALLED_QA_SCHEDULER=systemd_timer",
  "NoNewPrivileges=true",
  "ProtectSystem=strict",
  "PrivateTmp=true",
  "RestrictSUIDSGID=true",
  "LockPersonality=true",
  "CapabilityBoundingSet=",
  "ReadWritePaths=/var/lib/chillywood/installed-qa",
]) includes(`${firebaseSystemdScript}\n${firebaseSystemdService}`, phrase, "Firebase systemd scheduler policy");
includes(firebaseSystemdTimer, "OnCalendar=*-*-* 03:17:00", "Firebase timer daily cadence");
includes(firebaseSystemdTimer, "RandomizedDelaySec=10min", "Firebase timer jitter");
notIncludes(`${firebaseSystemdScript}\n${firebaseSystemdService}\n${firebaseSystemdTimer}`, "SERVICE_ROLE", "systemd service-role key");
notIncludes(`${firebaseSystemdScript}\n${firebaseSystemdService}`, "FIREBASE_TEST_LAB_ALLOW_PHYSICAL=true", "systemd physical Firebase device");
notIncludes(`${firebaseSystemdScript}\n${firebaseSystemdService}`, "FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL=true", "systemd broad Firebase crawl");
notIncludes(`${firebaseSystemdScript}\n${firebaseSystemdService}`, "FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE=true", "systemd Firebase two-device overclaim");
notIncludes(firebaseSystemdTimer, "30min", "systemd high-frequency Firebase schedule");

includes(reporting, "postInstalledQaFinding", "traversal reporter");
includes(reporting, "INSTALLED_QA_REPORT_REQUIRED", "report-required fail closed");
includes(traversal, "reportInstalledQaFromTraversalSummary", "installed traversal integration");
includes(traversal, "FULL_SEEDED_ONE_DEVICE_INSTALLED_QA_BLOCKERS_ONLY", "installed QA targeted traversal mode");
includes(traversal, "FULL_SEEDED_ONE_DEVICE_EXPECTED_VERSION_CODE", "current Play versionCode guard");
includes(traversal, "installed-qa-operator-reporting-status.json", "reporting artifact");

for (const script of [
  "installed-qa-operator:watch-once",
  "installed-qa-operator:status",
  "installed-qa-operator:report",
  "installed-qa-operator:record-finding",
  "installed-qa-operator:device-readiness",
  "installed-qa-operator:account-fixtures",
  "installed-qa:firebase-test-plan",
  "installed-qa:firebase-test-run",
  "installed-qa-operator:firebase-test-lab:status",
  "installed-qa-operator:firebase-test-lab:run",
  "installed-qa-operator:firebase-test-lab:self-test",
  "proof:installed-product-qa-operator",
  "guard:installed-product-qa-operator",
]) includes(packageJson, `"${script}"`, "package wiring");
includes(cli, "failClosed: true", "CLI missing env fail closed");
includes(cli, "process.exit(1)", "CLI exits nonzero on missing token/url");
includes(cli, "INSTALLED_QA_DEVICE_COUNT", "CLI watch_once device count input");
includes(cli, "INSTALLED_QA_DEVICE_LAB_CONFIGURED", "CLI watch_once device-lab input");
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
  "Firebase Test Lab uses cost-capped cheap mode",
  "Firebase uploaded artifact is not Play-installed proof",
  "FIREBASE_TEST_LAB_MONTHLY_CAP_USD=5",
  "FIREBASE_TEST_LAB_PER_RUN_CAP_USD=0.25",
]) includes(runbook + auditDoc + firebaseRunbook, phrase, "docs");

for (const phrase of [
  "const canUseAdminSearch = isSignedIn",
  'hasPlatformRoleMembership(platformRoles, ["owner", "super_admin", "operator"])',
  'hasPlatformStaffPermission(platformRoles, ["admin.user.search", "user_lookup"])',
  "if (!canUseAdminSearch) return false;",
  "if (!canUseAdminSearch) return null;",
  "if (!canUseAdminSearch || queryText.length < ADMIN_SEARCH_MIN_LENGTH)",
]) includes(admin, phrase, "moderator admin-search boundary");

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
