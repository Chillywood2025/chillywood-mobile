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
]) {
  includes(packageJson, `"${required}"`, "owner command package wiring");
}

for (const systemId of requiredActiveSystems) {
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
];

const moneyScheduler = {
  servicePath: "ops/money-operator/systemd/chillywood-money-operator-watch-once.service",
  timerPath: "ops/money-operator/systemd/chillywood-money-operator-watch-once.timer",
  watchScriptPath: "ops/money-operator/systemd/money-operator-watch-once.sh",
};

for (const systemId of requiredActiveSystems) {
  includes(registry, `id: "${systemId}"`, "autonomous registry");
  includes(registryDoc, `\`${systemId}\``, "registry docs");
  includes(approvalFunction, systemId, "approval function system whitelist");
}

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
notIncludes(registryDoc, "candidate_foundation_only", "registry docs");
notIncludes(registryDoc, "Allowed writes: none", "registry docs");

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

includes(approvalModel, "operatorSelfApprovalAllowed: false", "approval self-approval model");
includes(ownerAuthority, "canUserApproveAutonomousRequest", "owner authority helper");
includes(approvalFunction, "owner_or_super_admin_required", "approval function owner gate");
includes(approvalFunction, "mark_preflight_result", "approval fresh preflight");
includes(approvalFunction, "emergency_pause_system", "approval emergency controls");
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
  scopedWriteSystemsAdded: newlyScopedSystems.map((system) => system.id),
  scheduledMoneyLoop: "chillywood-money-operator-watch-once.timer_every_10_minutes",
  candidatePlaceholdersRemaining: 0,
}, null, 2));
