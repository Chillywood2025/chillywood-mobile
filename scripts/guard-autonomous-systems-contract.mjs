#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const registry = read("_lib/autonomousSystemsRegistry.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const operatingModel = read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const approvalModel = read("_lib/autonomousApprovalRequests.ts");
const approvalFunction = read("supabase/functions/autonomous-approval-request/index.ts");
const ownerAuthority = read("_lib/platformOwnerAuthority.ts");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const migration = read("supabase/migrations/20260712145220_autonomous_scoped_write_operators.sql");
const observabilityMigration = read("supabase/migrations/20260712170541_observability_runtime_operator.sql");
const sharedFn = read("supabase/functions/_shared/scoped-operator.ts");
const ownerCommandHelper = read("_lib/ownerCommandOperator.ts");
const ownerCommandFunction = read("supabase/functions/owner-command-operator/index.ts");
const ownerCommandMigration = read("supabase/migrations/20260712180500_owner_command_operator.sql");
const ownerCommandRunbook = read("docs/OWNER_COMMAND_OPERATOR_RUNBOOK.md");
const userReportMigration = read("supabase/migrations/20260714001704_user_report_router.sql");
const userReportFunction = read("supabase/functions/user-report-intake/index.ts");
const userReportRunbook = read("docs/USER_REPORT_ROUTER_RUNBOOK.md");

const failures = [];
const fail = (message) => failures.push(message);
const includes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
};
const notIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include: ${needle}`);
};

const requiredActiveSystems = [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
  "observability_runtime_operator",
  "installed_product_qa_operator",
  "platform_recovery_operator",
  "privacy_compliance_operator",
  "support_success_operator",
  "search_ranking_integrity_operator",
];

const foundationOnlySystems = [
  "ads_sponsor_delivery_operator",
];

const protectedAutonomousSystems = [
  ...requiredActiveSystems,
  ...foundationOnlySystems,
  "owner_command_operator",
];

const approvalRequesterSystems = [
  ...requiredActiveSystems,
  "owner_command_operator",
];

for (const required of [
  "proof:owner-command-operator",
  "proof:owner-command-routing",
  "proof:owner-command-approval-gates",
  "guard:owner-command-operator",
  "owner-command:classify",
  "owner-command:plan",
  "owner-command:dry-run",
  "owner-command:execute-approved",
  "proof:user-report-router",
  "proof:user-report-threshold-routing",
  "proof:user-report-safety-privacy",
  "guard:user-report-router",
  "guard:user-report-threshold-routing",
]) {
  includes(packageJson, `"${required}"`, "owner command package wiring");
}

for (const systemId of requiredActiveSystems) {
  includes(ownerCommandHelper, `"${systemId}"`, "owner command helper routing");
  includes(ownerCommandFunction, `"${systemId}"`, "owner command function routing");
}
for (const systemId of foundationOnlySystems) {
  includes(ownerCommandHelper, `"${systemId}"`, "owner command helper routing");
  includes(ownerCommandFunction, `"${systemId}"`, "owner command function routing");
}

for (const required of [
  "authorizeOwnerOrSuperAdmin",
  "OWNER_COMMAND_OPERATOR_TOKEN_SHA256",
  "x-owner-command-operator-token",
  "createApprovalRequestForCommand",
  "approval_request_required",
  "owner_approval_required",
  "external_confirmation_required",
  "preflight_passed_target_operator_execution_required",
  "direct_mutation_performed: false",
  "moneyMoved: false",
  "highRiskExecuted: false",
]) {
  includes(ownerCommandFunction, required, "owner command execution gates");
}

for (const table of [
  "owner_command_requests",
  "owner_command_events",
  "owner_command_execution_steps",
  "owner_command_blockers",
]) {
  includes(ownerCommandMigration, `public.${table}`, "owner command migration");
  includes(ownerCommandMigration, `revoke all on table public.${table} from anon, authenticated`, "owner command client write denial");
}

for (const required of [
  "Owner makes judgment",
  "no god mode",
  "routes through existing autonomous systems",
  "Level 4 still needs external confirmation",
  "Blocked commands return exact blockers",
]) {
  includes(ownerCommandRunbook, required, "owner command runbook");
}

notIncludes(ownerCommandFunction, "stripe.transfers.create", "owner command direct money movement");
notIncludes(ownerCommandFunction, "eas update", "owner command direct OTA publish");
notIncludes(ownerCommandFunction, "supabase.auth.admin", "owner command direct auth mutation");
notIncludes(ownerCommandFunction, "manual_premium_grant", "owner command manual Premium grant");
notIncludes(ownerCommandFunction, "delete_content", "owner command direct moderation enforcement");

const newlyScopedSystems = [
  {
    id: "notification_delivery_operator",
    proof: "proof:notification-delivery-operator",
    guard: "guard:notification-delivery-operator",
    functionPath: "supabase/functions/notification-operator/index.ts",
    adminTestId: "admin-notification-operator-section",
    servicePath: "ops/notification-operator/systemd/chillywood-notification-operator-watch-once.service",
    timerPath: "ops/notification-operator/systemd/chillywood-notification-operator-watch-once.timer",
    watchScriptPath: "ops/notification-operator/systemd/notification-operator-watch-once.sh",
    expectedActivation: 'activeActivationMode: "limited_scheduled_safe_recovery"',
    expectedSchedulerStatus: "chillywood-notification-operator-watch-once.timer_every_5_minutes",
    expectedCadence: "OnUnitActiveSec=5min",
    forbidden: ["bypass notification preferences", "marketing blast sends", "changing push provider credentials"],
    highRisk: "broad_notification_campaign_or_provider_config",
  },
  {
    id: "release_ota_operator",
    proof: "proof:release-ota-operator",
    guard: "guard:release-ota-operator",
    functionPath: "supabase/functions/release-operator/index.ts",
    adminTestId: "admin-release-operator-section",
    servicePath: "ops/release-operator/systemd/chillywood-release-operator-watch-once.service",
    timerPath: "ops/release-operator/systemd/chillywood-release-operator-watch-once.timer",
    watchScriptPath: "ops/release-operator/systemd/release-operator-watch-once.sh",
    expectedActivation: 'activeActivationMode: "limited_scheduled_probe"',
    expectedSchedulerStatus: "chillywood-release-operator-watch-once.timer_every_30_minutes",
    expectedCadence: "OnUnitActiveSec=30min",
    forbidden: ["auto-publish production OTA without approval", "auto-rollback production OTA without approval", "fake installed proof"],
    highRisk: "production_publish_or_rollback",
  },
  {
    id: "security_owner_operator",
    proof: "proof:security-owner-operator",
    guard: "guard:security-owner-operator",
    functionPath: "supabase/functions/security-owner-operator/index.ts",
    adminTestId: "admin-security-owner-operator-section",
    servicePath: "ops/security-owner-operator/systemd/chillywood-security-owner-operator-watch-once.service",
    timerPath: "ops/security-owner-operator/systemd/chillywood-security-owner-operator-watch-once.timer",
    watchScriptPath: "ops/security-owner-operator/systemd/security-owner-operator-watch-once.sh",
    expectedActivation: 'activeActivationMode: "limited_scheduled_probe"',
    expectedSchedulerStatus: "chillywood-security-owner-operator-watch-once.timer_every_15_minutes",
    expectedCadence: "OnUnitActiveSec=15min",
    forbidden: ["assign/revoke owner role autonomously", "mutate auth/RLS autonomously", "let Rachi/operator approve themselves"],
    highRisk: "owner_role_auth_rls_or_secret_rotation",
  },
  {
    id: "moderation_safety_operator",
    proof: "proof:moderation-safety-operator",
    guard: "guard:moderation-safety-operator",
    functionPath: "supabase/functions/moderation-safety-operator/index.ts",
    adminTestId: "admin-moderation-safety-operator-section",
    servicePath: "ops/moderation-safety-operator/systemd/chillywood-moderation-safety-operator-watch-once.service",
    timerPath: "ops/moderation-safety-operator/systemd/chillywood-moderation-safety-operator-watch-once.timer",
    watchScriptPath: "ops/moderation-safety-operator/systemd/moderation-safety-operator-watch-once.sh",
    expectedActivation: 'activeActivationMode: "limited_scheduled_probe"',
    expectedSchedulerStatus: "chillywood-moderation-safety-operator-watch-once.timer_every_10_minutes",
    expectedCadence: "OnUnitActiveSec=10min",
    forbidden: ["permanent ban/suspend/restrict without approval", "delete content without approval", "hidden enforcement with no appeal/review trail"],
    highRisk: "account_rights_content_delete_or_enforcement",
  },
  {
    id: "observability_runtime_operator",
    proof: "proof:observability-runtime-operator",
    guard: "guard:observability-runtime-operator",
    functionPath: "supabase/functions/observability-operator/index.ts",
    adminTestId: "admin-observability-operator-section",
    servicePath: "ops/observability-operator/systemd/chillywood-observability-operator-watch-once.service",
    timerPath: "ops/observability-operator/systemd/chillywood-observability-operator-watch-once.timer",
    watchScriptPath: "ops/observability-operator/systemd/observability-operator-watch-once.sh",
    expectedActivation: 'activeActivationMode: "limited_scheduled_probe"',
    expectedSchedulerStatus: "chillywood-observability-operator-watch-once.timer_every_10_minutes",
    expectedCadence: "OnUnitActiveSec=10min",
    forbidden: ["delete crash evidence", "silence crash reporting", "log secrets/tokens", "publish OTA", "rollback OTA"],
    highRisk: "production_release_rollback_or_publish",
  },
  {
    id: "platform_recovery_operator",
    proof: "proof:platform-recovery-operator",
    guard: "guard:platform-recovery-operator",
    functionPath: "supabase/functions/platform-recovery-operator/index.ts",
    adminTestId: "admin-platform-recovery-operator-section",
    servicePath: "ops/platform-recovery-operator/systemd/chillywood-platform-recovery-operator-watch-once.service",
    timerPath: "ops/platform-recovery-operator/systemd/chillywood-platform-recovery-operator-watch-once.timer",
    watchScriptPath: "ops/platform-recovery-operator/systemd/platform-recovery-operator-watch-once.sh",
    expectedActivation: 'activeActivationMode: "limited_scheduled_probe"',
    expectedSchedulerStatus: "chillywood-platform-recovery-operator-watch-once.timer_every_30_minutes",
    expectedCadence: "OnUnitActiveSec=30min",
    forbidden: ["production restore without approval", "destructive DB mutation", "secret rotation without approval", "fake backup/restore success"],
    highRisk: "platform_recovery_high_risk_fix_request",
  },
  {
    id: "privacy_compliance_operator",
    proof: "proof:privacy-compliance-operator",
    guard: "guard:privacy-compliance-operator",
    functionPath: "supabase/functions/privacy-compliance-operator/index.ts",
    adminTestId: "admin-privacy-compliance-operator-section",
    servicePath: "ops/privacy-compliance-operator/systemd/chillywood-privacy-compliance-operator-watch-once.service",
    timerPath: "ops/privacy-compliance-operator/systemd/chillywood-privacy-compliance-operator-watch-once.timer",
    watchScriptPath: "ops/privacy-compliance-operator/systemd/privacy-compliance-operator-watch-once.sh",
    expectedActivation: 'activeActivationMode: "limited_scheduled_probe"',
    expectedSchedulerStatus: "chillywood-privacy-compliance-operator-watch-once.timer_every_6_hours",
    expectedCadence: "OnUnitActiveSec=6h",
    forbidden: ["deleting account/data without approved flow", "bypassing legal hold", "hidden deletion", "fake compliance closure"],
    highRisk: "privacy_data_fulfillment_request",
  },
  {
    id: "support_success_operator",
    proof: "proof:support-success-operator",
    guard: "guard:support-success-operator",
    functionPath: "supabase/functions/support-success-operator/index.ts",
    adminTestId: "admin-support-success-operator-section",
    servicePath: "ops/support-success-operator/systemd/chillywood-support-success-operator-watch-once.service",
    timerPath: "ops/support-success-operator/systemd/chillywood-support-success-operator-watch-once.timer",
    watchScriptPath: "ops/support-success-operator/systemd/support-success-operator-watch-once.sh",
    expectedActivation: 'activeActivationMode: "limited_scheduled_probe"',
    expectedSchedulerStatus: "chillywood-support-success-operator-watch-once.timer_every_30_minutes",
    expectedCadence: "OnUnitActiveSec=30min",
    forbidden: ["issuing refunds", "granting Premium", "moving money", "sending legal/payment commitments"],
    highRisk: "support_money_or_auth_action_request",
  },
  {
    id: "search_ranking_integrity_operator",
    proof: "proof:search-ranking-integrity-operator",
    guard: "guard:search-ranking-integrity-operator",
    functionPath: "supabase/functions/search-ranking-integrity-operator/index.ts",
    adminTestId: "admin-search-ranking-integrity-operator-section",
    servicePath: "ops/search-ranking-integrity-operator/systemd/chillywood-search-ranking-integrity-operator-watch-once.service",
    timerPath: "ops/search-ranking-integrity-operator/systemd/chillywood-search-ranking-integrity-operator-watch-once.timer",
    watchScriptPath: "ops/search-ranking-integrity-operator/systemd/search-ranking-integrity-operator-watch-once.sh",
    expectedActivation: 'activeActivationMode: "limited_scheduled_probe"',
    expectedSchedulerStatus: "chillywood-search-ranking-integrity-operator-watch-once.timer_every_30_minutes",
    expectedCadence: "OnUnitActiveSec=30min",
    forbidden: ["hidden shadowban", "secret demotion/boost", "moderation enforcement", "changing ranking algorithm without approval"],
    highRisk: "search_ranking_algorithm_or_visibility_change",
  },
];

const manualScopedSystems = [
  {
    id: "installed_product_qa_operator",
    proof: "proof:installed-product-qa-operator",
    guard: "guard:installed-product-qa-operator",
    functionPath: "supabase/functions/installed-product-qa-operator/index.ts",
    tokenNeedle: "INSTALLED_QA_OPERATOR_TOKEN_SHA256",
    expectedActivation: 'activeActivationMode: "limited_scheduled_probe"',
    expectedSchedulerStatus: "chillywood-installed-qa-firebase-smoke.timer_daily_cost_capped",
    forbidden: ["fake installed proof", "manual Premium grant", "claiming two-device proof without proof", "silent pass on route mismatch", "grant Owner IAM", "grant Editor IAM", "grant project-wide Storage Admin"],
    highRisk: "installed_qa_high_risk_fix_request",
  },
];

const moneyScheduler = {
  servicePath: "ops/money-operator/systemd/chillywood-money-operator-watch-once.service",
  timerPath: "ops/money-operator/systemd/chillywood-money-operator-watch-once.timer",
  watchScriptPath: "ops/money-operator/systemd/money-operator-watch-once.sh",
};

for (const systemId of protectedAutonomousSystems) {
  includes(registry, `id: "${systemId}"`, "autonomous registry");
  includes(registryDoc, `\`${systemId}\``, "registry docs");
}
for (const systemId of approvalRequesterSystems) {
  includes(approvalFunction, systemId, "approval function system whitelist");
}
notIncludes(approvalFunction, "ads_sponsor_delivery_operator", "ads/sponsor foundation approval requester whitelist");

const ownerCommandBlockStart = registry.indexOf('id: "owner_command_operator"');
const ownerCommandBlockEnd = registry.indexOf("\n  },", ownerCommandBlockStart);
const ownerCommandBlock = ownerCommandBlockStart >= 0 && ownerCommandBlockEnd > ownerCommandBlockStart
  ? registry.slice(ownerCommandBlockStart, ownerCommandBlockEnd)
  : "";
includes(ownerCommandBlock, 'status: "scoped_command_router_guarded"', "owner_command_operator protected status");
includes(ownerCommandBlock, 'activeActivationMode: "manual_cli"', "owner_command_operator manual activation");
includes(ownerCommandBlock, "no_scheduler_no_daemon_no_worker_manual_or_owner_invoked_only", "owner_command_operator scheduler truth");
includes(ownerCommandBlock, "bypassing target autonomous operator", "owner_command_operator target routing gate");
includes(ownerCommandBlock, "direct target-table mutation outside routed operator", "owner_command_operator direct mutation ban");
includes(ownerCommandBlock, "real_world_or_external_impact_owner_command", "owner_command_operator Level 4 surface");
includes(ownerCommandBlock, "ownerApprovalRequired: true", "owner_command_operator high-risk approval");
includes(ownerCommandBlock, "Level 4 external confirmation where applicable", "owner_command_operator external confirmation gate");
includes(approvalModel, '"owner_command_operator"', "owner_command_operator requester model");
includes(ownerAuthority, "AUTONOMOUS_APPROVAL_REQUESTER_TYPES", "owner_command_operator authority requester model");
includes(approvalFunction, '"owner_command_operator"', "owner_command_operator approval function actor");

for (const system of newlyScopedSystems) {
  const blockStart = registry.indexOf(`id: "${system.id}"`);
  const blockEnd = registry.indexOf("\n  },", blockStart);
  const block = blockStart >= 0 && blockEnd > blockStart ? registry.slice(blockStart, blockEnd) : "";
  const service = read(system.servicePath);
  const timer = read(system.timerPath);
  const watchScript = read(system.watchScriptPath);
  includes(block, "scoped_write_capable_guarded", `${system.id} active status`);
  includes(block, system.expectedActivation, `${system.id} scheduled activation`);
  includes(block, system.expectedSchedulerStatus, `${system.id} scheduler status`);
  includes(block, "allowedWrites", `${system.id} write scope`);
  includes(block, "requiredProofScripts", `${system.id} proof registration`);
  includes(block, "requiredGuardScripts", `${system.id} guard registration`);
  includes(block, system.proof, `${system.id} proof script`);
  includes(block, system.guard, `${system.id} guard script`);
  includes(block, "rollbackBehavior", `${system.id} rollback`);
  includes(block, "killSwitchOrFallback", `${system.id} kill switch`);
  includes(block, "ownerApprovalRequired: true", `${system.id} high-risk approval`);
  includes(block, system.highRisk, `${system.id} high-risk surface`);
  for (const forbidden of system.forbidden) includes(block, forbidden, `${system.id} forbidden scope`);
  includes(packageJson, `"${system.proof}"`, `${system.id} package proof`);
  includes(packageJson, `"${system.guard}"`, `${system.id} package guard`);
  includes(admin, system.adminTestId, `${system.id} admin section`);
  includes(read(system.functionPath), "handleScopedOperatorRequest", `${system.id} edge function`);
  includes(service, "NoNewPrivileges=true", `${system.id} systemd hardening`);
  includes(service, "ProtectSystem=strict", `${system.id} systemd hardening`);
  includes(service, "PrivateTmp=true", `${system.id} systemd hardening`);
  includes(service, "RestrictSUIDSGID=true", `${system.id} systemd hardening`);
  includes(service, "CapabilityBoundingSet=", `${system.id} systemd hardening`);
  includes(timer, system.expectedCadence, `${system.id} timer cadence`);
  includes(timer, "WantedBy=timers.target", `${system.id} timer install`);
  includes(watchScript, '"action":"watch_once"', `${system.id} watch_once only`);
  includes(watchScript, '"scheduler":"systemd_timer"', `${system.id} scheduler identity`);
  includes(watchScript, `"operator_id":"${system.id}"`, `${system.id} operator identity`);
  includes(watchScript, "[redacted]", `${system.id} redacted logs`);
  notIncludes(service + "\n" + timer + "\n" + watchScript, "SERVICE_ROLE", `${system.id} timer artifacts`);
}

for (const system of manualScopedSystems) {
  const blockStart = registry.indexOf(`id: "${system.id}"`);
  const blockEnd = registry.indexOf("\n  },", blockStart);
  const block = blockStart >= 0 && blockEnd > blockStart ? registry.slice(blockStart, blockEnd) : "";
  includes(block, "scoped_write_capable_guarded", `${system.id} active status`);
  includes(block, system.expectedActivation, `${system.id} activation`);
  includes(block, system.expectedSchedulerStatus, `${system.id} scheduler status`);
  includes(block, "allowedWrites", `${system.id} write scope`);
  includes(block, system.proof, `${system.id} proof script`);
  includes(block, system.guard, `${system.id} guard script`);
  includes(block, "rollbackBehavior", `${system.id} rollback`);
  includes(block, "killSwitchOrFallback", `${system.id} kill switch`);
  includes(block, "ownerApprovalRequired: true", `${system.id} high-risk approval`);
  includes(block, system.highRisk, `${system.id} high-risk surface`);
  if (system.id === "installed_product_qa_operator") {
    includes(block, "firebase_test_lab_results_bucket_bootstrap", `${system.id} bounded bucket bootstrap surface`);
    includes(block, "approvalLevel: 2", `${system.id} bounded bootstrap stays Level 2`);
    includes(block, "ownerApprovalRequired: false", `${system.id} bounded bootstrap no per-action approval`);
    includes(block, "gs://chillywood-installed-qa-testlab-results", `${system.id} exact bucket`);
    includes(block, "enable or link Google Cloud billing", `${system.id} billing enablement forbidden`);
    const installedQaProofDocs = registryDoc + operatingModel + currentState + nextTask;
    includes(installedQaProofDocs, "ff81956d-94e3-49e9-8c80-fae2c12b0dd8", `${system.id} timer proof row`);
    includes(installedQaProofDocs, "1dc00369-b5ca-4289-92bc-daf5bae00222", `${system.id} timeout proof row`);
    includes(installedQaProofDocs, "282fb154-101c-402b-9539-d3fb8080de51", `${system.id} duplicate-safe pending proof row`);
    includes(installedQaProofDocs, "POLL_HTTP_FAILED", `${system.id} tracked pending matrix state`);
    includes(installedQaProofDocs, "daily timer is enabled", `${system.id} active timer proof`);
  }
  for (const forbidden of system.forbidden) includes(block, forbidden, `${system.id} forbidden scope`);
  includes(packageJson, `"${system.proof}"`, `${system.id} package proof`);
  includes(packageJson, `"${system.guard}"`, `${system.id} package guard`);
  includes(read(system.functionPath), system.tokenNeedle, `${system.id} token gate`);
  includes(read(system.functionPath), "watch_once", `${system.id} watch_once`);
  if (system.id !== "installed_product_qa_operator" && /chillywood-installed.*timer|systemd_timer/.test(block)) {
    fail(`${system.id} claims scheduler/timer before device lab proof`);
  }
}

const adsBlockStart = registry.indexOf('id: "ads_sponsor_delivery_operator"');
const adsBlockEnd = registry.indexOf("\n  },", adsBlockStart);
const adsBlock = adsBlockStart >= 0 && adsBlockEnd > adsBlockStart ? registry.slice(adsBlockStart, adsBlockEnd) : "";
includes(adsBlock, 'status: "foundation_only_guarded"', "ads/sponsor foundation status");
includes(adsBlock, 'activeActivationMode: "off"', "ads/sponsor activation");
includes(adsBlock, "no_scheduler_foundation_only", "ads/sponsor scheduler");
includes(adsBlock, "no Edge Function required", "ads/sponsor no Edge Function");
includes(adsBlock, "no live write tables", "ads/sponsor no live write tables");
includes(packageJson, '"proof:ads-sponsor-delivery-foundation"', "ads/sponsor foundation proof script");
includes(packageJson, '"guard:ads-sponsor-delivery-foundation"', "ads/sponsor foundation guard script");
if (existsSync(path.join(root, "supabase/functions/ads-sponsor-delivery-operator/index.ts"))) fail("ads/sponsor foundation has a live Edge Function");
notIncludes(packageJson, "ads-sponsor-delivery-operator:watch-once", "ads/sponsor foundation package watch script");

const moneyBlockStart = registry.indexOf('id: "money_flow_control"');
const moneyBlockEnd = registry.indexOf("\n  },", moneyBlockStart);
const moneyBlock = moneyBlockStart >= 0 && moneyBlockEnd > moneyBlockStart ? registry.slice(moneyBlockStart, moneyBlockEnd) : "";
const moneyService = read(moneyScheduler.servicePath);
const moneyTimer = read(moneyScheduler.timerPath);
const moneyWatchScript = read(moneyScheduler.watchScriptPath);
const moneyOperatorFunction = read("supabase/functions/money-operator/index.ts");
includes(moneyBlock, 'activeActivationMode: "limited_scheduled_probe"', "money_flow_control scheduled activation");
includes(moneyBlock, "chillywood-money-operator-watch-once.timer_every_10_minutes", "money_flow_control scheduler status");
includes(packageJson, '"proof:money-operator-scheduler"', "money scheduler package proof");
includes(packageJson, '"guard:money-operator-scheduler"', "money scheduler package guard");
includes(moneyService, "NoNewPrivileges=true", "money systemd hardening");
includes(moneyService, "ProtectSystem=strict", "money systemd hardening");
includes(moneyService, "PrivateTmp=true", "money systemd hardening");
includes(moneyService, "RestrictSUIDSGID=true", "money systemd hardening");
includes(moneyService, "CapabilityBoundingSet=", "money systemd hardening");
includes(moneyTimer, "OnUnitActiveSec=10min", "money timer cadence");
includes(moneyTimer, "WantedBy=timers.target", "money timer install");
includes(moneyWatchScript, '"action":"watch_once"', "money watch_once only");
includes(moneyWatchScript, '"scheduler":"systemd_timer"', "money scheduler identity");
includes(moneyWatchScript, '"operator_id":"money_flow_control"', "money operator identity");
includes(moneyWatchScript, "[redacted]", "money redacted logs");
includes(moneyOperatorFunction, "const scheduler = safeLabel(payload.scheduler", "money watch_once audit scheduler");
includes(moneyOperatorFunction, "operator_id: operatorId", "money watch_once audit operator");
includes(moneyOperatorFunction, "high_risk_executed: false", "money watch_once high-risk audit");
notIncludes(moneyService + "\n" + moneyTimer + "\n" + moneyWatchScript, "SERVICE_ROLE", "money timer artifacts");
if (/checkout|payment_link|transfer|payout|cashout|invoice|manual_premium_grant|mark_paid/i.test(moneyWatchScript)) fail("money timer script contains forbidden money-movement command");

notIncludes(registry, 'id: "notification_delivery_operator",\n    displayName: "Notification Delivery Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "release_ota_operator",\n    displayName: "Release / OTA Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "security_owner_operator",\n    displayName: "Security / Owner Authority Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "moderation_safety_operator",\n    displayName: "Moderation / Safety Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "observability_runtime_operator",\n    displayName: "Observability / Runtime Health Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "installed_product_qa_operator",\n    displayName: "Installed Product QA Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "platform_recovery_operator",\n    displayName: "Platform Recovery Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "privacy_compliance_operator",\n    displayName: "Privacy Compliance Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "support_success_operator",\n    displayName: "Support Success Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "search_ranking_integrity_operator",\n    displayName: "Search / Ranking Integrity Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registryDoc, "candidate_foundation_only", "registry docs");

for (const required of [
  "private/Premium/original public exposure",
  "unscanned/moderation-blocked processing",
  "broad uncapped backfill",
  "backup/restore",
  "rollback/quarantine",
  "fake heartbeat",
  "stale cutoff loosening",
  "broad DB mutation",
  "marking unhealthy server active without host proof",
  "manual Premium grant",
  "real money movement without Level 4",
  "fake creator earnings",
  "fake payable balance",
  "provider_access_broker",
  "provider_webhook_reliability_loop",
  "fake installed proof",
  "claiming two-device proof without proof",
]) {
  includes(registry, required, "existing active system protection");
}

for (const required of [
  "approvalLevel:",
  "allowedReadScope",
  "allowedWriteScope",
  "forbiddenScope",
  "proofScript",
  "guardScript",
  "rollbackBehavior",
  "killSwitchOrFallback",
  "ownerApprovalRequired",
]) {
  includes(registry, required, "expansion rule fields");
}

for (const script of [
  "proof:autonomous-systems-contract",
  "guard:autonomous-systems-contract",
  "proof:autonomous-approval-live-flow",
  "proof:money-flow-control",
  "guard:money-flow-control",
  "proof:livekit-autonomous-operator",
  "proof:media-automation-cli",
  "proof:platform-recovery-operator",
  "guard:platform-recovery-operator",
  "proof:privacy-compliance-operator",
  "guard:privacy-compliance-operator",
  "proof:support-success-operator",
  "guard:support-success-operator",
  "proof:search-ranking-integrity-operator",
  "guard:search-ranking-integrity-operator",
  "proof:ads-sponsor-delivery-foundation",
  "guard:ads-sponsor-delivery-foundation",
]) {
  includes(packageJson, `"${script}"`, "package script wiring");
}

for (const table of [
  "notification_operator_events",
  "release_operator_events",
  "security_operator_events",
  "moderation_operator_events",
]) {
  includes(migration, `public.${table}`, "scoped operator migration");
}
for (const table of [
  "observability_operator_events",
  "runtime_health_snapshots",
  "crash_cluster_findings",
  "js_error_findings",
  "performance_regression_findings",
]) {
  includes(observabilityMigration, `public.${table}`, "observability operator migration");
}
includes(migration, "enable row level security", "scoped operator migration");
includes(migration, "from anon, authenticated", "scoped operator client write denial");
includes(migration, "check (user_rights_changed = false)", "scoped operator user-rights constraint");
includes(migration, "check (money_moved = false)", "scoped operator money constraint");
includes(observabilityMigration, "enable row level security", "observability operator migration");
includes(observabilityMigration, "from anon, authenticated", "observability operator client write denial");
includes(observabilityMigration, "pii_stored = false", "observability PII constraint");
includes(observabilityMigration, "secrets_logged = false", "observability secret constraint");
includes(sharedFn, "constantTimeEqual", "operator token gate");
includes(sharedFn, "sanitizeOperatorMetadata", "operator redaction");

for (const table of [
  "user_report_intake_events",
  "user_report_classifications",
  "user_report_clusters",
  "user_report_cluster_members",
  "user_report_routing_actions",
  "user_report_operator_findings",
]) {
  includes(userReportMigration, `public.${table}`, "user report router migration");
  includes(userReportMigration, `alter table public.${table} enable row level security`, "user report router RLS");
  includes(userReportMigration, `revoke all on table public.${table} from anon, authenticated`, "user report client write denial");
}
includes(userReportMigration, "user_report_cluster_members_unique_reporter", "user report unique reporter threshold");
includes(userReportFunction, "authenticated_user_required", "user report auth requirement");
includes(userReportFunction, "client_requested_routed_system_id_ignored", "user report client routing ignored");
includes(userReportFunction, "owner_command_requests", "user report owner command routing");
includes(userReportFunction, "autonomous_approval_requests", "user report approval path");
includes(userReportFunction, "moneyMoved: false", "user report no money response");
includes(userReportFunction, "userRightsChanged: false", "user report no rights response");
includes(userReportFunction, "highRiskExecuted: false", "user report no high-risk response");
includes(userReportRunbook, "User reports can never directly", "user report no direct execution doc");

includes(approvalModel, "operatorSelfApprovalAllowed: false", "approval self-approval model");
includes(ownerAuthority, "canUserApproveAutonomousRequest", "owner authority helper");
includes(approvalFunction, "owner_or_super_admin_required", "approval function owner gate");
includes(approvalFunction, "mark_preflight_result", "approval fresh preflight");
includes(approvalFunction, "emergency_pause_system", "approval emergency controls");
for (const systemId of approvalRequesterSystems) includes(approvalFunction, `"${systemId}"`, "approval requester system");
notIncludes(approvalFunction, "rachi_can_approve", "approval function");

notIncludes(currentState + nextTask, "dashboard valid TEST proof remains pending", "RevenueCat closure state");
includes(currentState + nextTask, "RevenueCat provider readback is closed", "RevenueCat reconciled state");
includes(currentState + nextTask, "dashboard TEST returned HTTP `200` / `test_received`", "RevenueCat dashboard TEST closure");
includes(currentState + nextTask, "premiumGranted=false", "RevenueCat no Premium grant");
includes(currentState + nextTask, "liveMoneyAction=false", "RevenueCat no live money action");
includes(currentState + nextTask, "moneyMoved=false", "RevenueCat no money moved");

if (existsSync("app/admin-command-center.tsx")) fail("duplicate admin route exists");
if (/production_ota_publish[\s\S]{0,400}approvalLevel:\s*[0123]/.test(registry)) fail("production OTA publish downgraded below Level 4");
if (/owner_role_auth_rls_or_secret_rotation[\s\S]{0,400}approvalLevel:\s*[0123]/.test(registry)) fail("owner/auth/RLS mutation downgraded below Level 4");
if (/account_rights_content_delete_or_enforcement[\s\S]{0,400}approvalLevel:\s*[012]/.test(registry)) fail("moderation enforcement downgraded below Level 3");
if (/broad_notification_campaign_or_provider_config[\s\S]{0,400}approvalLevel:\s*[012]/.test(registry)) fail("notification broad send/provider config downgraded below Level 3");
if (/remote_config_or_feature_flag_mutation[\s\S]{0,400}approvalLevel:\s*[012]/.test(registry)) fail("observability feature flag mutation downgraded below Level 3");
if (/REVENUECAT_SECRET_API_KEY|SERVICE_ROLE_KEY|MONEY_OPERATOR_TOKEN(?!_SHA256)|NOTIFICATION_OPERATOR_TOKEN(?!_SHA256)|RELEASE_OPERATOR_TOKEN(?!_SHA256)|SECURITY_OWNER_OPERATOR_TOKEN(?!_SHA256)|MODERATION_SAFETY_OPERATOR_TOKEN(?!_SHA256)|OBSERVABILITY_OPERATOR_TOKEN(?!_SHA256)/.test(admin + registryDoc + operatingModel)) {
  fail("secret name/value leaked into client-facing docs or admin copy");
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  activeSystems: requiredActiveSystems,
  protectedSystems: protectedAutonomousSystems,
  foundationOnlySystems,
  scopedWriteSystemsAdded: [...newlyScopedSystems.map((system) => system.id), ...manualScopedSystems.map((system) => system.id)],
  scheduledMoneyLoop: "chillywood-money-operator-watch-once.timer_every_10_minutes",
  candidatePlaceholdersRemaining: 0,
}, null, 2));
