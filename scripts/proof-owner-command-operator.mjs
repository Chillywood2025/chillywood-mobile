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
const matches = (source, pattern, label) => {
  if (!pattern.test(source)) fail(`${label} malformed`);
};

const helper = read("_lib/ownerCommandOperator.ts");
const fn = read("supabase/functions/owner-command-operator/index.ts");
const exactSubjectAuthority = read(
  "supabase/functions/_shared/exact-subject-authority.ts",
);
const migration = read("supabase/migrations/20260712180500_owner_command_operator.sql");
const admin = read("app/admin.tsx");
const pkg = read("package.json");
const config = read("supabase/config.toml");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");

for (const symbol of [
  "classifyOwnerCommandIntent",
  "classifyOwnerCommandRisk",
  "mapOwnerCommandToAutonomousSystems",
  "buildOwnerCommandExecutionPlan",
  "validateOwnerCommandScope",
  "buildOwnerCommandApprovalRequest",
  "executeOwnerCommandDryRun",
  "executeOwnerCommandIfApproved",
  "sanitizeOwnerCommandProof",
]) includes(helper, `export const ${symbol}`, "owner command helper");

for (const phrase of [
  'id: "owner_command_operator"',
  'status: "scoped_command_router_guarded"',
  "owner_command_classification",
  "owner_command_approval_request_creation",
  "direct target-table mutation outside routed operator",
  "real_world_or_external_impact_owner_command",
]) includes(registry, phrase, "owner command registry protection");

includes(registryDoc, "`owner_command_operator`", "owner command registry docs");
includes(registryDoc, "protected scoped command-routing control plane", "owner command registry docs");

for (const table of [
  "owner_command_requests",
  "owner_command_events",
  "owner_command_execution_steps",
  "owner_command_blockers",
]) {
  includes(migration, `create table if not exists public.${table}`, "owner command migration");
  includes(migration, `alter table public.${table} enable row level security`, "owner command RLS");
  includes(migration, `revoke all on table public.${table} from anon, authenticated`, "client write denial");
}

for (const field of [
  "owner_user_id",
  "command_text",
  "normalized_intent",
  "target_systems",
  "approval_level",
  "allowed_scope",
  "forbidden_scope",
  "preflight_plan",
  "execution_plan",
  "rollback_plan",
  "proof_plan",
  "validation_plan",
  "approval_request_id",
  "external_confirmation_required",
  "external_confirmation_status",
]) includes(migration, field, "owner command request fields");

for (const phrase of [
  "OWNER_COMMAND_OPERATOR_TOKEN_SHA256",
  "x-owner-command-operator-token",
  "authorizeOwnerOrSuperAdmin",
  "createApprovalRequestForCommand",
  "autonomous_approval_requests",
  "requested_by_actor_type: \"owner_command_operator\"",
  "owner_command_events",
  "owner_command_execution_steps",
  "owner_command_blockers",
  "moneyMoved: false",
  "highRiskExecuted: false",
  "direct_mutation_performed: false",
]) includes(fn, phrase, "owner command edge function");

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
  "const queryRoles = Array.from(new Set([",
  '!roles.includes("super_admin") && roles.includes("operator") ? ["super_admin"] : []',
  '.in("role", queryRoles)',
  "normalizeExactSubjectId(row.user_id) === subjectId",
  'toText(row.status).toLowerCase() === "active"',
  "toText(row.role).toLowerCase() === role",
  "isUnexpired(row.expires_at, nowMs)",
  'hasExactActiveRole(rows, subjectId, "super_admin", nowMs)',
  'return "operator"',
  "return resolveExactPlatformRole(result.data, subjectId, roles, nowMs)",
]) includes(exactSubjectAuthority, phrase, "shared exact-subject authority");

for (const action of [
  "create_command",
  "classify_command",
  "plan_command",
  "dry_run_command",
  "create_approval_request",
  "execute_approved_command",
  "cancel_command",
  "command_status",
  "command_report",
]) includes(fn, action, "owner command actions");

for (const id of [
  "admin-owner-command-center-section",
  "owner-command-input",
  "owner-command-classify-button",
  "owner-command-plan-button",
  "owner-command-dry-run-button",
  "owner-command-execute-button",
  "owner-command-risk-level",
  "owner-command-target-systems",
  "owner-command-blockers",
  "owner-command-proof-report",
  "owner-command-event-history",
]) includes(admin, id, "admin owner command UI");

for (const script of [
  "proof:owner-command-operator",
  "proof:owner-command-routing",
  "proof:owner-command-approval-gates",
  "guard:owner-command-operator",
  "owner-command:classify",
  "owner-command:plan",
  "owner-command:dry-run",
  "owner-command:execute-approved",
  "owner-command:status",
  "owner-command:report",
]) includes(pkg, `"${script}"`, "owner command package wiring");

includes(config, "[functions.owner-command-operator]", "supabase config");
includes(config, "verify_jwt = false", "supabase config custom auth");

if (failures.length) {
  console.error("proof:owner-command-operator failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:owner-command-operator passed");
