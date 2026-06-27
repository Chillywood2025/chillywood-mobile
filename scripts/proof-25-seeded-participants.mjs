#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile } from "./qa/browserstack-env.mjs";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.TWENTY_FIVE_SEEDED_PARTICIPANTS_PROOF_DIR
  || path.join("/tmp", `app-25-seeded-participants-proof-${timestamp}`);

const PARTICIPANTS = Array.from({ length: 25 }, (_, index) => {
  const n = String(index + 1).padStart(3, "0");
  return {
    label: `proof_participant_${n}`,
    email: `proof_participant_${n}@chillywood.test`,
    emailKey: `CHILLYWOOD_E2E_PARTICIPANT_${n}_EMAIL`,
    passwordKey: `CHILLYWOOD_E2E_PARTICIPANT_${n}_PASSWORD`,
    userIdKey: `CHILLYWOOD_E2E_PARTICIPANT_${n}_USER_ID`,
  };
});

// Guard anchors: proof_participant_001 through proof_participant_025.
const ROLE_ACCOUNTS = [
  ["proof_creator_001", "CHILLYWOOD_E2E_CREATOR_EMAIL", "CHILLYWOOD_E2E_CREATOR_PASSWORD", "CHILLYWOOD_E2E_CREATOR_USER_ID"],
  ["proof_moderator_001", "CHILLYWOOD_E2E_MODERATOR_EMAIL", "CHILLYWOOD_E2E_MODERATOR_PASSWORD", "CHILLYWOOD_E2E_MODERATOR_USER_ID"],
  ["proof_admin_operator_001", "CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL", "CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD", "CHILLYWOOD_E2E_ADMIN_OPERATOR_USER_ID"],
  ["proof_owner_001", "CHILLYWOOD_E2E_OWNER_EMAIL", "CHILLYWOOD_E2E_OWNER_PASSWORD", "CHILLYWOOD_E2E_OWNER_USER_ID"],
  ["proof_premium_001", "CHILLYWOOD_E2E_PREMIUM_EMAIL", "CHILLYWOOD_E2E_PREMIUM_PASSWORD", "CHILLYWOOD_E2E_PREMIUM_USER_ID"],
  ["proof_nonpremium_001", "CHILLYWOOD_E2E_NONPREMIUM_EMAIL", "CHILLYWOOD_E2E_NONPREMIUM_PASSWORD", "CHILLYWOOD_E2E_NONPREMIUM_USER_ID"],
  ["proof_blocked_a_001", "CHILLYWOOD_E2E_BLOCKED_A_EMAIL", "CHILLYWOOD_E2E_BLOCKED_A_PASSWORD", "CHILLYWOOD_E2E_BLOCKED_A_USER_ID"],
  ["proof_blocked_b_001", "CHILLYWOOD_E2E_BLOCKED_B_EMAIL", "CHILLYWOOD_E2E_BLOCKED_B_PASSWORD", "CHILLYWOOD_E2E_BLOCKED_B_USER_ID"],
  ["proof_restricted_001", "CHILLYWOOD_E2E_RESTRICTED_EMAIL", "CHILLYWOOD_E2E_RESTRICTED_PASSWORD", "CHILLYWOOD_E2E_RESTRICTED_USER_ID"],
].map(([label, emailKey, passwordKey, userIdKey]) => ({ label, emailKey, passwordKey, userIdKey }));

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

const present = (value) => String(value ?? "").trim().length > 0;
const suffix = (value) => String(value ?? "").slice(-8) || null;

async function maybeSingle(admin, table, select, build) {
  const { data, error } = await build(admin.from(table).select(select).limit(1)).maybeSingle();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, data };
}

async function countRows(admin, table, build) {
  const { count, error } = await build(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) return { ok: false, error: error.message, count: null };
  return { ok: true, count: count ?? 0 };
}

async function main() {
  mkdirSync(artifactDir, { recursive: true });
  const env = loadEnv();
  const failures = [];
  const adminAvailable = present(env.SUPABASE_URL) && present(env.SUPABASE_SERVICE_ROLE_KEY);
  const admin = adminAvailable
    ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  const participantRows = [];
  for (const account of PARTICIPANTS) {
    const email = env[account.emailKey];
    const password = env[account.passwordKey];
    const userId = env[account.userIdKey];
    const row = {
      emailKeyPresent: present(email),
      emailMatches: String(email ?? "").trim().toLowerCase() === account.email,
      label: account.label,
      passwordKeyPresent: present(password),
      profile: "not_checked",
      staffRoleStatus: "not_checked",
      userIdKeyPresent: present(userId),
      userIdSuffix: suffix(userId),
      usable: false,
    };
    if (!row.emailKeyPresent || !row.passwordKeyPresent || !row.userIdKeyPresent || !row.emailMatches) {
      row.profile = "missing_local_keys";
      participantRows.push(row);
      failures.push(`${account.label} missing local credential readiness`);
      continue;
    }
    if (admin) {
      const profile = await maybeSingle(admin, "user_profiles", "user_id,username,channel_role", (query) => query.eq("user_id", userId));
      row.profile = profile.ok && profile.data?.username === account.label && profile.data?.channel_role === "viewer" ? "ready" : "missing_or_wrong";
      const staff = await countRows(admin, "platform_role_memberships", (query) => query
        .or(`email.eq.${account.email},user_id.eq.${userId}`)
        .eq("status", "active")
        .in("role", ["owner", "operator", "moderator"]));
      row.staffRoleStatus = staff.ok && staff.count === 0 ? "none" : "unexpected_or_unreadable";
      if (row.profile !== "ready") failures.push(`${account.label} profile not ready`);
      if (row.staffRoleStatus !== "none") failures.push(`${account.label} has unexpected staff role or unreadable staff role state`);
    }
    row.usable = row.emailKeyPresent && row.passwordKeyPresent && row.userIdKeyPresent && row.emailMatches && (!admin || (row.profile === "ready" && row.staffRoleStatus === "none"));
    participantRows.push(row);
  }

  const roleRows = ROLE_ACCOUNTS.map((account) => ({
    emailKeyPresent: present(env[account.emailKey]),
    label: account.label,
    passwordKeyPresent: present(env[account.passwordKey]),
    userIdKeyPresent: present(env[account.userIdKey]),
    userIdSuffix: suffix(env[account.userIdKey]),
  }));
  for (const row of roleRows) {
    if (!row.emailKeyPresent || !row.passwordKeyPresent || !row.userIdKeyPresent) {
      failures.push(`${row.label} missing role-account local key readiness`);
    }
  }

  if (admin) {
    const liveMoney = await countRows(admin, "platform_money_kill_switches", (query) => query.eq("key", "live_money_enabled").eq("state", "on"));
    if (!liveMoney.ok || liveMoney.count !== 0) failures.push("liveMoneyEnabled appears ON or unreadable");
  }

  const summary = {
    accountCount: participantRows.length,
    adminReadbackAvailable: Boolean(admin),
    artifactDir,
    failures,
    participantRows,
    roleRows,
    status: failures.length ? "failed" : "passed",
    valuesPrinted: false,
  };
  writeFileSync(path.join(artifactDir, "25-seeded-participants-proof.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(artifactDir, "README.md"), [
    "# 25 Seeded Participants Proof",
    "",
    `Status: ${summary.status}`,
    "",
    "This artifact contains key presence, redacted user id suffixes, and readiness only. It contains no passwords, service-role keys, tokens, provider secrets, signed URLs, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction records.",
    "",
  ].join("\n"));

  if (failures.length) {
    console.error(JSON.stringify({ artifact: artifactDir, status: summary.status, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    artifact: artifactDir,
    participantCount: participantRows.length,
    roleAccountCount: roleRows.length,
    status: summary.status,
    valuesPrinted: false,
  }, null, 2));
}

main().catch((error) => {
  mkdirSync(artifactDir, { recursive: true });
  const failure = {
    artifact: artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "blocked",
    valuesPrinted: false,
  };
  writeFileSync(path.join(artifactDir, "25-seeded-participants-proof.json"), `${JSON.stringify(failure, null, 2)}\n`);
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
