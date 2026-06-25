#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20260625131000_first_owner_authority_succession.sql");
const edge = read("supabase/functions/admin-owner-controls/index.ts");
const ui = read("app/admin.tsx");
const doctrine = read("docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md");
const readiness = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const packageJson = read("package.json");

const failures = [];
const fail = (message) => failures.push(message);
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
};
const forbidText = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include: ${needle}`);
};

requireText(migration, "platform_first_owner_authority_single_active_uidx", "First Owner migration");
requireText(migration, "first_owner_must_be_active_owner", "First Owner marker guard");
requireText(migration, "first_owner_grant_owner_by_email", "Owner grant RPC");
requireText(migration, "first_owner_revoke_owner_by_email", "Owner revoke RPC");
requireText(migration, "admin_revoke_platform_role_by_email", "legacy revoke RPC override");
requireText(migration, "first_owner_self_revoke_requires_succession", "self-revoke denial");
requireText(migration, "last_owner_required", "last-owner protection");
requireText(migration, "successor_owner_required", "successor requirement");
requireText(migration, "passcode_hash", "passcode hash storage");
requireText(migration, "passcode_salt", "passcode salt storage");
requireText(migration, "consumed_at", "single-use challenge");
requireText(migration, "attempt_count", "rate-limited attempts");
requireText(migration, "expires_at", "challenge expiry");
requireText(migration, "challenge_failed", "failed attempt audit");
requireText(edge, "requireFirstOwner", "Edge First Owner gate");
requireText(edge, "signInWithPassword", "password reauth");
requireText(edge, "generatePasscode", "generated passcode");
requireText(edge, "hashFirstOwnerPasscode", "Edge passcode hashing");
requireText(edge, "Break Glass activation requires First Owner", "First Owner Break Glass gate");
requireText(ui, "firstOwnerControlsEnabled", "UI First Owner enabled state");
requireText(doctrine, "Only First Owner can grant or revoke Owner", "doctrine");
requireText(doctrine, "First Owner cannot remove himself as the last active Owner", "doctrine");
requireText(doctrine, "Normal Owner dashboard viewing is not Break Glass", "doctrine");
requireText(doctrine, "Break Glass is documented and audited when used", "doctrine");
requireText(doctrine, "No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed", "doctrine");
requireText(readiness, "First Owner controls are enabled for authenticated First Owner after validation", "readiness checklist");
requireText(packageJson, "proof:first-owner-authority", "package scripts");

forbidText(migration, '"passcode_plaintext" text', "First Owner migration");
forbidText(migration, "passcode_plaintext text", "First Owner migration");
forbidText(migration, "live_money_enabled = true", "First Owner migration");
forbidText(migration, "payouts_enabled = true", "First Owner migration");
forbidText(doctrine.toLowerCase(), "secrets are visible", "doctrine");
forbidText(doctrine.toLowerCase(), "raw ips are visible", "doctrine");
forbidText(doctrine.toLowerCase(), "tokens are visible", "doctrine");

if (failures.length) {
  console.error("First Owner authority policy guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("First Owner authority policy guard passed.");
