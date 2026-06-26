#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  parseEnvFile,
  writeSafeBrowserStackEnvValue,
} from "./qa/browserstack-env.mjs";

const root = process.cwd();
const localEnvPath = path.join(root, ".env.browserstack-monetization.local");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.STAFF_PROOF_FIXTURE_BOOTSTRAP_ARTIFACT_DIR
  || path.join("/tmp", `app-seeded-staff-proof-fixture-bootstrap-full-traversal-${timestamp}`);
const confirmationKey = "CHILLYWOOD_ALLOW_SERVICE_ROLE_PROOF_FIXTURE_BOOTSTRAP";

mkdirSync(artifactDir, { recursive: true });

const env = [
  ".env.local",
  ".env.proof.local",
  ".env.final-qa-proof.local",
  ".env.money-proof.local",
  ".env.browserstack-monetization.local",
].reduce((acc, file) => ({ ...acc, ...parseEnvFile(path.join(root, file)) }), { ...process.env });

const redactEmail = (email) => String(email ?? "").replace(/^([^@]{2})[^@]*(@.*)$/u, "$1…$2");
const shortId = (value) => {
  const text = String(value ?? "");
  return text ? `${text.slice(0, 8)}…${text.slice(-4)}` : null;
};
const writeJson = (name, value) => {
  writeFileSync(path.join(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`);
};
const writeText = (name, value) => {
  writeFileSync(path.join(artifactDir, name), `${String(value ?? "")}\n`);
};

const bootstrapPlan = {
  status: "planned",
  method: "service-role proof fixture bootstrap",
  proofOnly: true,
  ownerRpcGrantPathProved: false,
  allowedAccounts: [
    "proof_moderator_001@chillywood.test",
    "proof_admin_operator_001@chillywood.test",
  ],
  credentialTarget: ".env.browserstack-monetization.local",
};
writeJson("bootstrap-plan.json", bootstrapPlan);

if (env[confirmationKey] !== "true") {
  writeJson("bootstrap-summary.json", {
    status: "blocked",
    blocker: `${confirmationKey}=true is required in process env or ignored local env`,
    valuesPrinted: false,
  });
  console.error(`${confirmationKey}=true is required.`);
  process.exit(1);
}

const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((key) => !String(env[key] ?? "").trim());
if (missing.length) {
  writeJson("bootstrap-summary.json", {
    status: "blocked",
    blocker: `Missing required local secret keys: ${missing.join(", ")}`,
    valuesPrinted: false,
  });
  console.error(`Missing required local secret keys: ${missing.join(", ")}`);
  process.exit(1);
}

if (!existsSync(localEnvPath)) {
  writeFileSync(localEnvPath, "");
}

const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
const actor = {
  userId: "service-role-proof-fixture-bootstrap",
  email: "proof-fixture-bootstrap@chillywood.test",
  role: "service_role_fixture",
};
const accounts = [
  {
    label: "proof_moderator_001",
    email: "proof_moderator_001@chillywood.test",
    role: "moderator",
    displayName: "Proof Moderator",
    username: "proof_moderator_001",
    emailKey: "CHILLYWOOD_E2E_MODERATOR_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_MODERATOR_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_MODERATOR_PASSWORD",
    permissions: [
      "reports_review",
      "content_moderation",
      "live_ops",
    ],
  },
  {
    label: "proof_admin_operator_001",
    email: "proof_admin_operator_001@chillywood.test",
    role: "operator",
    displayName: "Proof Admin Operator",
    username: "proof_admin_operator_001",
    emailKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD",
    permissions: [
      "user_lookup",
      "support_inbox",
      "audit_review",
    ],
  },
];

function assertProofEmail(email) {
  if (!/^proof_(moderator|admin_operator)_001@chillywood\.test$/i.test(email)) {
    throw new Error(`refusing_non_proof_email:${email}`);
  }
}

function generatePassword() {
  return `CwStaffProof-${randomBytes(18).toString("base64url")}-26`;
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserIdByProfile(username) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();
  if (error) return null;
  return data?.user_id ? String(data.user_id) : null;
}

async function upsertAuthUser(account, password) {
  let userId = String(env[account.userIdKey] ?? "").trim() || await findUserIdByProfile(account.username);
  if (userId) {
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      email: account.email,
      email_confirm: true,
      password,
      app_metadata: {
        role: "proof_staff",
        proof_only: true,
        no_money: true,
        no_payout: true,
      },
      user_metadata: {
        display_name: account.displayName,
      },
    });
    if (error) throw new Error(`update_user_failed:${account.label}:${error.message}`);
    return { action: "updated", user: data.user };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    email_confirm: true,
    password,
    app_metadata: {
      role: "proof_staff",
      proof_only: true,
      no_money: true,
      no_payout: true,
    },
    user_metadata: {
      display_name: account.displayName,
    },
  });
  if (error) throw new Error(`create_user_failed:${account.label}:${error.message}`);
  return { action: "created", user: data.user };
}

async function upsertProfile(account, userId) {
  const { error } = await supabase.from("user_profiles").upsert({
    user_id: userId,
    username: account.username,
    display_name: account.displayName,
    channel_role: "viewer",
    profile_visibility: "private",
    profile_access_visibility: "private",
    platform_access_visibility: "private",
    subscriber_surface_enabled: false,
    follower_surface_enabled: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(`profile_upsert_failed:${account.label}:${error.message}`);
}

async function upsertRole(account, userId) {
  const now = new Date().toISOString();
  const reason = `Service-role proof fixture bootstrap for ${account.label}; short-lived installed-device traversal only.`;
  const existingByEmail = await supabase
    .from("platform_role_memberships")
    .select("id")
    .eq("role", account.role)
    .eq("email", account.email)
    .maybeSingle();
  const existingByUser = existingByEmail.data?.id ? existingByEmail : await supabase
    .from("platform_role_memberships")
    .select("id")
    .eq("role", account.role)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingByEmail.error && existingByEmail.error.code !== "PGRST116") {
    throw new Error(`role_lookup_failed:${account.label}:${existingByEmail.error.message}`);
  }
  if (existingByUser.error && existingByUser.error.code !== "PGRST116") {
    throw new Error(`role_lookup_failed:${account.label}:${existingByUser.error.message}`);
  }
  const existingId = existingByEmail.data?.id ?? existingByUser.data?.id ?? null;
  if (existingId) {
    const { error } = await supabase
      .from("platform_role_memberships")
      .update({
        user_id: userId,
        email: account.email,
        status: "active",
        notes: `${reason} Expires ${expiresAt}.`,
        granted_by: actor.userId,
        granted_at: now,
        updated_at: now,
        revoked_by: null,
        revoked_at: null,
      })
      .eq("id", existingId);
    if (error) throw new Error(`role_update_failed:${account.label}:${error.message}`);
    return;
  }
  const update = await supabase
    .from("platform_role_memberships")
    .update({
      user_id: userId,
      email: account.email,
      status: "active",
      notes: `${reason} Expires ${expiresAt}.`,
      granted_by: actor.userId,
      granted_at: now,
      updated_at: now,
      revoked_by: null,
      revoked_at: null,
    })
    .eq("role", account.role)
    .eq("email", account.email);
  if (update.error) throw new Error(`role_update_failed:${account.label}:${update.error.message}`);
  if ((update.count ?? 0) === 0) {
    const { error } = await supabase.from("platform_role_memberships").insert({
      role: account.role,
      user_id: userId,
      email: account.email,
      status: "active",
      notes: `${reason} Expires ${expiresAt}.`,
      granted_by: actor.userId,
      granted_at: now,
      updated_at: now,
    });
    if (error) throw new Error(`role_insert_failed:${account.label}:${error.message}`);
  }
}

async function upsertPermission(account, userId, permissionKey) {
  const now = new Date().toISOString();
  const reason = `Service-role proof fixture bootstrap for ${account.label}; short-lived installed-device traversal only.`;
  await supabase
    .from("platform_staff_permission_grants")
    .update({
      status: "revoked",
      revoked_by: actor.userId,
      revoked_at: now,
      updated_at: now,
    })
    .eq("target_email", account.email)
    .eq("permission_key", permissionKey)
    .eq("status", "active");
  const { error } = await supabase.from("platform_staff_permission_grants").insert({
    target_user_id: userId,
    target_email: account.email,
    permission_key: permissionKey,
    status: "active",
    reason,
    metadata: {
      proof_fixture: true,
      service_role_fixture_bootstrap: true,
      owner_rpc_grant_path_proved: false,
      no_money: true,
      no_provider_mutation: true,
    },
    granted_by: actor.userId,
    granted_at: now,
    expires_at: expiresAt,
    updated_at: now,
  });
  if (error) throw new Error(`permission_insert_failed:${account.label}:${permissionKey}:${error.message}`);
}

async function writeAudit(account, action, metadata = {}) {
  const { error } = await supabase.from("platform_admin_audit_logs").insert({
    actor_user_id: actor.userId,
    actor_email: actor.email,
    actor_role: actor.role,
    action,
    action_category: "role",
    target_type: "proof_staff_fixture",
    target_id: `${account.email}:${account.role}`,
    reason: "Service-role proof fixture bootstrap for installed Moderator/Admin traversal; not production staff provisioning.",
    severity: "notice",
    metadata: {
      proof_fixture: true,
      target_email: account.email,
      target_role: account.role,
      expires_at: expiresAt,
      owner_rpc_grant_path_proved: false,
      no_real_staff_changed: true,
      no_money: true,
      no_provider_mutation: true,
      ...metadata,
    },
  });
  return error ? { written: false, error: error.message } : { written: true };
}

try {
  const accountResults = [];
  const auditResults = [];
  for (const account of accounts) {
    assertProofEmail(account.email);
    const password = String(env[account.passwordKey] ?? "").trim() || generatePassword();
    const { action, user } = await upsertAuthUser(account, password);
    await upsertProfile(account, user.id);
    await upsertRole(account, user.id);
    for (const permission of account.permissions) {
      await upsertPermission(account, user.id, permission);
    }
    auditResults.push(await writeAudit(account, "service_role_proof_fixture_bootstrap", {
      permission_count: account.permissions.length,
      auth_action: action,
    }));
    writeSafeBrowserStackEnvValue(localEnvPath, account.emailKey, account.email);
    writeSafeBrowserStackEnvValue(localEnvPath, account.userIdKey, user.id);
    writeSafeBrowserStackEnvValue(localEnvPath, account.passwordKey, password);
    accountResults.push({
      label: account.label,
      email: account.email,
      userId: shortId(user.id),
      authAction: action,
      role: account.role === "operator" ? "admin/operator" : account.role,
      permissions: account.permissions,
      expiresAt,
      credentialKeysWritten: [account.emailKey, account.userIdKey, account.passwordKey],
    });
  }
  chmodSync(localEnvPath, 0o600);

  const credentialChecklist = Object.fromEntries(
    accounts.flatMap((account) => [account.emailKey, account.userIdKey, account.passwordKey])
      .map((key) => [key, { present: true, source: ".env.browserstack-monetization.local", value: "<redacted>" }]),
  );
  const summary = {
    status: "pass",
    serviceRoleFixtureBootstrapUsed: true,
    ownerRpcGrantPathProved: false,
    touchedOnlyProofAccounts: true,
    credentialsWrittenOnlyToIgnoredLocalEnv: true,
    passwordsPrinted: false,
    expiresAt,
    accounts: accountResults,
    audit: {
      supported: true,
      results: auditResults,
    },
    moneyProviderMutation: false,
  };
  writeJson("credential-key-presence-checklist.json", credentialChecklist);
  writeJson("proof-account-matrix.json", accountResults);
  writeJson("role-scope-expiry-summary.json", { expiresAt, accounts: accountResults });
  writeJson("audit-row-summary.json", summary.audit);
  writeText("README.md", [
    "# Seeded Staff Proof Fixture Bootstrap",
    "",
    "Service-role proof fixture bootstrap was used for proof-only `.test` accounts.",
    "This proves fixture availability for installed Moderator/Admin traversal.",
    "This does not prove the Owner RPC staff grant path.",
    `Expires: ${expiresAt}`,
  ].join("\n"));
  writeJson("bootstrap-summary.json", summary);
  console.log(JSON.stringify({
    artifact: artifactDir,
    status: "pass",
    serviceRoleFixtureBootstrapUsed: true,
    ownerRpcGrantPathProved: false,
    accounts: accountResults.map((account) => ({
      label: account.label,
      email: redactEmail(account.email),
      userId: account.userId,
      role: account.role,
      permissionCount: account.permissions.length,
    })),
    expiresAt,
    valuesPrinted: false,
  }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeJson("bootstrap-summary.json", {
    status: "blocked",
    blocker: message,
    serviceRoleFixtureBootstrapUsed: true,
    ownerRpcGrantPathProved: false,
    valuesPrinted: false,
  });
  console.error(message);
  process.exit(1);
}
