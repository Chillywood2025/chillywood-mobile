#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const systems = {
  notification: {
    id: "notification_delivery_operator",
    adminTestId: "admin-notification-operator-section",
    functionPath: "supabase/functions/notification-operator/index.ts",
    servicePath: "ops/notification-operator/systemd/chillywood-notification-operator-watch-once.service",
    timerPath: "ops/notification-operator/systemd/chillywood-notification-operator-watch-once.timer",
    watchScriptPath: "ops/notification-operator/systemd/notification-operator-watch-once.sh",
    guardScript: "guard:notification-delivery-operator",
    expectedActivation: "limited_scheduled_safe_recovery",
    expectedSchedulerStatus: "chillywood-notification-operator-watch-once.timer_every_5_minutes",
    expectedCadence: "OnUnitActiveSec=5min",
    highRisk: ["push_blast_or_campaign_send", "provider_push_config_change", "marketing blast"],
    forbiddenAutonomous: ["preference bypass", "push provider credentials", "broad user messaging"],
  },
  release: {
    id: "release_ota_operator",
    adminTestId: "admin-release-operator-section",
    functionPath: "supabase/functions/release-operator/index.ts",
    servicePath: "ops/release-operator/systemd/chillywood-release-operator-watch-once.service",
    timerPath: "ops/release-operator/systemd/chillywood-release-operator-watch-once.timer",
    watchScriptPath: "ops/release-operator/systemd/release-operator-watch-once.sh",
    guardScript: "guard:release-ota-operator",
    expectedActivation: "limited_scheduled_probe",
    expectedSchedulerStatus: "chillywood-release-operator-watch-once.timer_every_30_minutes",
    expectedCadence: "OnUnitActiveSec=30min",
    highRisk: ["production_ota_publish", "production_ota_rollback", "store_release_submission"],
    forbiddenAutonomous: ["auto-publish", "auto-rollback", "fake installed proof"],
  },
  security: {
    id: "security_owner_operator",
    adminTestId: "admin-security-owner-operator-section",
    functionPath: "supabase/functions/security-owner-operator/index.ts",
    servicePath: "ops/security-owner-operator/systemd/chillywood-security-owner-operator-watch-once.service",
    timerPath: "ops/security-owner-operator/systemd/chillywood-security-owner-operator-watch-once.timer",
    watchScriptPath: "ops/security-owner-operator/systemd/security-owner-operator-watch-once.sh",
    guardScript: "guard:security-owner-operator",
    expectedActivation: "limited_scheduled_probe",
    expectedSchedulerStatus: "chillywood-security-owner-operator-watch-once.timer_every_15_minutes",
    expectedCadence: "OnUnitActiveSec=15min",
    highRisk: ["owner_role_mutation", "auth_rls_policy_mutation", "secret_rotation"],
    forbiddenAutonomous: ["assign/revoke owner role autonomously", "mutate auth/RLS autonomously", "Rachi/operator approve themselves"],
  },
  moderation: {
    id: "moderation_safety_operator",
    adminTestId: "admin-moderation-safety-operator-section",
    functionPath: "supabase/functions/moderation-safety-operator/index.ts",
    servicePath: "ops/moderation-safety-operator/systemd/chillywood-moderation-safety-operator-watch-once.service",
    timerPath: "ops/moderation-safety-operator/systemd/chillywood-moderation-safety-operator-watch-once.timer",
    watchScriptPath: "ops/moderation-safety-operator/systemd/moderation-safety-operator-watch-once.sh",
    guardScript: "guard:moderation-safety-operator",
    expectedActivation: "limited_scheduled_probe",
    expectedSchedulerStatus: "chillywood-moderation-safety-operator-watch-once.timer_every_10_minutes",
    expectedCadence: "OnUnitActiveSec=10min",
    highRisk: ["ban_suspend_restrict_or_delete_content", "fraud_hold_enforcement", "disable_uploads_live_or_account"],
    forbiddenAutonomous: ["permanent ban", "delete content", "hidden enforcement"],
  },
};

const key = process.argv[2];
const system = systems[key];
if (!system) {
  console.error(`Unknown scoped operator guard key: ${key}`);
  process.exit(1);
}

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const migration = read("supabase/migrations/20260712145220_autonomous_scoped_write_operators.sql");
const fn = read(system.functionPath);
const sharedFn = read("supabase/functions/_shared/scoped-operator.ts");
const service = read(system.servicePath);
const timer = read(system.timerPath);
const watchScript = read(system.watchScriptPath);
const admin = read("app/admin.tsx");
const docs = [
  "docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md",
  "docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md",
].map(read).join("\n");
const pkg = JSON.parse(read("package.json"));

const systemBlock = registry.slice(registry.indexOf(`id: "${system.id}"`), registry.indexOf("},", registry.indexOf(`id: "${system.id}"`)) + 2);
const failures = [];

if (!systemBlock.includes("scoped_write_capable_guarded")) failures.push("system_not_scoped_write_capable");
if (!systemBlock.includes(`activeActivationMode: "${system.expectedActivation}"`)) failures.push("scheduled_activation_missing");
if (!systemBlock.includes(system.expectedSchedulerStatus)) failures.push("scheduler_status_missing_or_wrong");
if (!pkg.scripts?.[system.guardScript]) failures.push("package_guard_script_missing");
if (!fn.includes("handleScopedOperatorRequest") || !sharedFn.includes("constantTimeEqual")) failures.push("constant_time_token_gate_missing");
if (key === "security" && (!fn.includes("runCognitiveNetAclGuard") || !fn.includes("lifecycleManaged: true") || !sharedFn.includes("if (platformResult.lifecycleManaged === true) continue"))) failures.push("cognitive_net_acl_lifecycle_not_sql_managed");
if (!sharedFn.includes("sanitizeOperatorMetadata")) failures.push("metadata_redaction_missing");
if (!sharedFn.includes("withAuditIdentity") || !sharedFn.includes("auditIdentity") || !sharedFn.includes("report_read")) failures.push("audit_identity_or_readonly_report_missing");
if (!migration.includes("enable row level security")) failures.push("rls_missing");
if (!migration.includes("from anon, authenticated")) failures.push("client_write_denial_missing");
if (!migration.includes("check (user_rights_changed = false)")) failures.push("user_rights_change_constraint_missing");
if (!migration.includes("check (money_moved = false)")) failures.push("money_moved_constraint_missing");
if (fs.existsSync("app/admin-command-center.tsx")) failures.push("duplicate_admin_route_created");
if (!admin.includes(system.adminTestId)) failures.push("admin_status_section_missing");
if (!fs.existsSync(system.servicePath) || !fs.existsSync(system.timerPath) || !fs.existsSync(system.watchScriptPath)) failures.push("scheduler_artifacts_missing");
if (!service.includes("EnvironmentFile=/etc/chillywood/") || !service.includes("ExecStart=/opt/chillywood/") || !service.includes("-watch-once.sh")) failures.push("systemd_service_not_scoped_to_watch_once_script");
if (/(SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|--service-role)/i.test(service + "\n" + timer + "\n" + watchScript)) failures.push("systemd_uses_service_role_key");
for (const hardening of ["NoNewPrivileges=true", "ProtectSystem=strict", "PrivateTmp=true", "RestrictSUIDSGID=true", "LockPersonality=true", "CapabilityBoundingSet="]) {
  if (!service.includes(hardening)) failures.push(`systemd_hardening_missing:${hardening}`);
}
if (!timer.includes(system.expectedCadence) || !timer.includes("RandomizedDelaySec=") || !timer.includes("WantedBy=timers.target")) failures.push("timer_cadence_or_install_missing");
if (!watchScript.includes('"action":"watch_once"') || !watchScript.includes('"scheduler":"systemd_timer"') || !watchScript.includes(`"operator_id":"${system.id}"`)) failures.push("watch_once_scheduler_identity_missing");
if (watchScript.includes("create_approval_request") || watchScript.includes("production_ota_publish") || watchScript.includes("ban_suspend_restrict_or_delete_content")) failures.push("watch_script_can_execute_high_risk_action");
if (!watchScript.includes("sed -E") || !watchScript.includes("[redacted]")) failures.push("watch_script_output_redaction_missing");

for (const action of system.highRisk) {
  if (!registry.includes(action) && !fn.includes(action)) failures.push(`high_risk_action_not_registered:${action}`);
}

for (const forbidden of system.forbiddenAutonomous) {
  if (!registry.toLowerCase().includes(forbidden.toLowerCase()) && !docs.toLowerCase().includes(forbidden.toLowerCase())) {
    failures.push(`forbidden_scope_not_documented:${forbidden}`);
  }
}

const levelDowngradePatterns = [
  /production_ota_publish[\s\S]{0,300}approvalLevel:\s*[012]/,
  /production_ota_rollback[\s\S]{0,300}approvalLevel:\s*[012]/,
  /owner_role_mutation[\s\S]{0,300}approvalLevel:\s*[0123]/,
  /auth_rls_policy_mutation[\s\S]{0,300}approvalLevel:\s*[0123]/,
  /ban_suspend_restrict_or_delete_content[\s\S]{0,300}approvalLevel:\s*[012]/,
  /push_blast_or_campaign_send[\s\S]{0,300}approvalLevel:\s*[012]/,
];
if (levelDowngradePatterns.some((pattern) => pattern.test(registry + "\n" + read(`_lib/${{
  notification: "notificationDeliveryOperator",
  release: "releaseOtaOperator",
  security: "securityOwnerOperator",
  moderation: "moderationSafetyOperator",
}[key]}.ts`)))) {
  failures.push("high_risk_action_downgraded");
}

if (/(console\.log\([^)]*(token|secret|password|credential)|REVENUECAT_SECRET_API_KEY|SERVICE_ROLE_KEY)/i.test(fn + "\n" + admin)) {
  failures.push("secret_logging_or_client_secret_reference");
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, system: system.id, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  system: system.id,
  guard: "scoped_write_boundaries_enforced",
  schedulerActive: true,
  highRiskRequiresApproval: true,
}, null, 2));
