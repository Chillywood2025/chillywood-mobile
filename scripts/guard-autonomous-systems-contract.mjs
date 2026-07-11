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
const approvalMigration = read("supabase/migrations/20260711173119_autonomous_approval_requests.sql");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
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
  operatingModel,
  ownerAdminSpec,
  livekitRunbook,
  mediaRunbook,
  currentState,
  nextTask,
].join("\n\n");

for (const systemId of ["media_automation", "livekit_operator"]) {
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
  "proof:autonomous-systems-contract",
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

for (const required of [
  "autonomous_approval_requests",
  "autonomous_approval_request_events",
  "approval_level integer not null check (approval_level in (3, 4))",
  "enable row level security",
  "revoke all on table public.autonomous_approval_requests from anon, authenticated",
  "revoke all on table public.autonomous_approval_request_events from anon, authenticated",
  "grant select, insert, update on table public.autonomous_approval_requests to service_role",
  "grant select, insert on table public.autonomous_approval_request_events to service_role",
  "autonomous_approval_requests_no_self_approval",
]) {
  includes(approvalMigration, required, "approval request migration");
}

for (const required of [
  "x-autonomous-approval-token",
  "AUTONOMOUS_APPROVAL_REQUEST_TOKEN_SHA256",
  "constantTimeEqual",
  "owner_approval_execution_foundation_only",
  "explicit_owner_super_admin_backing_incomplete",
  "rachiCanApprove: false",
  "operatorSelfApprovalAllowed: false",
  "create_request",
  "read_pending",
  "cancel_request",
  "expire_old_requests",
  "execution_requires_live_owner_approval_backing",
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
]) {
  includes(approvalModel, required, "approval request model");
}

for (const testId of [
  "admin-autonomous-approvals-section",
  "autonomous-approval-request-card",
  "autonomous-approval-approve-button",
  "autonomous-approval-deny-button",
  "autonomous-approval-risk-summary",
  "autonomous-approval-rollback-plan",
]) {
  includes(admin, testId, "admin approval foundation testID");
}
includes(admin, "approvalExecutionStatus === \"foundation_only\"", "admin foundation status");
includes(admin, "Approval execution is source-proof/foundation-only", "admin foundation copy");
notIncludes(admin, "/admin-command-center", "admin route duplication");

for (const doctrine of [
  "Owner / Super Admin is above Rachi",
  "Rachi is an internal AI operations layer, never the final authority",
  "platform_role_memberships",
  "explicit owner / super-admin role truth",
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
