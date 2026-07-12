#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const failures = [];
const fail = (message) => failures.push(message);
const includes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
};
const notIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include: ${needle}`);
};
const matches = (source, pattern, label) => {
  if (!pattern.test(source)) fail(`${label} must match ${pattern}`);
};

const registry = read("_lib/autonomousSystemsRegistry.ts");
const approvalModel = read("_lib/autonomousApprovalRequests.ts");
const approvalFunction = read("supabase/functions/autonomous-approval-request/index.ts");
const approvalMigration = [
  read("supabase/migrations/20260711173119_autonomous_approval_requests.sql"),
  read("supabase/migrations/20260711185503_autonomous_approval_live_flow.sql"),
  read("supabase/migrations/20260711193000_money_flow_control_approval_scope.sql"),
].join("\n\n");
const ownerAuthority = read("_lib/platformOwnerAuthority.ts");
const moneyFlowControl = read("_lib/moneyFlowControl.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const moneyRunbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const operatingModel = read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md");
const ownerAdminSpec = read("docs/owner-admin-rachi-implementation-spec.md");
const livekitRunbook = read("docs/LIVEKIT_AUTONOMOUS_OPERATOR_RUNBOOK.md");
const mediaRunbook = read("docs/MEDIA_AUTOMATION_OPERATOR_RUNBOOK.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const livekitGuard = read("scripts/guard-livekit-autonomous-operator-policy.mjs");
const mediaGuard = read("scripts/guard-media-delivery-architecture.mjs");
const objectStorageGuard = read("scripts/guard-media-object-storage-migration.mjs");
const vodGuard = read("scripts/guard-vod-quality-policy.mjs");

const docs = [
  registryDoc,
  moneyRunbook,
  operatingModel,
  ownerAdminSpec,
  livekitRunbook,
  mediaRunbook,
  currentState,
  nextTask,
].join("\n\n");

for (const systemId of ["media_automation", "livekit_operator", "money_flow_control"]) {
  includes(registry, `id: "${systemId}"`, "autonomous registry");
  includes(registryDoc, `\`${systemId}\``, "autonomous registry doc");
}

for (const required of [
  "media scan",
  "catalog readiness",
  "auto-detect planning",
  "source-aware rendition ladder",
  "transcode worker",
  "media_renditions audit",
  "R2 public/free playback",
  "Premium protected HD rows",
  "object-storage R2 migration/readiness",
  "backup/restore",
]) {
  includes(registry, required, "media automation allowed surfaces");
}

for (const required of [
  "live_stage",
  "watch_party_live",
  "party_room_live_sidecar",
  "chat_call",
  "livekit_token",
  "livekit_router",
  "heartbeat_monitor",
  "host_agent",
  "render_telemetry",
]) {
  includes(registry, required, "livekit operator required surfaces");
}

for (const required of [
  "premium_revenue",
  "revenuecat_entitlements_readback",
  "google_play_receipts_readback",
  "stripe_connect_foundation",
  "creator_payout_ledger",
  "payout_review_queue",
  "payout_batches",
  "provider_transfer_records",
  "network_billing",
  "sponsor_deals",
  "fraud_holds",
  "usage_metering",
  "refunds_disputes_future",
  "tax_compliance_future",
  "provider_access_broker",
  "provider_dashboard_readback",
  "provider_test_delivery_status",
]) {
  includes(registry, required, "money flow required surfaces");
}

for (const required of [
  "backup/restore",
  "scan/moderation",
  "audit before trust",
  "rollback/quarantine",
  "kill switch/emergency stop",
  "fallback",
  "secret scan",
]) {
  includes(registry, required, "media automation required gates");
}

for (const forbidden of [
  "private/Premium/original public exposure",
  "unscanned/moderation-blocked processing",
  "broad uncapped backfill",
  "fake audit pass",
  "deleting private source objects without approval",
  "billing/Premium/auth/RLS/payout changes",
]) {
  includes(registry, forbidden, "media automation forbidden scopes");
}

for (const required of [
  "narrow token",
  "constant-time token validation",
  "RLS/client-write deny",
  "audit every action",
  "safe recovery only",
  "learning cannot override Level 3/4 owner approval",
  "scheduler status must match actual installed systemd/GitHub/Cloudflare state",
]) {
  includes(registry, required, "livekit operator required gates");
}

for (const forbidden of [
  "fake heartbeat",
  "stale cutoff loosening",
  "broad DB mutation",
  "marking unhealthy server active without host proof",
  "secret rotation",
  "TURN credential changes",
  "provider/server replacement",
  "Premium bypass",
  "R2/media writes",
  "auto-source OTA without policy gate",
]) {
  includes(registry, forbidden, "livekit operator forbidden scopes");
}

for (const forbidden of [
  "fake MRR/ARR",
  "fake creator earnings",
  "fake payable balance",
  "fake paid status",
  "fake transfer complete",
  "manual Premium grant",
  "real money movement without Level 4",
  "payout release without provider confirmation",
  "charging customers from foundation tables",
  "marking test-mode data as production",
]) {
  includes(registry, forbidden, "money flow forbidden scopes");
}

for (const required of [
  "owner/super-admin approval for Level 3",
  "owner/super-admin approval plus external provider confirmation for Level 4",
  "fresh preflight before execution",
  "exact scope match",
  "emergency stop blocks non-read-only money mutations",
  "provider readback before money movement closure",
  "no manual Premium grants",
  "no fake revenue/earnings/payable balances",
]) {
  includes(registry, required, "money flow required gates");
}

for (const script of [
  "proof:media-automation-controller",
  "proof:media-automation-cli",
  "proof:media-object-storage-zero-hetzner",
  "guard:media-delivery-architecture",
  "guard:media-object-storage-migration",
  "guard:vod-quality-policy",
  "proof:livekit-autonomous-operator",
  "proof:livekit-surface-health",
  "proof:livekit-render-telemetry",
  "proof:livekit-operator-recovery-loop",
  "guard:livekit-autonomous-operator-policy",
  "guard:livekit-heartbeat-monitor-policy",
  "guard:watch-party-livekit-camera",
  "proof:money-flow-control",
  "proof:money-operator-write-scope",
  "proof:money-external-confirmation",
  "guard:money-flow-control",
  "proof:autonomous-systems-contract",
  "proof:autonomous-approval-live-flow",
  "guard:autonomous-systems-contract",
]) {
  includes(packageJson, `"${script}"`, "package script wiring");
  includes(registry + registryDoc + packageJson, script, "registry script references");
}

for (const expansionField of [
  "system id",
  "action/surface id",
  "activation mode",
  "allowed read scope",
  "allowed write scope",
  "forbidden scope",
  "approval level",
  "proof script",
  "guard script",
  "rollback/quarantine behavior",
  "kill switch/fallback behavior",
  "owner/admin approval requirement for Level 3/4",
]) {
  includes(registry, expansionField, "expansion rules in registry");
  includes(registryDoc, expansionField, "expansion rules in doc");
}

for (const highRisk of [
  "auth/RLS",
  "billing/provider",
  "Premium entitlement",
  "payout/cashout",
  "destructive DB",
  "public/private exposure",
  "app store/public release",
  "provider plan/add-on",
]) {
  includes(registry, highRisk, "high-risk domains");
  includes(registryDoc, highRisk, "high-risk domains doc");
}

matches(registry, /approvalLevel:\s*3[\s\S]*ownerApprovalRequired:\s*true/, "Level 3 owner approval registry entry");
matches(registry, /approvalLevel:\s*4[\s\S]*ownerApprovalRequired:\s*true/, "Level 4 owner approval registry entry");
notIncludes(registry, "approvalLevel: 0,\n        allowedWriteScope: [\"auth/RLS", "high-risk auth/RLS Level 0 write");
notIncludes(registry, "approvalLevel: 1,\n        allowedWriteScope: [\"billing", "high-risk billing Level 1 write");
notIncludes(registry, "approvalLevel: 2,\n        allowedWriteScope: [\"Premium entitlement", "high-risk Premium Level 2 write");
matches(registry, /id:\s*"production_money_setup_or_policy_mutation"[\s\S]*approvalLevel:\s*3[\s\S]*ownerApprovalRequired:\s*true/, "Level 3 money setup registry entry");
matches(registry, /id:\s*"real_money_movement_or_public_money_launch"[\s\S]*approvalLevel:\s*4[\s\S]*ownerApprovalRequired:\s*true/, "Level 4 money movement registry entry");
matches(registry, /id:\s*"scoped_money_operator_reconciliation_writes"[\s\S]*approvalLevel:\s*2[\s\S]*money_reconciliation_findings[\s\S]*money_required_review_flags/, "scoped money operator writes registry entry");
matches(registry, /id:\s*"provider_webhook_reliability_loop"[\s\S]*approvalLevel:\s*2[\s\S]*money_provider_sync_status[\s\S]*money_reconciliation_findings[\s\S]*provider dashboard mutation without owner approval/, "provider webhook reliability loop registry entry");
matches(registry, /id:\s*"provider_access_broker"[\s\S]*approvalLevel:\s*2[\s\S]*provider_access_capabilities[\s\S]*provider_access_audit_events[\s\S]*provider_dashboard_repair_requests/, "provider access broker registry entry");
includes(moneyFlowControl, "unknown_money_action_defaults_level_4", "money helper unknown action safety");
includes(moneyFlowControl, "external_provider_confirmation_required_for_level_4", "money helper Level 4 confirmation");
includes(moneyFlowControl, "manual_premium_grant_forbidden", "money helper Premium grant block");
includes(moneyFlowControl, "fake_creator_earnings_forbidden", "money helper fake earnings block");
includes(moneyFlowControl, "MONEY_OPERATOR_ALLOWED_WRITE_TABLES", "money helper scoped operator writes");
includes(moneyFlowControl, "MONEY_OPERATOR_FORBIDDEN_WRITE_SCOPES", "money helper forbidden operator writes");
includes(moneyFlowControl, "MONEY_PROVIDER_RELIABILITY_SURFACES", "money helper provider reliability surfaces");
includes(moneyFlowControl, "providerAccessBroker", "money helper provider access broker summary");

for (const required of [
  "autonomous_approval_requests",
  "autonomous_approval_request_events",
  "autonomous_system_emergency_states",
  "autonomous_system_control_events",
  "approval_level integer not null check (approval_level in (3, 4))",
  "enable row level security",
  "revoke all on table public.autonomous_approval_requests from anon, authenticated",
  "revoke all on table public.autonomous_approval_request_events from anon, authenticated",
  "revoke all on table public.autonomous_system_emergency_states from anon, authenticated",
  "grant select, insert, update on table public.autonomous_approval_requests to service_role",
  "grant select, insert on table public.autonomous_approval_request_events to service_role",
  "autonomous_approval_requests_no_self_approval",
  "autonomous_actor_has_owner_authority",
  "approve_autonomous_approval_request",
  "deny_autonomous_approval_request",
  "mark_autonomous_approval_preflight_result",
  "mark_autonomous_approval_request_executed",
  "set_autonomous_system_emergency_state",
  "money_flow_control",
]) {
  includes(approvalMigration, required, "approval request migration");
}

for (const required of [
  "x-autonomous-approval-token",
  "AUTONOMOUS_APPROVAL_REQUEST_TOKEN_SHA256",
  "OPS_APPROVAL_TOKEN",
  "constantTimeEqual",
  "authorizeOwnerOrSuperAdmin",
  "owner_or_super_admin_required",
  "live_owner_super_admin_backed",
  "create_request",
  "list_pending",
  "get_request",
  "approve_request",
  "deny_request",
  "cancel_request",
  "mark_preflight_result",
  "mark_executed",
  "expire_old_requests",
  "emergency_pause_system",
  "resume_system",
]) {
  includes(approvalFunction, required, "approval request function");
}

for (const required of [
  "canActorApproveAutonomousRequest",
  "canExecuteApprovedAutonomousRequest",
  "sanitizeAutonomousApprovalMetadata",
  "Rachi can request/recommend but cannot approve itself",
  "operatorSelfApprovalAllowed: false",
  "executionRequiresFreshPreflight: true",
  "executionRequiresExactScopeMatch: true",
  "emergencyStopBlocksExecution: true",
]) {
  includes(approvalModel, required, "approval request model");
}

for (const required of [
  "canUserReviewAutonomousApproval",
  "canUserApproveAutonomousRequest",
  "canUserDenyAutonomousRequest",
  "hasOwnerOrSuperAdminAuthority",
]) {
  includes(ownerAuthority, required, "owner/super-admin authority helper");
}

for (const testId of [
  "admin-autonomous-approvals-section",
  "autonomous-approval-request-card",
  "autonomous-approval-approve-button",
  "autonomous-approval-deny-button",
  "autonomous-approval-cancel-button",
  "autonomous-approval-emergency-pause-button",
  "autonomous-approval-resume-button",
  "autonomous-approval-risk-summary",
  "autonomous-approval-rollback-plan",
  "autonomous-approval-proof-plan",
  "autonomous-approval-event-history",
  "autonomous-approval-owner-locked-copy",
]) {
  includes(admin, testId, "admin approval foundation testID");
}
includes(admin, "approvalExecutionStatus === \"live_owner_super_admin_backed\"", "admin live status");
includes(admin, "Owner or Super Admin role is required", "admin owner locked copy");
notIncludes(admin, "/admin-command-center", "admin route duplication");

for (const doctrine of [
  "Owner / Super Admin is above Rachi",
  "Rachi is an internal AI operations layer, never the final authority",
  "platform_role_memberships",
  "backed by `platform_role_memberships` owner/super-admin authority",
]) {
  includes(ownerAdminSpec, doctrine, "owner/admin doctrine");
}

for (const docNeedle of [
  "autonomous systems are protected by registry/contract guard",
  "future scope can be added only through registry entries",
  "Level 3/4 actions create owner/admin approval requests",
  "Rachi can recommend/request but cannot approve itself",
  "owner authority remains above Rachi/operator",
  "approval backing status",
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "Real money movement requires Level 4",
  "external provider confirmation",
  "no manual Premium grant",
]) {
  includes(docs, docNeedle, "autonomous docs");
}

includes(livekitGuard, "fake heartbeat", "existing LiveKit guard");
includes(livekitGuard, "level >= 3", "existing LiveKit Level 3 guard");
includes(mediaGuard, "private/Premium/original public exposure", "existing media guard");
includes(objectStorageGuard, "do not shut down Hetzner LiveKit", "existing object storage guard");
includes(vodGuard, "Premium", "existing VOD guard");

for (const corpus of [registry, approvalModel, approvalFunction, approvalMigration, registryDoc, docs]) {
  notIncludes(corpus, "eyJhbGci", "secret/token artifact");
  notIncludes(corpus, "postgres://", "database URL artifact");
  notIncludes(corpus, "postgresql://", "database URL artifact");
}

if (failures.length) {
  console.error("Autonomous systems contract guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Autonomous systems contract guard passed.");
