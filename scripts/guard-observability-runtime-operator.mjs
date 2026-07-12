#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.resolve(root, file), "utf8");

const registry = read("_lib/autonomousSystemsRegistry.ts");
const migration = read("supabase/migrations/20260712170541_observability_runtime_operator.sql");
const helper = read("_lib/observabilityRuntimeOperator.ts");
const fn = read("supabase/functions/observability-operator/index.ts");
const sharedFn = read("supabase/functions/_shared/scoped-operator.ts");
const admin = read("app/admin.tsx");
const docs = [
  "docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md",
  "docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md",
  "docs/OBSERVABILITY_RUNTIME_OPERATOR_RUNBOOK.md",
].map(read).join("\n");
const pkg = JSON.parse(read("package.json"));
const service = read("ops/observability-operator/systemd/chillywood-observability-operator-watch-once.service");
const timer = read("ops/observability-operator/systemd/chillywood-observability-operator-watch-once.timer");
const watchScript = read("ops/observability-operator/systemd/observability-operator-watch-once.sh");

const systemStart = registry.indexOf('id: "observability_runtime_operator"');
const systemBlock = systemStart >= 0 ? registry.slice(systemStart, registry.indexOf("\n  },", systemStart) + 4) : "";
const failures = [];

if (!systemBlock.includes("scoped_write_capable_guarded")) failures.push("system_not_scoped_write_capable");
if (!systemBlock.includes('activeActivationMode: "limited_scheduled_probe"')) failures.push("scheduled_activation_missing");
if (!systemBlock.includes("chillywood-observability-operator-watch-once.timer_every_10_minutes")) failures.push("scheduler_status_missing");
if (!pkg.scripts?.["proof:observability-runtime-operator"]) failures.push("package_proof_missing");
if (!pkg.scripts?.["guard:observability-runtime-operator"]) failures.push("package_guard_missing");
if (!fn.includes("handleScopedOperatorRequest") || !fn.includes("OBSERVABILITY_OPERATOR_TOKEN_SHA256") || !sharedFn.includes("constantTimeEqual")) failures.push("token_gate_missing");
if (!migration.includes("enable row level security")) failures.push("rls_missing");
if (!migration.includes("from anon, authenticated")) failures.push("client_write_denial_missing");
if (!migration.includes("pii_stored = false") || !migration.includes("secrets_logged = false")) failures.push("pii_secret_constraints_missing");
if (!migration.includes("release_action_executed = false")) failures.push("release_action_constraint_missing");
if (!admin.includes("admin-observability-operator-section")) failures.push("admin_section_missing");
if (fs.existsSync(path.resolve(root, "app/admin-command-center.tsx"))) failures.push("duplicate_admin_route_created");
if (!fs.existsSync(path.resolve(root, "ops/observability-operator/systemd/chillywood-observability-operator-watch-once.timer"))) failures.push("scheduler_artifact_missing");
for (const hardening of ["NoNewPrivileges=true", "ProtectSystem=strict", "PrivateTmp=true", "RestrictSUIDSGID=true", "LockPersonality=true", "CapabilityBoundingSet="]) {
  if (!service.includes(hardening)) failures.push(`systemd_hardening_missing:${hardening}`);
}
if (!timer.includes("OnUnitActiveSec=10min") || !timer.includes("RandomizedDelaySec=45s")) failures.push("timer_cadence_missing");
if (!watchScript.includes('"action":"watch_once"') || !watchScript.includes('"scheduler":"systemd_timer"') || !watchScript.includes('"operator_id":"observability_runtime_operator"')) failures.push("watch_once_scheduler_identity_missing");
if (/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|--service-role/i.test(service + "\n" + timer + "\n" + watchScript)) failures.push("systemd_uses_service_role_key");

const requiredForbidden = [
  "delete crash evidence",
  "silence crash reporting",
  "log secrets/tokens",
  "publish OTA",
  "rollback OTA",
  "change Remote Config/feature flags without approval",
  "fake installed proof",
];
for (const forbidden of requiredForbidden) {
  if (!systemBlock.includes(forbidden) && !docs.includes(forbidden)) failures.push(`forbidden_scope_missing:${forbidden}`);
}

const forbiddenPatterns = [
  /delete_crash_evidence[\s\S]{0,300}approvalLevel:\s*[012]/,
  /silence_crash_reporting[\s\S]{0,300}approvalLevel:\s*[012]/,
  /production_ota_publish[\s\S]{0,300}approvalLevel:\s*[0123]/,
  /production_ota_rollback[\s\S]{0,300}approvalLevel:\s*[0123]/,
  /remote_config_or_feature_flag_mutation[\s\S]{0,300}approvalLevel:\s*[012]/,
  /provider_analytics_config_mutation[\s\S]{0,300}approvalLevel:\s*[012]/,
];
if (forbiddenPatterns.some((pattern) => pattern.test(registry + "\n" + helper))) failures.push("high_risk_action_downgraded");

if (!helper.includes("assertNoForbiddenObservabilityMutation")) failures.push("forbidden_mutation_assertion_missing");
if (!helper.includes("sanitizeObservabilityProof")) failures.push("sanitizer_missing");
if (!fn.includes("approvalActions") || !fn.includes("production_ota_publish") || !fn.includes("production_ota_rollback")) failures.push("approval_actions_missing");
if (/(console\.log\([^)]*(token|secret|password|credential)|OBSERVABILITY_OPERATOR_TOKEN=|OBSERVABILITY_OPERATOR_TOKEN_SHA256=|SERVICE_ROLE_KEY)/i.test(fn + "\n" + admin + "\n" + docs)) {
  failures.push("secret_logging_or_client_secret_reference");
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, system: "observability_runtime_operator", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  system: "observability_runtime_operator",
  guard: "observability_runtime_boundaries_enforced",
  schedulerActive: true,
  highRiskRequiresApproval: true,
}, null, 2));
