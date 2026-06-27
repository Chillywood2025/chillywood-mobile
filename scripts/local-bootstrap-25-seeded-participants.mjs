#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile, writeSafeBrowserStackEnvValue } from "./qa/browserstack-env.mjs";

const root = process.cwd();
const envPath = path.join(root, ".env.browserstack-monetization.local");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.TWENTY_FIVE_SEEDED_PARTICIPANTS_ARTIFACT_DIR
  || path.join("/tmp", `app-25-seeded-participants-bootstrap-${timestamp}`);

const PARTICIPANTS = Array.from({ length: 25 }, (_, index) => {
  const n = String(index + 1).padStart(3, "0");
  return {
    label: `proof_participant_${n}`,
    displayName: `Proof Participant ${n}`,
    email: `proof_participant_${n}@chillywood.test`,
    emailKey: `CHILLYWOOD_E2E_PARTICIPANT_${n}_EMAIL`,
    userIdKey: `CHILLYWOOD_E2E_PARTICIPANT_${n}_USER_ID`,
    passwordKey: `CHILLYWOOD_E2E_PARTICIPANT_${n}_PASSWORD`,
  };
});

// Guard anchors: proof_participant_001@chillywood.test through proof_participant_025@chillywood.test.
const PROOF_EMAILS = new Set(PARTICIPANTS.map((account) => account.email));

function loadEnv() {
  return [
    ".env.local",
    ".env.proof.local",
    ".env.final-qa-proof.local",
    ".env.money-proof.local",
    ".env.browserstack.local",
    ".env.browserstack-monetization.local",
  ].reduce((acc, file) => ({ ...acc, ...parseEnvFile(path.join(root, file)) }), { ...process.env });
}

function nowIso() {
  return new Date().toISOString();
}

function generatePassword() {
  return `CwRt25-${randomBytes(24).toString("base64url")}-26`;
}

function suffix(value) {
  return String(value ?? "").slice(-8) || null;
}

function assertLocalAllowed(env) {
  if (process.env.CI && env.CHILLYWOOD_ALLOW_CI_SERVICE_ROLE_PROOF_FIXTURE_BOOTSTRAP !== "true") {
    throw new Error("refusing_service_role_bootstrap_in_ci");
  }
  if (env.CHILLYWOOD_ALLOW_SERVICE_ROLE_PROOF_FIXTURE_BOOTSTRAP !== "true") {
    throw new Error("missing_CHILLYWOOD_ALLOW_SERVICE_ROLE_PROOF_FIXTURE_BOOTSTRAP_true");
  }
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!String(env[key] ?? "").trim()) throw new Error(`missing_${key}`);
  }
}

function assertProofEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!PROOF_EMAILS.has(normalized)) throw new Error(`refusing_non_participant_proof_email:${normalized || "<empty>"}`);
  return normalized;
}

async function requireOk(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}:${error.message}`);
  return data;
}

async function findUserFromProfile(admin, account, env) {
  const knownUserId = String(env[account.userIdKey] ?? "").trim();
  if (knownUserId) return knownUserId;
  const { data, error } = await admin
    .from("user_profiles")
    .select("user_id")
    .eq("username", account.label)
    .maybeSingle();
  if (!error && data?.user_id) return String(data.user_id);
  return null;
}

async function findUserByRecoveryLink(admin, account) {
  const { data, error } = await admin.auth.admin.generateLink({
    email: assertProofEmail(account.email),
    type: "recovery",
  });
  if (error) return null;
  return data?.user ?? null;
}

async function upsertParticipantUser(admin, account, password, env) {
  const email = assertProofEmail(account.email);
  const metadata = {
    account_label: account.label,
    no_money: true,
    no_payout: true,
    no_provider_mutation: true,
    proof_only: true,
    realtime_participant_pack: true,
    role: "proof_participant",
    service_account: false,
    shared_account: false,
  };
  const knownUserId = await findUserFromProfile(admin, account, env);
  if (knownUserId) {
    const { data, error } = await admin.auth.admin.updateUserById(knownUserId, {
      app_metadata: metadata,
      email,
      email_confirm: true,
      password,
      user_metadata: { display_name: account.displayName, proof_label: account.label },
    });
    if (error) throw new Error(`update_user_failed:${account.label}:${error.message}`);
    return { action: "repaired", user: data.user };
  }

  const created = await admin.auth.admin.createUser({
    app_metadata: metadata,
    email,
    email_confirm: true,
    password,
    user_metadata: { display_name: account.displayName, proof_label: account.label },
  });
  if (!created.error) return { action: "created", user: created.data.user };

  const message = String(created.error.message ?? "");
  if (!/already|registered|exists|duplicate/i.test(message)) {
    throw new Error(`create_user_failed:${account.label}:${message}`);
  }

  const existing = await findUserByRecoveryLink(admin, account);
  if (!existing?.id) throw new Error(`existing_auth_user_without_local_profile_or_user_id:${account.label}`);
  const updated = await admin.auth.admin.updateUserById(existing.id, {
    app_metadata: { ...(existing.app_metadata ?? {}), ...metadata },
    email,
    email_confirm: true,
    password,
    user_metadata: { ...(existing.user_metadata ?? {}), display_name: account.displayName, proof_label: account.label },
  });
  if (updated.error) throw new Error(`update_existing_auth_user_failed:${account.label}:${updated.error.message}`);
  return { action: "repaired_orphan", user: updated.data.user };
}

async function ensureParticipantProfile(admin, account, userId) {
  return requireOk(`upsert_profile:${account.label}`, admin
    .from("user_profiles")
    .upsert({
      channel_role: "viewer",
      display_name: account.displayName,
      follower_surface_enabled: true,
      platform_access_visibility: "private",
      profile_access_visibility: "private",
      profile_visibility: "private",
      subscriber_surface_enabled: false,
      tagline: `${account.displayName} proof-only realtime participant`,
      updated_at: nowIso(),
      user_id: userId,
      username: account.label,
    }, { onConflict: "user_id" })
    .select("user_id,username,channel_role")
    .single());
}

async function ensureNoPremium(admin, userId) {
  await requireOk("delete_participant_premium_entitlement", admin
    .from("user_entitlements")
    .delete()
    .eq("user_id", userId)
    .eq("entitlement_key", "premium"));
}

async function ensureNoStaff(admin, account, userId) {
  await admin
    .from("platform_role_memberships")
    .update({
      notes: "Revoked by proof-only 25 seeded participant pack repair; participants must not hold staff authority.",
      revoked_at: nowIso(),
      status: "revoked",
      updated_at: nowIso(),
    })
    .or(`email.eq.${account.email},user_id.eq.${userId}`)
    .in("role", ["owner", "operator", "moderator"]);
}

async function countRows(admin, table, build) {
  const { count, error } = await build(admin.from(table).select("*", { count: "exact", head: true }));
  return { count: error ? null : count ?? 0, error: error?.message ?? null, ok: !error };
}

async function main() {
  mkdirSync(artifactDir, { recursive: true });
  const env = loadEnv();
  assertLocalAllowed(env);
  if (!existsSync(envPath)) writeFileSync(envPath, "", { mode: 0o600 });
  chmodSync(envPath, 0o600);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = [];
  for (const account of PARTICIPANTS) {
    const password = String(env[account.passwordKey] ?? "").trim() || generatePassword();
    const { action, user } = await upsertParticipantUser(admin, account, password, env);
    await ensureParticipantProfile(admin, account, user.id);
    await ensureNoPremium(admin, user.id);
    await ensureNoStaff(admin, account, user.id);
    writeSafeBrowserStackEnvValue(envPath, account.emailKey, account.email);
    writeSafeBrowserStackEnvValue(envPath, account.userIdKey, user.id);
    writeSafeBrowserStackEnvValue(envPath, account.passwordKey, password);
    rows.push({
      emailKey: account.emailKey,
      label: account.label,
      passwordStoredInIgnoredEnv: true,
      profile: "ready",
      userIdKey: account.userIdKey,
      userIdSuffix: suffix(user.id),
      userAction: action,
    });
  }
  chmodSync(envPath, 0o600);

  const safety = {
    liveMoneyOnSwitches: await countRows(admin, "platform_money_kill_switches", (query) => query.eq("key", "live_money_enabled").eq("state", "on")),
    payableLedgerEvents: await countRows(admin, "money_access_ledger_events", (query) => query.in("payable_state", ["payable", "paid"])),
    staffRoleLeaks: await countRows(admin, "platform_role_memberships", (query) => query
      .in("email", PARTICIPANTS.map((account) => account.email))
      .eq("status", "active")
      .in("role", ["owner", "operator", "moderator"])),
  };

  const summary = {
    accountCount: rows.length,
    artifactDir,
    envPath: ".env.browserstack-monetization.local",
    firstOwnerTouched: false,
    noProviderMutation: true,
    noRealUsersModified: true,
    noSecretsPrinted: true,
    participants: rows,
    serviceRoleBootstrapBoundary: "proof-only account creation/repair; not role/permission authority proof",
    status: rows.length === 25 && safety.staffRoleLeaks.count === 0 ? "pass" : "partial",
    safety,
  };
  writeFileSync(path.join(artifactDir, "participant-bootstrap-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(artifactDir, "README.md"), [
    "# 25 Seeded Participant Bootstrap",
    "",
    `Status: ${summary.status}`,
    "",
    "This artifact is sanitized. It does not contain passwords, service-role keys, tokens, provider secrets, signed URLs, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction records.",
    "",
  ].join("\n"));

  console.log(JSON.stringify({
    accountCount: rows.length,
    artifact: artifactDir,
    firstOwnerTouched: false,
    realUsersModified: false,
    serviceRoleBootstrapUsed: true,
    status: summary.status,
    valuesPrinted: false,
  }, null, 2));

  if (summary.status !== "pass") process.exit(1);
}

main().catch((error) => {
  mkdirSync(artifactDir, { recursive: true });
  const failure = {
    artifact: artifactDir,
    error: error instanceof Error ? error.message : String(error),
    firstOwnerTouched: false,
    realUsersModified: false,
    status: "blocked",
    valuesPrinted: false,
  };
  writeFileSync(path.join(artifactDir, "participant-bootstrap-summary.json"), `${JSON.stringify(failure, null, 2)}\n`);
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
