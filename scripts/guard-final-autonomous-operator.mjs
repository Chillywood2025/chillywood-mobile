#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));

const systems = {
  platformRecovery: {
    id: "platform_recovery_operator",
    helperPath: "_lib/platformRecoveryOperator.ts",
    functionPath: "supabase/functions/platform-recovery-operator/index.ts",
    runbookPath: "docs/PLATFORM_RECOVERY_OPERATOR_RUNBOOK.md",
    proofScript: "proof:platform-recovery-operator",
    guardScript: "guard:platform-recovery-operator",
    schedulerStatus: "scheduler_pending_no_hardened_host_token_path",
    tokenHeader: "x-platform-recovery-operator-token",
    tokenHashEnv: "PLATFORM_RECOVERY_OPERATOR_TOKEN_SHA256",
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
    forbiddenExecutionPatterns: [/restoreProduction\s*\(/i, /deleteBackup\s*\(/i, /rotateSecret\s*\(/i, /providerConfig\.update/i],
  },
  privacyCompliance: {
    id: "privacy_compliance_operator",
    helperPath: "_lib/privacyComplianceOperator.ts",
    functionPath: "supabase/functions/privacy-compliance-operator/index.ts",
    runbookPath: "docs/PRIVACY_COMPLIANCE_OPERATOR_RUNBOOK.md",
    proofScript: "proof:privacy-compliance-operator",
    guardScript: "guard:privacy-compliance-operator",
    schedulerStatus: "scheduler_pending_legal_workflow_and_hardened_host_path",
    tokenHeader: "x-privacy-compliance-operator-token",
    tokenHashEnv: "PRIVACY_COMPLIANCE_OPERATOR_TOKEN_SHA256",
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
    forbiddenExecutionPatterns: [/deleteAccount\s*\(/i, /exportRawPrivateData\s*\(/i, /bypassLegalHold\s*\(/i],
  },
  supportSuccess: {
    id: "support_success_operator",
    helperPath: "_lib/supportSuccessOperator.ts",
    functionPath: "supabase/functions/support-success-operator/index.ts",
    runbookPath: "docs/SUPPORT_SUCCESS_OPERATOR_RUNBOOK.md",
    proofScript: "proof:support-success-operator",
    guardScript: "guard:support-success-operator",
    schedulerStatus: "scheduler_pending_support_table_and_hardened_host_path",
    tokenHeader: "x-support-success-operator-token",
    tokenHashEnv: "SUPPORT_SUCCESS_OPERATOR_TOKEN_SHA256",
    tables: [
      "support_operator_events",
      "support_health_snapshots",
      "support_ticket_findings",
      "support_required_review_flags",
      "support_response_drafts",
      "support_escalation_records",
      "support_operator_learning_state",
    ],
    forbiddenExecutionPatterns: [/issueRefund\s*\(/i, /grantPremium\s*\(/i, /resetCredential\s*\(/i, /sendExternalMessage\s*\(/i],
  },
  searchRanking: {
    id: "search_ranking_integrity_operator",
    helperPath: "_lib/searchRankingIntegrityOperator.ts",
    functionPath: "supabase/functions/search-ranking-integrity-operator/index.ts",
    runbookPath: "docs/SEARCH_RANKING_INTEGRITY_OPERATOR_RUNBOOK.md",
    proofScript: "proof:search-ranking-integrity-operator",
    guardScript: "guard:search-ranking-integrity-operator",
    schedulerStatus: "scheduler_pending_search_health_path_and_hardened_host_path",
    tokenHeader: "x-search-ranking-integrity-operator-token",
    tokenHashEnv: "SEARCH_RANKING_INTEGRITY_OPERATOR_TOKEN_SHA256",
    tables: [
      "search_operator_events",
      "search_health_snapshots",
      "ranking_integrity_findings",
      "recommendation_quality_findings",
      "visibility_anomaly_findings",
      "search_required_review_flags",
      "search_operator_learning_state",
    ],
    forbiddenExecutionPatterns: [/shadowban\s*\(/i, /boostCreator\s*\(/i, /demoteCreator\s*\(/i, /updateRankingAlgorithm\s*\(/i],
  },
  adsSponsor: {
    id: "ads_sponsor_delivery_operator",
    helperPath: "_lib/adsSponsorDeliveryFoundation.ts",
    runbookPath: "docs/ADS_SPONSOR_DELIVERY_FOUNDATION_RUNBOOK.md",
    proofScript: "proof:ads-sponsor-delivery-foundation",
    guardScript: "guard:ads-sponsor-delivery-foundation",
    schedulerStatus: "no_scheduler_foundation_only",
    foundationOnly: true,
  },
};

const key = process.argv[2];
const config = systems[key];
if (!config) {
  console.error(`Unknown operator guard target: ${key ?? "(missing)"}`);
  console.error(`Expected one of: ${Object.keys(systems).join(", ")}`);
  process.exit(2);
}

const failures = [];
const includes = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
};
const notIncludes = (source, needle, label) => {
  if (source.includes(needle)) failures.push(`${label} must not include: ${needle}`);
};
const blockFor = (source, id) => {
  const start = source.indexOf(`id: "${id}"`);
  const end = source.indexOf("\n  },", start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
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
const block = blockFor(registry, config.id);

includes(registry, `| "${config.id}"`, "AutonomousSystemId");
includes(registryDoc, `\`${config.id}\``, "registry docs");
includes(operatingModel, config.id, "operating model");
includes(ownerCommand, `"${config.id}"`, "owner command helper routing");
includes(ownerCommandFn, `"${config.id}"`, "owner command function routing");
includes(packageJson, `"${config.proofScript}"`, "package proof script");
includes(packageJson, `"${config.guardScript}"`, "package guard script");
includes(block, config.schedulerStatus, "scheduler truth");
includes(runbook, config.schedulerStatus, "runbook scheduler truth");
includes(admin, config.id, "admin status copy");

const highRiskDirectPattern = /(stripe\.|checkout\.sessions\.create|paymentLinks\.create|payouts\.create|transfers\.create|supabase\.auth\.admin|createSignedUrl|Deno\.run|exec\(|adb install|clear app data|eas update|expo publish)/i;
if (highRiskDirectPattern.test(helper)) failures.push(`${config.id} helper contains direct high-risk execution pattern`);
notIncludes(runbook, "SUPABASE_SERVICE_ROLE_KEY=", "runbook secret literal");
notIncludes(runbook, "_TOKEN=", "runbook token literal");
notIncludes(runbook, "sk_live_", "runbook Stripe secret literal");
notIncludes(runbook, "signedUrl:", "runbook signed URL literal");

if (config.foundationOnly) {
  includes(block, 'status: "foundation_only_guarded"', "ads foundation status");
  includes(block, 'activeActivationMode: "off"', "ads foundation activation");
  includes(block, "no_scheduler_foundation_only", "ads foundation scheduler");
  includes(block, "no Edge Function required", "ads foundation no edge");
  includes(block, "no live write tables", "ads foundation no live writes");
  includes(helper, "ADS_SPONSOR_FOUNDATION_STATUS", "ads helper foundation status");
  includes(runbook, "foundation-only", "ads runbook foundation");
  includes(runbook, "No Edge Function", "ads runbook no edge");
  includes(runbook, "No scheduler", "ads runbook no scheduler");
  notIncludes(packageJson, "ads-sponsor-delivery-operator:watch-once", "ads foundation package watch script");
  if (exists("supabase/functions/ads-sponsor-delivery-operator/index.ts")) failures.push("ads foundation has a live Edge Function");
  if (/ad_impressions|sponsor_payments|sponsor_checkout_sessions|ad_revenue/i.test(read("supabase/migrations/20260713013807_autonomous_coverage_expansion_operators.sql"))) {
    failures.push("ads foundation migration appears to create live ad/sponsor revenue tables");
  }
} else {
  const migration = read("supabase/migrations/20260713013807_autonomous_coverage_expansion_operators.sql");
  const edge = read(config.functionPath);
  const cli = read("scripts/scoped-autonomous-operator-cli.mjs");
  const approval = read("_lib/autonomousApprovalRequests.ts");
  const approvalFn = read("supabase/functions/autonomous-approval-request/index.ts");

  includes(block, 'status: "scoped_write_capable_guarded"', "registry active status");
  includes(block, 'activeActivationMode: "manual_cli"', "registry manual activation");
  includes(block, "ownerApprovalRequired: true", "registry approval gate");
  includes(approval, `"${config.id}"`, "approval requester model");
  includes(approvalFn, `"${config.id}"`, "approval function whitelist");
  includes(edge, config.tokenHeader, "edge token header");
  includes(edge, config.tokenHashEnv, "edge token hash env");
  includes(edge, "handleScopedOperatorRequest", "edge shared safe handler");
  includes(edge, "watch_once", "edge watch_once action");
  includes(cli, `systemId: "${config.id}"`, "CLI system config");
  includes(cli, config.tokenHashEnv.replace("_SHA256", ""), "CLI token env name");
  if (highRiskDirectPattern.test(edge)) failures.push(`${config.id} edge contains direct high-risk execution pattern`);
  for (const pattern of config.forbiddenExecutionPatterns) {
    if (pattern.test(edge + "\n" + helper)) failures.push(`${config.id} contains forbidden direct execution pattern ${pattern}`);
  }
  for (const table of config.tables) {
    includes(migration, `public.${table}`, "migration table");
    includes(migration, `alter table public.${table} enable row level security`, "RLS enabled");
  }
  includes(migration, "safe_table_name || '_fake_proof_false'", "fake proof dynamic invariant");
  includes(migration, "from anon, authenticated", "client write denial");
  includes(migration, "to service_role", "trusted write scope");
  includes(migration, "check (fake_proof = false)", "fake proof DB check");
  includes(migration, "check (high_risk_executed = false)", "high risk DB check");
  includes(migration, "check (money_moved = false)", "money DB check");
  includes(migration, "check (user_rights_changed = false)", "rights DB check");
  if (/grant all on table[\s\S]{0,120}(anon|authenticated)/i.test(migration)) failures.push(`${config.id} migration grants broad client access`);
  if (/schedulerStatus:\s*"chillywood-[^"]*timer/i.test(block)) failures.push(`${config.id} claims scheduled activation without local systemd proof`);
  notIncludes(edge, "fakeProof: true", "edge fake proof");
  notIncludes(edge, "moneyMoved: true", "edge money movement");
  notIncludes(edge, "userRightsChanged: true", "edge rights mutation");
}

const secretScanSource = registryDoc + "\n" + operatingModel + "\n" + runbook + "\n" + helper;
if (/sk_live_|whsec_|BEGIN PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY\s*=|SIGNED_URL=|signed_url:\s*https?:/i.test(secretScanSource)) {
  failures.push(`${config.id} docs/helper contain secret-like literal`);
}

if (failures.length) {
  console.error(`${config.guardScript} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`${config.guardScript} passed`);
