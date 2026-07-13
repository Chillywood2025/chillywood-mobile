#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));

const systems = {
  platformRecovery: {
    id: "platform_recovery_operator",
    displayName: "Platform Recovery Operator",
    helperPath: "_lib/platformRecoveryOperator.ts",
    functionPath: "supabase/functions/platform-recovery-operator/index.ts",
    functionName: "platform-recovery-operator",
    runbookPath: "docs/PLATFORM_RECOVERY_OPERATOR_RUNBOOK.md",
    adminTestId: "admin-platform-recovery-operator-section",
    proofScript: "proof:platform-recovery-operator",
    guardScript: "guard:platform-recovery-operator",
    cliScripts: ["platform-recovery-operator:watch-once", "platform-recovery-operator:status", "platform-recovery-operator:report"],
    tokenHeader: "x-platform-recovery-operator-token",
    tokenHashEnv: "PLATFORM_RECOVERY_OPERATOR_TOKEN_SHA256",
    activation: "limited_scheduled_probe",
    schedulerStatus: "chillywood-platform-recovery-operator-watch-once.timer_every_30_minutes",
    servicePath: "ops/platform-recovery-operator/systemd/chillywood-platform-recovery-operator-watch-once.service",
    timerPath: "ops/platform-recovery-operator/systemd/chillywood-platform-recovery-operator-watch-once.timer",
    watchScriptPath: "ops/platform-recovery-operator/systemd/platform-recovery-operator-watch-once.sh",
    timerCadence: "OnUnitActiveSec=30min",
    tables: [
      "platform_recovery_operator_events",
      "backup_health_snapshots",
      "restore_drill_findings",
      "migration_drift_findings",
      "function_deployment_drift_findings",
      "scheduled_timer_health_findings",
      "recovery_required_review_flags",
      "recovery_operator_learning_state",
    ],
    actions: ["database_backup_freshness", "restore_drill_freshness", "migration_drift_detection", "scheduled_timer_health", "watch_once"],
    approvalActions: ["production_restore", "destructive_db_mutation", "secret_rotation"],
    forbidden: ["production restore without approval", "destructive DB mutation", "secret rotation without approval", "fake backup/restore success"],
    docs: ["no production restore", "no destructive mutation", "Scheduler proof"],
    seed: "watch_once writes backup freshness status only",
  },
  privacyCompliance: {
    id: "privacy_compliance_operator",
    displayName: "Privacy Compliance Operator",
    helperPath: "_lib/privacyComplianceOperator.ts",
    functionPath: "supabase/functions/privacy-compliance-operator/index.ts",
    functionName: "privacy-compliance-operator",
    runbookPath: "docs/PRIVACY_COMPLIANCE_OPERATOR_RUNBOOK.md",
    adminTestId: "admin-privacy-compliance-operator-section",
    proofScript: "proof:privacy-compliance-operator",
    guardScript: "guard:privacy-compliance-operator",
    cliScripts: ["privacy-compliance-operator:watch-once", "privacy-compliance-operator:status", "privacy-compliance-operator:report"],
    tokenHeader: "x-privacy-compliance-operator-token",
    tokenHashEnv: "PRIVACY_COMPLIANCE_OPERATOR_TOKEN_SHA256",
    activation: "limited_scheduled_probe",
    schedulerStatus: "chillywood-privacy-compliance-operator-watch-once.timer_every_6_hours",
    servicePath: "ops/privacy-compliance-operator/systemd/chillywood-privacy-compliance-operator-watch-once.service",
    timerPath: "ops/privacy-compliance-operator/systemd/chillywood-privacy-compliance-operator-watch-once.timer",
    watchScriptPath: "ops/privacy-compliance-operator/systemd/privacy-compliance-operator-watch-once.sh",
    timerCadence: "OnUnitActiveSec=6h",
    tables: [
      "privacy_operator_events",
      "privacy_request_findings",
      "privacy_export_plans",
      "privacy_deletion_plans",
      "privacy_required_review_flags",
      "pii_exposure_findings",
      "retention_hold_findings",
      "privacy_operator_learning_state",
    ],
    actions: ["privacy_request_intake", "account_data_export_planning", "account_deletion_planning", "legal_hold_readback", "watch_once"],
    approvalActions: ["production_account_deletion", "raw_private_data_export", "legal_hold_override"],
    forbidden: ["deleting account/data without approved flow", "exporting raw private data without owner/legal-approved flow", "bypassing legal hold", "fake compliance closure"],
    docs: ["no real export", "no account deletion", "legal hold"],
    seed: "request/status finding only",
  },
  supportSuccess: {
    id: "support_success_operator",
    displayName: "Support Success Operator",
    helperPath: "_lib/supportSuccessOperator.ts",
    functionPath: "supabase/functions/support-success-operator/index.ts",
    functionName: "support-success-operator",
    runbookPath: "docs/SUPPORT_SUCCESS_OPERATOR_RUNBOOK.md",
    adminTestId: "admin-support-success-operator-section",
    proofScript: "proof:support-success-operator",
    guardScript: "guard:support-success-operator",
    cliScripts: ["support-success-operator:watch-once", "support-success-operator:status", "support-success-operator:report"],
    tokenHeader: "x-support-success-operator-token",
    tokenHashEnv: "SUPPORT_SUCCESS_OPERATOR_TOKEN_SHA256",
    activation: "limited_scheduled_probe",
    schedulerStatus: "chillywood-support-success-operator-watch-once.timer_every_30_minutes",
    servicePath: "ops/support-success-operator/systemd/chillywood-support-success-operator-watch-once.service",
    timerPath: "ops/support-success-operator/systemd/chillywood-support-success-operator-watch-once.timer",
    watchScriptPath: "ops/support-success-operator/systemd/support-success-operator-watch-once.sh",
    timerCadence: "OnUnitActiveSec=30min",
    tables: [
      "support_operator_events",
      "support_health_snapshots",
      "support_ticket_findings",
      "support_required_review_flags",
      "support_response_drafts",
      "support_escalation_records",
      "support_operator_learning_state",
    ],
    actions: ["support_inbox_health", "stale_support_ticket_detection", "refund_request_classification", "support_response_drafts", "watch_once"],
    approvalActions: ["issue_refund", "grant_premium", "auth_credential_reset"],
    forbidden: ["issuing refunds", "granting Premium", "moving money", "sending legal/payment commitments"],
    docs: ["no refund", "no Premium grant", "draft response only"],
    seed: "support queue health status only",
  },
  searchRanking: {
    id: "search_ranking_integrity_operator",
    displayName: "Search / Ranking Integrity Operator",
    helperPath: "_lib/searchRankingIntegrityOperator.ts",
    functionPath: "supabase/functions/search-ranking-integrity-operator/index.ts",
    functionName: "search-ranking-integrity-operator",
    runbookPath: "docs/SEARCH_RANKING_INTEGRITY_OPERATOR_RUNBOOK.md",
    adminTestId: "admin-search-ranking-integrity-operator-section",
    proofScript: "proof:search-ranking-integrity-operator",
    guardScript: "guard:search-ranking-integrity-operator",
    cliScripts: ["search-ranking-integrity-operator:watch-once", "search-ranking-integrity-operator:status", "search-ranking-integrity-operator:report"],
    tokenHeader: "x-search-ranking-integrity-operator-token",
    tokenHashEnv: "SEARCH_RANKING_INTEGRITY_OPERATOR_TOKEN_SHA256",
    activation: "limited_scheduled_probe",
    schedulerStatus: "chillywood-search-ranking-integrity-operator-watch-once.timer_every_30_minutes",
    servicePath: "ops/search-ranking-integrity-operator/systemd/chillywood-search-ranking-integrity-operator-watch-once.service",
    timerPath: "ops/search-ranking-integrity-operator/systemd/chillywood-search-ranking-integrity-operator-watch-once.timer",
    watchScriptPath: "ops/search-ranking-integrity-operator/systemd/search-ranking-integrity-operator-watch-once.sh",
    timerCadence: "OnUnitActiveSec=30min",
    tables: [
      "search_operator_events",
      "search_health_snapshots",
      "ranking_integrity_findings",
      "recommendation_quality_findings",
      "visibility_anomaly_findings",
      "search_required_review_flags",
      "search_operator_learning_state",
    ],
    actions: ["search_health", "ranking_integrity_findings", "recommendation_quality_findings", "visibility_anomaly_findings", "watch_once"],
    approvalActions: ["ranking_algorithm_change", "visibility_mutation", "shadowban_or_hidden_enforcement"],
    forbidden: ["hidden shadowban", "secret demotion/boost", "moderation enforcement", "changing ranking algorithm without approval"],
    docs: ["no ranking mutation", "no hidden enforcement", "no exposure change"],
    seed: "search/ranking health status only",
  },
  adsSponsor: {
    id: "ads_sponsor_delivery_operator",
    displayName: "Ads / Sponsor Delivery Operator",
    helperPath: "_lib/adsSponsorDeliveryFoundation.ts",
    runbookPath: "docs/ADS_SPONSOR_DELIVERY_FOUNDATION_RUNBOOK.md",
    adminTestId: "admin-ads-sponsor-delivery-foundation-section",
    proofScript: "proof:ads-sponsor-delivery-foundation",
    guardScript: "guard:ads-sponsor-delivery-foundation",
    schedulerStatus: "no_scheduler_foundation_only",
    forbidden: ["serving ads", "sponsor checkout", "ad revenue claim", "fake ad impressions", "live billing/payout"],
    docs: ["foundation-only", "no scheduler", "no Edge Function", "no live writes"],
    foundationOnly: true,
  },
};

const key = process.argv[2];
const config = systems[key];
if (!config) {
  console.error(`Unknown operator proof target: ${key ?? "(missing)"}`);
  console.error(`Expected one of: ${Object.keys(systems).join(", ")}`);
  process.exit(2);
}

const failures = [];
const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
};
const forbidText = (label, source, needle) => {
  if (source.includes(needle)) failures.push(`${label} must not include: ${needle}`);
};
const registryBlock = (registry, id) => {
  const start = registry.indexOf(`id: "${id}"`);
  const end = registry.indexOf("\n  },", start);
  return start >= 0 && end > start ? registry.slice(start, end) : "";
};

const registry = read("_lib/autonomousSystemsRegistry.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const operatingModel = read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md");
const packageJson = read("package.json");
const ownerCommand = read("_lib/ownerCommandOperator.ts");
const ownerCommandFn = read("supabase/functions/owner-command-operator/index.ts");
const admin = read("app/admin.tsx");
const helper = read(config.helperPath);
const runbook = exists(config.runbookPath) ? read(config.runbookPath) : "";
const block = registryBlock(registry, config.id);

for (const source of [registry, registryDoc, ownerCommand, ownerCommandFn, helper, runbook]) {
  requireText("operator identity", source, config.id);
}
requireText("registry block", block, `displayName: "${config.displayName}"`);
requireText("registry block", block, `schedulerStatus: "${config.schedulerStatus}"`);
requireText("registry block", block, config.proofScript);
requireText("registry block", block, config.guardScript);
requireText("package proof", packageJson, `"${config.proofScript}"`);
requireText("package guard", packageJson, `"${config.guardScript}"`);
requireText("admin status", admin, config.adminTestId);
requireText("operating model", operatingModel, config.id);
for (const forbidden of config.forbidden) requireText("registry forbidden", block, forbidden);
for (const phrase of config.docs) requireText("runbook", runbook, phrase);

if (config.foundationOnly) {
  requireText("registry foundation status", block, 'status: "foundation_only_guarded"');
  requireText("registry activation", block, 'activeActivationMode: "off"');
  requireText("registry no scheduler", block, "no_scheduler_foundation_only");
  requireText("helper foundation status", helper, "ADS_SPONSOR_FOUNDATION_STATUS");
  requireText("helper owner command", helper, "buildAdsSponsorFutureOwnerCommand");
  forbidText("function tree", packageJson, "ads-sponsor-delivery-operator:watch-once");
  if (exists("supabase/functions/ads-sponsor-delivery-operator/index.ts")) failures.push("ads/sponsor foundation unexpectedly has an Edge Function");
  console.log(JSON.stringify({
    ok: failures.length === 0,
    systemId: config.id,
    foundationOnly: true,
    schedulerStatus: config.schedulerStatus,
    liveWrites: "none",
    failures,
  }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

const migration = read("supabase/migrations/20260713013807_autonomous_coverage_expansion_operators.sql");
const edge = read(config.functionPath);
const cli = read("scripts/scoped-autonomous-operator-cli.mjs");
const approval = read("_lib/autonomousApprovalRequests.ts");
const approvalFn = read("supabase/functions/autonomous-approval-request/index.ts");
const supabaseConfig = read("supabase/config.toml");

requireText("registry status", block, 'status: "scoped_write_capable_guarded"');
requireText("registry activation", block, `activeActivationMode: "${config.activation}"`);
requireText("registry allowed writes", block, "allowedWrites");
requireText("registry owner approval", block, "ownerApprovalRequired: true");
for (const cliScript of config.cliScripts) requireText("package CLI", packageJson, `"${cliScript}"`);
requireText("CLI config", cli, `systemId: "${config.id}"`);
requireText("CLI token env", cli, config.tokenHashEnv.replace("_SHA256", ""));
requireText("function config", supabaseConfig, `[functions.${config.functionName}]`);
requireText("function config", supabaseConfig, "verify_jwt = false");
requireText("edge function", edge, "handleScopedOperatorRequest");
requireText("edge token header", edge, config.tokenHeader);
requireText("edge token hash", edge, config.tokenHashEnv);
requireText("edge result safety", edge, "watch_once");
for (const action of config.actions) requireText("edge action", edge, `"${action}"`);
for (const action of config.approvalActions) requireText("edge approval action", edge, `"${action}"`);
for (const table of config.tables) {
  requireText("migration table", migration, `public.${table}`);
  requireText("migration RLS", migration, `alter table public.${table} enable row level security`);
}
requireText("migration client write denial", migration, "from anon, authenticated");
requireText("migration service role scope", migration, "to service_role");
requireText("migration fake proof dynamic invariant", migration, "safe_table_name || '_fake_proof_false'");
requireText("migration fake proof check", migration, "check (fake_proof = false)");
requireText("migration high risk check", migration, "check (high_risk_executed = false)");
requireText("migration money check", migration, "check (money_moved = false)");
requireText("migration rights check", migration, "check (user_rights_changed = false)");
requireText("migration actor whitelist", migration, `'${config.id}'`);
requireText("migration safe proof seed", migration, config.seed);
for (const source of [approval, approvalFn, ownerCommand, ownerCommandFn]) requireText("owner/approval integration", source, config.id);
requireText("helper classifier", helper, "classify");
requireText("helper watch plan", helper, "WatchPlan");
requireText("helper owner command", helper, "OwnerCommand");
requireText("helper sanitizer", helper, "sanitize");
requireText("runbook scheduler truth", runbook, config.schedulerStatus);
const service = read(config.servicePath);
const timer = read(config.timerPath);
const watchScript = read(config.watchScriptPath);
requireText("systemd service env", service, "EnvironmentFile=/etc/chillywood/");
requireText("systemd service watch script", service, "ExecStart=/opt/chillywood/");
requireText("systemd hardening", service, "NoNewPrivileges=true");
requireText("systemd hardening", service, "ProtectSystem=strict");
requireText("systemd hardening", service, "PrivateTmp=true");
requireText("systemd hardening", service, "RestrictSUIDSGID=true");
requireText("systemd hardening", service, "LockPersonality=true");
requireText("systemd hardening", service, "CapabilityBoundingSet=");
requireText("systemd timer cadence", timer, config.timerCadence);
requireText("systemd timer install", timer, "WantedBy=timers.target");
requireText("watch script action", watchScript, '"action":"watch_once"');
requireText("watch script scheduler", watchScript, '"scheduler":"systemd_timer"');
requireText("watch script operator id", watchScript, `"operator_id":"${config.id}"`);
requireText("watch script redaction", watchScript, "[redacted]");
forbidText("systemd artifacts", service + timer + watchScript, "SERVICE_ROLE");

if (failures.length) {
  console.error(`${config.proofScript} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  systemId: config.id,
  status: "scoped_write_capable_guarded",
  activation: config.activation,
  schedulerStatus: config.schedulerStatus,
  edgeFunction: config.functionName,
  tables: config.tables.length,
  ownerCommandIntegrated: true,
}, null, 2));
