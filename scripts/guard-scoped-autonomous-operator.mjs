#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const systems = {
  notification: {
    id: "notification_delivery_operator",
    adminTestId: "admin-notification-operator-section",
    functionPath: "supabase/functions/notification-operator/index.ts",
    guardScript: "guard:notification-delivery-operator",
    highRisk: ["push_blast_or_campaign_send", "provider_push_config_change", "marketing blast"],
    forbiddenAutonomous: ["preference bypass", "push provider credentials", "broad user messaging"],
  },
  release: {
    id: "release_ota_operator",
    adminTestId: "admin-release-operator-section",
    functionPath: "supabase/functions/release-operator/index.ts",
    guardScript: "guard:release-ota-operator",
    highRisk: ["production_ota_publish", "production_ota_rollback", "store_release_submission"],
    forbiddenAutonomous: ["auto-publish", "auto-rollback", "fake installed proof"],
  },
  security: {
    id: "security_owner_operator",
    adminTestId: "admin-security-owner-operator-section",
    functionPath: "supabase/functions/security-owner-operator/index.ts",
    guardScript: "guard:security-owner-operator",
    highRisk: ["owner_role_mutation", "auth_rls_policy_mutation", "secret_rotation"],
    forbiddenAutonomous: ["assign/revoke owner role autonomously", "mutate auth/RLS autonomously", "Rachi/operator approve themselves"],
  },
  moderation: {
    id: "moderation_safety_operator",
    adminTestId: "admin-moderation-safety-operator-section",
    functionPath: "supabase/functions/moderation-safety-operator/index.ts",
    guardScript: "guard:moderation-safety-operator",
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
const admin = read("app/admin.tsx");
const docs = [
  "docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md",
  "docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md",
].map(read).join("\n");
const pkg = JSON.parse(read("package.json"));

const systemBlock = registry.slice(registry.indexOf(`id: "${system.id}"`), registry.indexOf("},", registry.indexOf(`id: "${system.id}"`)) + 2);
const failures = [];

if (!systemBlock.includes("scoped_write_capable_guarded")) failures.push("system_not_scoped_write_capable");
if (!systemBlock.includes("manual_cli")) failures.push("manual_cli_activation_missing");
if (!systemBlock.includes("no_scheduler_no_daemon_no_worker_manual_cli_only")) failures.push("scheduler_status_overclaimed_or_missing");
if (systemBlock.includes("limited_scheduled_safe_recovery_active") || systemBlock.includes("timer_every")) failures.push("scheduler_claimed_active");
if (!pkg.scripts?.[system.guardScript]) failures.push("package_guard_script_missing");
if (!fn.includes("handleScopedOperatorRequest") || !sharedFn.includes("constantTimeEqual")) failures.push("constant_time_token_gate_missing");
if (!sharedFn.includes("sanitizeOperatorMetadata")) failures.push("metadata_redaction_missing");
if (!migration.includes("enable row level security")) failures.push("rls_missing");
if (!migration.includes("from anon, authenticated")) failures.push("client_write_denial_missing");
if (!migration.includes("check (user_rights_changed = false)")) failures.push("user_rights_change_constraint_missing");
if (!migration.includes("check (money_moved = false)")) failures.push("money_moved_constraint_missing");
if (fs.existsSync("app/admin-command-center.tsx")) failures.push("duplicate_admin_route_created");
if (!admin.includes(system.adminTestId)) failures.push("admin_status_section_missing");

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
  schedulerActive: false,
  highRiskRequiresApproval: true,
}, null, 2));
