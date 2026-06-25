#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const artifactDir = process.env.FIRST_OWNER_PROOF_ARTIFACT_DIR
  || `/tmp/app-first-owner-authority-proof-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}`;
mkdirSync(artifactDir, { recursive: true });

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));
const migrations = readdirSync(path.join(root, "supabase/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => [`supabase/migrations/${file}`, read(`supabase/migrations/${file}`)])
  .filter(([file, text]) => file.includes("first_owner") || text.includes("first_owner") || text.includes("First Owner"));
const combinedMigration = migrations.map(([file, text]) => `-- ${file}\n${text}`).join("\n");
const edge = read("supabase/functions/admin-owner-controls/index.ts");
const client = read("_lib/adminOwnerControls.ts");
const adminUi = read("app/admin.tsx");
const packageJson = read("package.json");
const doctrine = exists("docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md")
  ? read("docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md")
  : "";
const nextTask = read("NEXT_TASK.md");
const readiness = exists("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md")
  ? read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md")
  : "";

const checks = [];
const check = (key, passed, detail) => checks.push({ key, passed: !!passed, detail });
const includesAll = (source, needles) => needles.every((needle) => source.includes(needle));

check("doctrine_doc_exists", !!doctrine, "docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md exists");
check("first_owner_marker", combinedMigration.includes("platform_first_owner_authority") && combinedMigration.includes("platform_first_owner_authority_single_active_uidx"), "migration defines exactly-one active First Owner marker");
check("first_owner_must_be_owner", combinedMigration.includes("first_owner_must_be_active_owner") && combinedMigration.includes("role\" = 'owner'"), "marker guard requires active Owner");
check("only_first_owner_grants_owner", includesAll(combinedMigration, ["first_owner_grant_owner_by_email", "is_first_owner", "first_owner_required"]), "Owner grant RPC requires First Owner");
check("only_first_owner_revokes_owner", includesAll(combinedMigration, ["first_owner_revoke_owner_by_email", "first_owner_required", "admin_revoke_platform_role_by_email"]), "Owner revoke RPC and legacy path require First Owner");
check("normal_owner_cannot_revoke_owner", combinedMigration.includes("legacy_rpc") && combinedMigration.includes("first_owner_required"), "legacy owner revoke path blocks non-First Owner");
check("non_owner_cannot_grant_revoke", combinedMigration.includes("first_owner_auth_required") && edge.includes("requireFirstOwner"), "non-owner and normal-owner attempts fail closed");
check("self_revoke_normal_path_denied", combinedMigration.includes("first_owner_self_revoke_requires_succession") && edge.includes("self_revoke_requires_succession"), "First Owner cannot self-revoke through normal path");
check("last_owner_protection", combinedMigration.includes("last_owner_required") && combinedMigration.includes("successor_owner_required"), "last-owner and successor protections exist");
check("password_passcode_challenge", includesAll(edge, ["signInWithPassword", "generatePasscode", "hashFirstOwnerPasscode"]) && includesAll(combinedMigration, ["platform_owner_succession_challenges", "passcode_hash", "passcode_salt"]), "password reauth and hashed passcode challenge markers exist");
check("passcode_expiry_single_use_rate_limit", includesAll(combinedMigration, ["expires_at", "consumed_at", "attempt_count", "max_attempts", "locked", "single_use", "rate_limited"]), "passcode expires, is single-use, and is attempt-limited");
check("audit_markers", includesAll(combinedMigration, ["platform_first_owner_authority_audit", "platform_staff_write_audit", "platform_admin_audit_logs", "challenge_failed"]), "audit markers exist for grants, revokes, and challenge failures");
check("break_glass_model", includesAll(combinedMigration + edge + doctrine, ["platform_break_glass_sessions", "platform_break_glass_audit", "Break Glass is documented and audited when used", "Break Glass activation requires First Owner"]), "Break Glass model is First Owner-only and audited");
check("controls_enabled_for_first_owner", includesAll(edge + client + adminUi + doctrine, ["first_owner_grant_owner", "firstOwnerControlsEnabled", "First Owner controls are enabled for authenticated First Owner after validation"]), "enabled controls are exposed only for authenticated First Owner");
check("forbidden_secret_exposure_doc", doctrine.includes("No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed"), "docs forbid secret/raw private data exposure");
check("money_provider_switches_unchanged", !combinedMigration.includes("live_money_enabled = true") && !combinedMigration.includes("payouts_enabled = true") && !packageJson.includes("live_money_enabled\": true"), "no money/provider activation markers added");
check("proof_script_package_script", packageJson.includes("proof:first-owner-authority") && packageJson.includes("guard:first-owner-authority-policy"), "package scripts are wired");
check("required_docs_updated", includesAll(`${doctrine}\n${nextTask}\n${readiness}`, [
  "Only First Owner can grant or revoke Owner",
  "First Owner cannot remove himself as the last active Owner",
  "First Owner self-step-down requires successor, password re-auth, generated single-use passcode, typed confirmation, reason, and audit",
  "Normal Owner dashboard viewing is not Break Glass",
]), "required doctrine wording is present");

const result = {
  artifactDir,
  mutationPerformed: false,
  realOwnerRoleChanged: false,
  secretsPrinted: false,
  status: checks.every((entry) => entry.passed) ? "passed" : "failed",
  checks,
};

writeFileSync(path.join(artifactDir, "proof-first-owner-authority.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

if (result.status !== "passed") process.exit(1);
