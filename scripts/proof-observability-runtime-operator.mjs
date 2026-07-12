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
const pkg = JSON.parse(read("package.json"));
const monitoringProof = read("scripts/proof-monitoring-analytics-crash-runtime-diagnostics.mjs");

const checks = [
  ["registered active system", registry.includes('id: "observability_runtime_operator"') && registry.includes("Observability / Runtime Health Operator")],
  ["manual activation no scheduler claim", registry.includes('activeActivationMode: "manual_cli"') && registry.includes("no_scheduler_no_daemon_no_worker_manual_cli_only")],
  ["proof script registered", registry.includes("proof:observability-runtime-operator") && pkg.scripts?.["proof:observability-runtime-operator"]],
  ["guard script registered", registry.includes("guard:observability-runtime-operator") && pkg.scripts?.["guard:observability-runtime-operator"]],
  ["monitoring proof linked", registry.includes("proof:monitoring-analytics-crash-runtime-diagnostics") && monitoringProof.includes("Crash/error diagnostics are sanitized")],
  ["helper action levels", helper.includes("record_crash_cluster_finding") && helper.includes("record_js_error_finding") && helper.includes("record_performance_regression") && helper.includes("production_ota_publish")],
  ["unknown defaults owner approval", helper.includes("unknownLevel") && helper.includes("? 4 : 3")],
  ["feature flag mutation Level 3", /remote_config_or_feature_flag_mutation[\s\S]*approvalLevel:\s*3/.test(helper)],
  ["OTA publish Level 4", /production_ota_publish[\s\S]*approvalLevel:\s*4/.test(helper)],
  ["OTA rollback Level 4", /production_ota_rollback[\s\S]*approvalLevel:\s*4/.test(helper)],
  ["edge function token hash", fn.includes("OBSERVABILITY_OPERATOR_TOKEN_SHA256") && fn.includes("x-observability-operator-token") && fn.includes("observability_operator_token_required")],
  ["edge function safe actions", ["record_crash_cluster_finding", "record_js_error_finding", "record_performance_regression", "analytics_delivery_health", "record_release_anomaly", "backend_error_rate_report", "watch_once", "report"].every((needle) => fn.includes(needle))],
  ["edge function high-risk approval actions", ["remote_config_or_feature_flag_mutation", "provider_analytics_config_mutation", "production_ota_publish", "production_ota_rollback"].every((needle) => fn.includes(needle))],
  ["shared report read-only", sharedFn.includes('if (action === "report")') && sharedFn.includes("report_read")],
  ["migration tables", ["observability_operator_events", "runtime_health_snapshots", "crash_cluster_findings", "js_error_findings", "performance_regression_findings", "analytics_delivery_findings", "release_health_findings", "backend_error_rate_findings", "observability_required_review_flags", "observability_operator_learning_state"].every((table) => migration.includes(`public.${table}`) || migration.includes(table))],
  ["RLS enabled", migration.includes("enable row level security")],
  ["clients denied", migration.includes("from anon, authenticated")],
  ["service role only writes", migration.includes("to service_role")],
  ["PII and secrets constrained", migration.includes("pii_stored boolean not null default false check (pii_stored = false)") && migration.includes("secrets_logged boolean not null default false check (secrets_logged = false)")],
  ["release action constrained", migration.includes("release_action_executed boolean not null default false check (release_action_executed = false)")],
  ["admin section", admin.includes("admin-observability-operator-section") && admin.includes("observability-blocked-actions")],
  ["no duplicate admin route", !fs.existsSync(path.resolve(root, "app/admin-command-center.tsx"))],
  ["no scheduler artifacts for observability", !fs.existsSync(path.resolve(root, "ops/observability-operator/systemd/chillywood-observability-operator-watch-once.timer"))],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error(JSON.stringify({ ok: false, system: "observability_runtime_operator", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  system: "observability_runtime_operator",
  status: "scoped_write_capable_guarded",
  activation: "manual_cli",
  schedulerActive: false,
  safeWrites: [
    "runtime_health_snapshots",
    "crash_cluster_findings",
    "js_error_findings",
    "performance_regression_findings",
    "analytics_delivery_findings",
    "release_health_findings",
    "backend_error_rate_findings",
  ],
  releaseActionsBlocked: true,
  secretsAndPiiBlocked: true,
}, null, 2));
