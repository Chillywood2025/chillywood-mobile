#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile } from "./qa/browserstack-env.mjs";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.STABLE_SEEDED_PROOF_ACCOUNT_PACK_PROOF_DIR
  || path.join("/tmp", `app-stable-seeded-proof-account-pack-proof-${timestamp}`);

const ACCOUNT_SPECS = [
  { label: "proof_normal_001", emailKey: "CHILLYWOOD_E2E_NORMAL_EMAIL", passwordKey: "CHILLYWOOD_E2E_NORMAL_PASSWORD", userIdKey: "CHILLYWOOD_E2E_NORMAL_USER_ID", staffRole: null, profileRole: "viewer", premium: false },
  { label: "proof_creator_001", emailKey: "CHILLYWOOD_E2E_CREATOR_EMAIL", passwordKey: "CHILLYWOOD_E2E_CREATOR_PASSWORD", userIdKey: "CHILLYWOOD_E2E_CREATOR_USER_ID", staffRole: null, profileRole: "creator", premium: false, creatorReady: true },
  { label: "proof_moderator_001", emailKey: "CHILLYWOOD_E2E_MODERATOR_EMAIL", passwordKey: "CHILLYWOOD_E2E_MODERATOR_PASSWORD", userIdKey: "CHILLYWOOD_E2E_MODERATOR_USER_ID", staffRole: "moderator", profileRole: "viewer", premium: false },
  { label: "proof_admin_operator_001", emailKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL", passwordKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD", userIdKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_USER_ID", staffRole: "operator", profileRole: "viewer", premium: false },
  { label: "proof_owner_001", emailKey: "CHILLYWOOD_E2E_OWNER_EMAIL", passwordKey: "CHILLYWOOD_E2E_OWNER_PASSWORD", userIdKey: "CHILLYWOOD_E2E_OWNER_USER_ID", staffRole: "owner", profileRole: "creator", premium: false },
  { label: "proof_restricted_001", emailKey: "CHILLYWOOD_E2E_RESTRICTED_EMAIL", passwordKey: "CHILLYWOOD_E2E_RESTRICTED_PASSWORD", userIdKey: "CHILLYWOOD_E2E_RESTRICTED_USER_ID", staffRole: null, profileRole: "viewer", restricted: true, premium: false },
  { label: "proof_blocked_a_001", emailKey: "CHILLYWOOD_E2E_BLOCKED_A_EMAIL", passwordKey: "CHILLYWOOD_E2E_BLOCKED_A_PASSWORD", userIdKey: "CHILLYWOOD_E2E_BLOCKED_A_USER_ID", staffRole: null, profileRole: "viewer", premium: false },
  { label: "proof_blocked_b_001", emailKey: "CHILLYWOOD_E2E_BLOCKED_B_EMAIL", passwordKey: "CHILLYWOOD_E2E_BLOCKED_B_PASSWORD", userIdKey: "CHILLYWOOD_E2E_BLOCKED_B_USER_ID", staffRole: null, profileRole: "viewer", premium: false },
  { label: "proof_premium_001", emailKey: "CHILLYWOOD_E2E_PREMIUM_EMAIL", passwordKey: "CHILLYWOOD_E2E_PREMIUM_PASSWORD", userIdKey: "CHILLYWOOD_E2E_PREMIUM_USER_ID", staffRole: null, profileRole: "viewer", premium: true },
  { label: "proof_nonpremium_001", emailKey: "CHILLYWOOD_E2E_NONPREMIUM_EMAIL", passwordKey: "CHILLYWOOD_E2E_NONPREMIUM_PASSWORD", userIdKey: "CHILLYWOOD_E2E_NONPREMIUM_USER_ID", staffRole: null, profileRole: "viewer", premium: false },
];

const safeEmail = (value, label) => String(value ?? "").trim().toLowerCase() === `${label}@chillywood.test`;
const present = (value) => String(value ?? "").trim().length > 0;
const suffix = (value) => String(value ?? "").slice(-8) || null;

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

async function countRows(admin, table, build) {
  const { count, error } = await build(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) return { ok: false, error: error.message, count: null };
  return { ok: true, count: count ?? 0 };
}

async function maybeSingle(admin, table, select, build) {
  const { data, error } = await build(admin.from(table).select(select).limit(1)).maybeSingle();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, data };
}

async function main() {
  mkdirSync(artifactDir, { recursive: true });
  const env = loadEnv();
  const failures = [];
  const rows = [];
  const requiredInfra = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  for (const key of requiredInfra) {
    if (!present(env[key])) failures.push(`Missing ${key}`);
  }
  const admin = failures.length
    ? null
    : createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  for (const spec of ACCOUNT_SPECS) {
    const email = env[spec.emailKey];
    const password = env[spec.passwordKey];
    const userId = env[spec.userIdKey];
    const status = {
      label: spec.label,
      emailKeyPresent: present(email),
      passwordKeyPresent: present(password),
      userIdKeyPresent: present(userId),
      emailMatchesProofLabel: safeEmail(email, spec.label),
      userIdSuffix: suffix(userId),
      authProfile: "not_checked",
      profileRole: null,
      staffRoleStatus: "not_expected",
      premiumStatus: "not_expected",
      creatorReady: spec.creatorReady ? "not_checked" : "not_expected",
      restrictedStatus: spec.restricted ? "not_checked" : "not_expected",
      usableForAutomation: false,
      blocker: null,
    };

    if (!status.emailKeyPresent || !status.passwordKeyPresent || !status.userIdKeyPresent || !status.emailMatchesProofLabel) {
      status.blocker = "missing_or_invalid_local_credential_keys";
      rows.push(status);
      failures.push(`${spec.label} missing credential/user id readiness`);
      continue;
    }

    if (!admin) {
      status.blocker = "service_role_readback_unavailable";
      rows.push(status);
      continue;
    }

    const profile = await maybeSingle(admin, "user_profiles", "user_id,username,channel_role,profile_access_visibility,platform_access_visibility", (query) => query.eq("user_id", userId));
    if (!profile.ok || !profile.data?.user_id) {
      status.authProfile = "missing";
      status.blocker = profile.error || "missing_user_profile";
      rows.push(status);
      failures.push(`${spec.label} profile missing`);
      continue;
    }
    status.authProfile = "present";
    status.profileRole = profile.data.channel_role;

    const roleRows = await admin
      .from("platform_role_memberships")
      .select("role,status,notes")
      .eq("email", String(email).toLowerCase())
      .eq("status", "active");
    const activeRoles = roleRows.error ? [] : roleRows.data ?? [];
    if (roleRows.error) failures.push(`${spec.label} role readback failed: ${roleRows.error.message}`);
    if (spec.staffRole) {
      status.staffRoleStatus = activeRoles.some((role) => role.role === spec.staffRole) ? "active" : "missing";
      if (status.staffRoleStatus !== "active") failures.push(`${spec.label} missing active ${spec.staffRole} role`);
    } else {
      const staffLeak = activeRoles.filter((role) => ["owner", "operator", "moderator"].includes(role.role));
      status.staffRoleStatus = staffLeak.length ? `unexpected:${staffLeak.map((role) => role.role).join(",")}` : "none";
      if (staffLeak.length) failures.push(`${spec.label} unexpectedly has staff role`);
    }

    const entitlement = await maybeSingle(admin, "user_entitlements", "entitlement_key,status,revoked_at,expires_at", (query) => query.eq("user_id", userId).eq("entitlement_key", "premium"));
    const activePremium = entitlement.ok && entitlement.data?.status === "active" && !entitlement.data?.revoked_at;
    status.premiumStatus = activePremium ? "active" : "none";
    if (spec.premium && !activePremium) failures.push(`${spec.label} missing active Premium test entitlement`);
    if (!spec.premium && activePremium) failures.push(`${spec.label} unexpectedly has active Premium entitlement`);

    if (spec.creatorReady) {
      const creatorMonetization = await countRows(admin, "creator_monetization_configs", (query) => query.eq("creator_id", userId).eq("environment", "sandbox"));
      status.creatorReady = creatorMonetization.ok && creatorMonetization.count > 0 ? "sandbox_config_present" : "missing";
      if (status.creatorReady === "missing") failures.push(`${spec.label} missing creator sandbox config`);
    }

    if (spec.restricted) {
      const restricted = await admin.rpc("account_access_status_readback", { p_user_id: userId });
      const restrictedOk = !restricted.error && restricted.data?.restricted === true;
      status.restrictedStatus = restrictedOk ? "restricted" : "not_restricted";
      if (!restrictedOk) failures.push(`${spec.label} missing restricted/suspended state`);
    }

    status.usableForAutomation = !status.blocker
      && status.authProfile === "present"
      && (!spec.staffRole || status.staffRoleStatus === "active")
      && (spec.premium ? status.premiumStatus === "active" : status.premiumStatus === "none")
      && (!spec.creatorReady || status.creatorReady === "sandbox_config_present")
      && (!spec.restricted || status.restrictedStatus === "restricted");
    rows.push(status);
  }

  if (admin) {
    const aId = env.CHILLYWOOD_E2E_BLOCKED_A_USER_ID;
    const bId = env.CHILLYWOOD_E2E_BLOCKED_B_USER_ID;
    const blockPair = await countRows(admin, "channel_audience_blocks", (query) => query
      .or(`and(channel_user_id.eq.${aId},blocked_user_id.eq.${bId}),and(channel_user_id.eq.${bId},blocked_user_id.eq.${aId})`));
    if (!blockPair.ok || blockPair.count < 2) failures.push("Blocked A/B relationship missing");

    const liveMoney = await countRows(admin, "platform_money_kill_switches", (query) => query.eq("key", "live_money_enabled").eq("state", "on"));
    if (!liveMoney.ok || liveMoney.count !== 0) failures.push("liveMoneyEnabled appears ON or could not be read");
  }

  const summary = {
    status: failures.length ? "failed" : "passed",
    artifactDir,
    accountCount: ACCOUNT_SPECS.length,
    usableAccounts: rows.filter((row) => row.usableForAutomation).length,
    readinessTable: rows,
    boundaries: {
      serviceRoleBootstrapAuthorityClaimed: false,
      serviceRoleBootstrapIsRolePermissionAuthorityProof: false,
      ownerRpcStaffGrantPathRemainsAuthorityProof: true,
      secretsPrinted: false,
      providerMutation: false,
      liveMoneyEnabled: false,
      payoutsCashoutStripeProduction: false,
      currentFirstOwnerTouched: false,
      realUsersModified: false,
    },
    failures,
  };

  writeFileSync(path.join(artifactDir, "stable-seeded-proof-account-pack-proof.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(artifactDir, "README.md"), [
    "# Stable Seeded Proof Account Pack Proof",
    "",
    `Status: ${summary.status}`,
    "",
    "This artifact is sanitized and contains no passwords, tokens, service-role keys, provider secrets, signed URLs, raw IPs, private evidence, private messages, tax IDs, bank details, or provider transaction records.",
    "",
  ].join("\n"));

  if (failures.length) {
    console.error(JSON.stringify({ artifact: artifactDir, status: summary.status, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    artifact: artifactDir,
    status: summary.status,
    accountCount: summary.accountCount,
    usableAccounts: summary.usableAccounts,
    valuesPrinted: false,
  }, null, 2));
}

main().catch((error) => {
  mkdirSync(artifactDir, { recursive: true });
  const failure = {
    status: "blocked",
    artifact: artifactDir,
    error: error instanceof Error ? error.message : String(error),
    valuesPrinted: false,
  };
  writeFileSync(path.join(artifactDir, "stable-seeded-proof-account-pack-proof.json"), `${JSON.stringify(failure, null, 2)}\n`);
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
