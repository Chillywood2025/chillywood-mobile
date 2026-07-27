#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const systems = {
  notification: {
    id: "notification_delivery_operator",
    functionPath: "supabase/functions/notification-operator/index.ts",
    helperPath: "_lib/notificationDeliveryOperator.ts",
    servicePath: "ops/notification-operator/systemd/chillywood-notification-operator-watch-once.service",
    timerPath: "ops/notification-operator/systemd/chillywood-notification-operator-watch-once.timer",
    watchScriptPath: "ops/notification-operator/systemd/notification-operator-watch-once.sh",
    proofScript: "proof:notification-delivery-operator",
    guardScript: "guard:notification-delivery-operator",
    tokenHashEnv: "NOTIFICATION_OPERATOR_TOKEN_SHA256",
    adminTestId: "admin-notification-operator-section",
    expectedActivation: "limited_scheduled_safe_recovery",
    expectedSchedulerStatus: "chillywood-notification-operator-watch-once.timer_every_5_minutes",
    expectedCadence: "OnUnitActiveSec=5min",
    requiredTables: ["notification_operator_events", "notification_delivery_health_snapshots", "notification_provider_sync_status", "notification_required_review_flags", "notification_duplicate_dedupe_records", "notification_operator_learning_state"],
    safeAction: "mark_token_provider_revoked",
    highRiskAction: "push_blast_or_campaign_send",
    requiredCopy: ["preference", "DeviceNotRegistered", "marketing blast"],
  },
  release: {
    id: "release_ota_operator",
    functionPath: "supabase/functions/release-operator/index.ts",
    helperPath: "_lib/releaseOtaOperator.ts",
    servicePath: "ops/release-operator/systemd/chillywood-release-operator-watch-once.service",
    timerPath: "ops/release-operator/systemd/chillywood-release-operator-watch-once.timer",
    watchScriptPath: "ops/release-operator/systemd/release-operator-watch-once.sh",
    proofScript: "proof:release-ota-operator",
    guardScript: "guard:release-ota-operator",
    tokenHashEnv: "RELEASE_OPERATOR_TOKEN_SHA256",
    adminTestId: "admin-release-operator-section",
    expectedActivation: "limited_scheduled_probe",
    expectedSchedulerStatus: "chillywood-release-operator-watch-once.timer_every_30_minutes",
    expectedCadence: "OnUnitActiveSec=30min",
    requiredTables: ["release_operator_events", "release_health_snapshots", "ota_diagnostics_readback_records", "rollout_anomaly_findings", "release_required_review_flags", "rollback_readiness_records", "release_operator_learning_state"],
    safeAction: "emergency_launch_report",
    highRiskAction: "production_ota_publish",
    requiredCopy: ["updateId", "emergency launch", "production OTA"],
  },
  security: {
    id: "security_owner_operator",
    functionPath: "supabase/functions/security-owner-operator/index.ts",
    helperPath: "_lib/securityOwnerOperator.ts",
    servicePath: "ops/security-owner-operator/systemd/chillywood-security-owner-operator-watch-once.service",
    timerPath: "ops/security-owner-operator/systemd/chillywood-security-owner-operator-watch-once.timer",
    watchScriptPath: "ops/security-owner-operator/systemd/security-owner-operator-watch-once.sh",
    proofScript: "proof:security-owner-operator",
    guardScript: "guard:security-owner-operator",
    tokenHashEnv: "SECURITY_OWNER_OPERATOR_TOKEN_SHA256",
    adminTestId: "admin-security-owner-operator-section",
    expectedActivation: "limited_scheduled_probe",
    expectedSchedulerStatus: "chillywood-security-owner-operator-watch-once.timer_every_15_minutes",
    expectedCadence: "OnUnitActiveSec=15min",
    requiredTables: ["security_operator_events", "security_health_snapshots", "security_required_review_flags", "owner_authority_integrity_findings", "approval_integrity_findings", "secret_scan_findings", "security_operator_learning_state"],
    safeAction: "owner_role_integrity_check",
    highRiskAction: "owner_role_mutation",
    requiredCopy: ["Rachi", "operator self-approval", "owner role"],
  },
  moderation: {
    id: "moderation_safety_operator",
    functionPath: "supabase/functions/moderation-safety-operator/index.ts",
    helperPath: "_lib/moderationSafetyOperator.ts",
    servicePath: "ops/moderation-safety-operator/systemd/chillywood-moderation-safety-operator-watch-once.service",
    timerPath: "ops/moderation-safety-operator/systemd/chillywood-moderation-safety-operator-watch-once.timer",
    watchScriptPath: "ops/moderation-safety-operator/systemd/moderation-safety-operator-watch-once.sh",
    proofScript: "proof:moderation-safety-operator",
    guardScript: "guard:moderation-safety-operator",
    tokenHashEnv: "MODERATION_SAFETY_OPERATOR_TOKEN_SHA256",
    adminTestId: "admin-moderation-safety-operator-section",
    expectedActivation: "limited_scheduled_probe",
    expectedSchedulerStatus: "chillywood-moderation-safety-operator-watch-once.timer_every_10_minutes",
    expectedCadence: "OnUnitActiveSec=10min",
    requiredTables: ["moderation_operator_events", "moderation_health_snapshots", "moderation_required_review_flags", "moderation_duplicate_report_detections", "moderation_case_priority_flags", "moderation_stale_case_findings", "safety_review_recommendations", "moderation_operator_learning_state"],
    safeAction: "stale_case_scan",
    highRiskAction: "ban_suspend_restrict_or_delete_content",
    requiredCopy: ["stale case", "duplicate report", "ban"],
  },
};

const key = process.argv[2];
const system = systems[key];
if (!system) {
  console.error(`Unknown scoped operator proof key: ${key}`);
  process.exit(1);
}

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const migration = read("supabase/migrations/20260712145220_autonomous_scoped_write_operators.sql");
const helper = read(system.helperPath);
const fn = read(system.functionPath);
const sharedFn = read("supabase/functions/_shared/scoped-operator.ts");
const service = read(system.servicePath);
const timer = read(system.timerPath);
const watchScript = read(system.watchScriptPath);
const admin = read("app/admin.tsx");
const pkg = JSON.parse(read("package.json"));

const checks = [
  ["registered active system", registry.includes(`id: "${system.id}"`) && registry.includes("scoped_write_capable_guarded")],
  ["not candidate placeholder", !registry.match(new RegExp(`AUTONOMOUS_CANDIDATE_SYSTEMS_REGISTRY[\\s\\S]*${system.id}`))],
  ["scheduled activation mode", registry.includes(`activeActivationMode: "${system.expectedActivation}"`)],
  ["scheduled status registered", registry.includes(system.expectedSchedulerStatus)],
  ["proof script registered", registry.includes(system.proofScript) && pkg.scripts?.[system.proofScript]],
  ["guard script registered", registry.includes(system.guardScript) && pkg.scripts?.[system.guardScript]],
  ["helper classifies approval level", helper.includes("ApprovalLevel") && helper.includes(system.highRiskAction)],
  ["helper builds approval request", helper.includes("buildScopedOperatorApprovalRequest")],
  ["helper forbids unsafe mutation", helper.includes("assertNoForbidden")],
  ["edge function token hash", fn.includes(system.tokenHashEnv)],
  ["edge function action surface", fn.includes(system.safeAction) && fn.includes(system.highRiskAction)],
  ["security ACL lifecycle is SQL-managed", key !== "security" || (fn.includes("runCognitiveNetAclGuard") && fn.includes("lifecycleManaged: true") && sharedFn.includes("if (platformResult.lifecycleManaged === true) continue"))],
  ["report action read-only", sharedFn.includes('if (action === "report")') && sharedFn.includes("report_read")],
  ["watch_once audit identity", sharedFn.includes("withAuditIdentity") && sharedFn.includes("auditIdentity") && watchScript.includes('"scheduler":"systemd_timer"') && watchScript.includes(`"operator_id":"${system.id}"`)],
  ["systemd service exists", fs.existsSync(system.servicePath)],
  ["systemd timer exists", fs.existsSync(system.timerPath)],
  ["watch script exists", fs.existsSync(system.watchScriptPath)],
  ["systemd service runs only watch_once script", service.includes(`ExecStart=/opt/chillywood/`) && service.includes("-watch-once.sh") && !service.includes("SERVICE_ROLE")],
  ["systemd hardening", ["NoNewPrivileges=true", "ProtectSystem=strict", "PrivateTmp=true", "RestrictSUIDSGID=true", "LockPersonality=true", "CapabilityBoundingSet="].every((needle) => service.includes(needle))],
  ["timer cadence", timer.includes(system.expectedCadence) && timer.includes("RandomizedDelaySec=") && timer.includes("WantedBy=timers.target")],
  ["script watch_once only", watchScript.includes('"action":"watch_once"') && !watchScript.includes("SERVICE_ROLE") && !watchScript.includes("create_approval_request")],
  ["script redacts output", watchScript.includes("sed -E") && watchScript.includes("[redacted]")],
  ["admin status section", admin.includes(system.adminTestId)],
  ["no duplicate admin route", !fs.existsSync("app/admin-command-center.tsx")],
  ["rls enabled", migration.includes("enable row level security")],
  ["clients denied", migration.includes("from anon, authenticated")],
  ["no rights or money moved", migration.includes("user_rights_changed boolean not null default false check (user_rights_changed = false)") && migration.includes("money_moved boolean not null default false check (money_moved = false)")],
  ...system.requiredTables.map((table) => [`table ${table}`, migration.includes(`public.${table}`) || migration.includes(table)]),
  ...system.requiredCopy.map((copy) => [`required policy copy ${copy}`, registry.toLowerCase().includes(copy.toLowerCase()) || helper.toLowerCase().includes(copy.toLowerCase())]),
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error(JSON.stringify({ ok: false, system: system.id, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  system: system.id,
  status: "scoped_write_capable_guarded",
  safeAction: system.safeAction,
  highRiskAction: system.highRiskAction,
  moneyMoved: false,
  userRightsChangedBySafeWrites: false,
}, null, 2));
