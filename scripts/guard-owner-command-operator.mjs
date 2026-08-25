#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const fail = (message) => failures.push(message);
const includes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
};
const matches = (source, pattern, label) => {
  if (!pattern.test(source)) fail(`${label} malformed`);
};
const notIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include: ${needle}`);
};

const requiredFiles = [
  "_lib/ownerCommandOperator.ts",
  "supabase/functions/owner-command-operator/index.ts",
  "supabase/migrations/20260712180500_owner_command_operator.sql",
  "scripts/owner-command-cli.mjs",
  "docs/OWNER_COMMAND_OPERATOR_RUNBOOK.md",
];

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) fail(`required file missing: ${file}`);
}

const helper = read("_lib/ownerCommandOperator.ts");
const fn = read("supabase/functions/owner-command-operator/index.ts");
const exactSubjectAuthority = read(
  "supabase/functions/_shared/exact-subject-authority.ts",
);
const migration = read("supabase/migrations/20260712180500_owner_command_operator.sql");
const cli = read("scripts/owner-command-cli.mjs");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const runbook = existsSync(path.join(root, "docs/OWNER_COMMAND_OPERATOR_RUNBOOK.md")) ? read("docs/OWNER_COMMAND_OPERATOR_RUNBOOK.md") : "";
const registry = read("_lib/autonomousSystemsRegistry.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");

for (const phrase of [
  'id: "owner_command_operator"',
  'status: "scoped_command_router_guarded"',
  'activeActivationMode: "manual_cli"',
  "no_scheduler_no_daemon_no_worker_manual_or_owner_invoked_only",
  "direct target-table mutation outside routed operator",
  "bypassing target autonomous operator",
  "high_risk_owner_command_request",
  "real_world_or_external_impact_owner_command",
]) includes(registry, phrase, "owner command registry protection");

includes(registryDoc, "`owner_command_operator`", "owner command registry docs");
includes(registryDoc, "protected scoped command-routing control plane", "owner command registry docs");

for (const systemId of [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
  "observability_runtime_operator",
  "installed_product_qa_operator",
  "platform_recovery_operator",
  "privacy_compliance_operator",
  "support_success_operator",
  "search_ranking_integrity_operator",
  "ads_sponsor_delivery_operator",
]) {
  includes(helper, `"${systemId}"`, "owner command helper active system routing");
  includes(fn, `"${systemId}"`, "owner command function active system routing");
}

for (const phrase of [
  "authorizeOwnerOrSuperAdmin",
  "owner_or_super_admin_required",
  "x-owner-command-operator-token",
  "OWNER_COMMAND_OPERATOR_TOKEN_SHA256",
  "constantTimeEqual",
]) includes(fn, phrase, "owner/trusted auth");

matches(
  fn,
  /import\s*\{\s*readExactCurrentSessionAuthority,\s*readExactPlatformRole,\s*\}\s*from\s*"\.\.\/_shared\/exact-subject-authority\.ts";/u,
  "owner command exact-subject authority import",
);
matches(
  fn,
  /const authorizeOwnerOrSuperAdmin = async[\s\S]*?global: \{ headers: \{ Authorization: `Bearer \$\{bearer\}` \} \}[\s\S]*?const \{ data: userData, error: userError \} = await actorClient\.auth\.getUser\(\);[\s\S]*?!\(await readExactCurrentSessionAuthority\(actorClient, user\.id\)\)[\s\S]*?const userId = user\.id;[\s\S]*?const role = await readExactPlatformRole\(client, userId, \["owner", "super_admin"\]\);[\s\S]*?role !== "owner" && role !== "super_admin"/u,
  "owner command exact live-session and role delegation",
);

for (const phrase of [
  'actorClient.rpc("wave1_session_authority_readback")',
  "authority.authoritative !== true",
  'toText(authority.state) !== "ACTIVE"',
  "authority.restoreOnly !== false",
  "authorityUserId !== subjectId",
  "authorityAccountId !== subjectId",
  "const sessionGeneration = normalizeExactSubjectId(authority.sessionGeneration)",
  "!sessionGeneration",
  "return parseExactCurrentSessionAuthority(result.data, expectedUserId)",
  '.from("platform_role_memberships")',
  '.select("user_id,role,status,expires_at")',
  '.eq("user_id", subjectId)',
  '.eq("status", "active")',
  '.in("role", roles)',
  "normalizeExactSubjectId(row.user_id) === subjectId",
  'toText(row.status).toLowerCase() === "active"',
  "toText(row.role).toLowerCase() === role",
  "isUnexpired(row.expires_at, nowMs)",
  "return resolveExactPlatformRole(result.data, subjectId, roles, nowMs)",
]) includes(exactSubjectAuthority, phrase, "shared exact-subject authority");

for (const phrase of [
  "approvalRequest",
  "approval_request_required",
  "owner_approval_required",
  "external_confirmation_required",
  "approval_expired",
  "preflight_passed_target_operator_execution_required",
  "requested_by_actor_type: \"owner_command_operator\"",
]) includes(fn, phrase, "approval/external gates");

for (const source of [helper, fn]) {
  includes(source, "ADS_SPONSOR_ACTIVATION_PATTERNS", "ads/sponsor activation high-risk pattern");
  includes(source, "ads_sponsor_delivery_operator", "ads/sponsor foundation routing");
}

for (const phrase of [
  "direct_mutation_performed: false",
  "direct_domain_mutation: false",
  "highRiskExecuted: false",
  "moneyMoved: false",
]) includes(fn, phrase, "no direct high-risk execution");

for (const phrase of [
  "revoke all on table public.owner_command_requests from anon, authenticated",
  "revoke all on table public.owner_command_events from anon, authenticated",
  "revoke all on table public.owner_command_execution_steps from anon, authenticated",
  "revoke all on table public.owner_command_blockers from anon, authenticated",
  "grant select, insert, update on table public.owner_command_requests to service_role",
]) includes(migration, phrase, "RLS client write denial");

for (const phrase of [
  "OWNER_COMMAND_OWNER_JWT",
  "OWNER_COMMAND_OPERATOR_TOKEN",
  "owner_command_owner_jwt_required",
]) includes(cli, phrase, "CLI fail-closed auth");

for (const script of [
  "owner-command:classify",
  "owner-command:plan",
  "owner-command:dry-run",
  "owner-command:execute-approved",
]) includes(packageJson, `"${script}"`, "owner command package script");

for (const id of [
  "admin-owner-command-center-section",
  "owner-command-input",
  "owner-command-execute-button",
  "owner-command-blockers",
  "owner-command-proof-report",
]) includes(admin, id, "admin command UI");

for (const forbidden of [
  "stripe.transfers.create",
  "stripe.paymentLinks.create",
  "stripe.checkout.sessions.create",
  "stripe.payouts.create",
  "supabase.auth.admin",
  "createSignedUrl",
  "eas update",
  "expo publish",
  "ban_user",
  "delete_content",
  "manual_premium_grant",
]) notIncludes(fn, forbidden, "owner command function forbidden direct mutation");

for (const forbidden of [
  "OWNER_COMMAND_OPERATOR_TOKEN=",
  "OWNER_COMMAND_OWNER_JWT=",
  "service_role_key",
  "SUPABASE_SERVICE_ROLE_KEY=",
]) {
  notIncludes(cli, forbidden, "owner command CLI secret literal");
  notIncludes(runbook, forbidden, "owner command runbook secret literal");
}

for (const phrase of [
  "Owner makes judgment",
  "no god mode",
  "Level 3",
  "Level 4",
  "external confirmation",
  "routes through existing autonomous systems",
  "exact blocker",
]) includes(runbook, phrase, "owner command runbook");

if (failures.length) {
  console.error("guard:owner-command-operator failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("guard:owner-command-operator passed");
