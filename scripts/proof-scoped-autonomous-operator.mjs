#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const systems = {
  notification: {
    id: "notification_delivery_operator",
    functionPath: "supabase/functions/notification-operator/index.ts",
    helperPath: "_lib/notificationDeliveryOperator.ts",
    proofScript: "proof:notification-delivery-operator",
    guardScript: "guard:notification-delivery-operator",
    tokenHashEnv: "NOTIFICATION_OPERATOR_TOKEN_SHA256",
    adminTestId: "admin-notification-operator-section",
    requiredTables: ["notification_operator_events", "notification_delivery_health_snapshots", "notification_provider_sync_status", "notification_required_review_flags", "notification_duplicate_dedupe_records", "notification_operator_learning_state"],
    safeAction: "mark_token_provider_revoked",
    highRiskAction: "push_blast_or_campaign_send",
    requiredCopy: ["preference", "DeviceNotRegistered", "marketing blast"],
  },
  release: {
    id: "release_ota_operator",
    functionPath: "supabase/functions/release-operator/index.ts",
    helperPath: "_lib/releaseOtaOperator.ts",
    proofScript: "proof:release-ota-operator",
    guardScript: "guard:release-ota-operator",
    tokenHashEnv: "RELEASE_OPERATOR_TOKEN_SHA256",
    adminTestId: "admin-release-operator-section",
    requiredTables: ["release_operator_events", "release_health_snapshots", "ota_diagnostics_readback_records", "rollout_anomaly_findings", "release_required_review_flags", "rollback_readiness_records", "release_operator_learning_state"],
    safeAction: "emergency_launch_report",
    highRiskAction: "production_ota_publish",
    requiredCopy: ["updateId", "emergency launch", "production OTA"],
  },
  security: {
    id: "security_owner_operator",
    functionPath: "supabase/functions/security-owner-operator/index.ts",
    helperPath: "_lib/securityOwnerOperator.ts",
    proofScript: "proof:security-owner-operator",
    guardScript: "guard:security-owner-operator",
    tokenHashEnv: "SECURITY_OWNER_OPERATOR_TOKEN_SHA256",
    adminTestId: "admin-security-owner-operator-section",
    requiredTables: ["security_operator_events", "security_health_snapshots", "security_required_review_flags", "owner_authority_integrity_findings", "approval_integrity_findings", "secret_scan_findings", "security_operator_learning_state"],
    safeAction: "owner_role_integrity_check",
    highRiskAction: "owner_role_mutation",
    requiredCopy: ["Rachi", "operator self-approval", "owner role"],
  },
  moderation: {
    id: "moderation_safety_operator",
    functionPath: "supabase/functions/moderation-safety-operator/index.ts",
    helperPath: "_lib/moderationSafetyOperator.ts",
    proofScript: "proof:moderation-safety-operator",
    guardScript: "guard:moderation-safety-operator",
    tokenHashEnv: "MODERATION_SAFETY_OPERATOR_TOKEN_SHA256",
    adminTestId: "admin-moderation-safety-operator-section",
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
const admin = read("app/admin.tsx");
const pkg = JSON.parse(read("package.json"));

const checks = [
  ["registered active system", registry.includes(`id: "${system.id}"`) && registry.includes("scoped_write_capable_guarded")],
  ["not candidate placeholder", !registry.match(new RegExp(`AUTONOMOUS_CANDIDATE_SYSTEMS_REGISTRY[\\s\\S]*${system.id}`))],
  ["manual only scheduler status", registry.includes("no_scheduler_no_daemon_no_worker_manual_cli_only")],
  ["proof script registered", registry.includes(system.proofScript) && pkg.scripts?.[system.proofScript]],
  ["guard script registered", registry.includes(system.guardScript) && pkg.scripts?.[system.guardScript]],
  ["helper classifies approval level", helper.includes("ApprovalLevel") && helper.includes(system.highRiskAction)],
  ["helper builds approval request", helper.includes("buildScopedOperatorApprovalRequest")],
  ["helper forbids unsafe mutation", helper.includes("assertNoForbidden")],
  ["edge function token hash", fn.includes(system.tokenHashEnv)],
  ["edge function action surface", fn.includes(system.safeAction) && fn.includes(system.highRiskAction)],
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
