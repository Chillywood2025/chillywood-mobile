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
const envPath = path.join(root, ".env.browserstack-monetization.local");
const artifactDir = process.env.PROOF_ACCOUNT_PROVISION_ARTIFACT_DIR
  || path.join("/tmp", `app-owner-admin-moderator-proof-account-provision-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`);

mkdirSync(artifactDir, { recursive: true });

const env = [
  ".env.local",
  ".env.proof.local",
  ".env.final-qa-proof.local",
  ".env.money-proof.local",
  ".env.browserstack-monetization.local",
].reduce((acc, file) => ({ ...acc, ...parseEnvFile(path.join(root, file)) }), { ...process.env });

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "CHILLYWOOD_E2E_OWNER_EMAIL",
  "CHILLYWOOD_E2E_OWNER_PASSWORD",
];

const missing = required.filter((key) => !String(env[key] ?? "").trim());
if (missing.length) {
  writeFileSync(path.join(artifactDir, "provision-summary.json"), `${JSON.stringify({
    status: "blocked",
    missing,
  }, null, 2)}\n`);
  console.error(`Missing required local secret keys: ${missing.join(", ")}`);
  process.exit(1);
}

const accounts = [
  {
    label: "proof_moderator_001",
    email: "proof_moderator_001@chillywood.test",
    role: "moderator",
    displayName: "Proof Moderator",
    emailKey: "CHILLYWOOD_E2E_MODERATOR_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_MODERATOR_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_MODERATOR_PASSWORD",
    permissions: [
      "reports_review",
      "content_moderation",
      "live_ops",
      "admin.content.hide",
      "admin.content.restore",
      "admin.comment.moderate",
      "admin.room.moderate",
      "admin.live.force_end",
    ],
  },
  {
    label: "proof_admin_operator_001",
    email: "proof_admin_operator_001@chillywood.test",
    role: "operator",
    displayName: "Proof Admin Operator",
    emailKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD",
    permissions: [
      "admin.user.search",
      "admin.user.view",
      "admin.support.view",
      "admin.audit.view",
      "audit_review",
      "security_review",
    ],
  },
];

function assertSafeProofEmail(email) {
  if (!/^proof_(moderator|admin_operator)_001@chillywood\.test$/i.test(email)) {
    throw new Error(`refusing_non_proof_email:${email}`);
  }
}

function generatePassword() {
  return `CwProof-${randomBytes(18).toString("base64url")}-26`;
}

async function upsertProofUser(admin, account, password) {
  assertSafeProofEmail(account.email);
  const metadata = {
    role: "proof_staff",
    proof_only: true,
    shared_account: false,
    service_account: false,
    no_payout: true,
    no_money: true,
  };
  let knownUserId = String(env[account.userIdKey] ?? "").trim();
  if (!knownUserId) {
    const { data, error } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("username", account.email.split("@")[0])
      .maybeSingle();
    if (!error && data?.user_id) knownUserId = String(data.user_id);
  }
  if (knownUserId) {
    const { data, error } = await admin.auth.admin.updateUserById(knownUserId, {
      email_confirm: true,
      password,
      app_metadata: {
        ...metadata,
      },
      user_metadata: {
        display_name: account.displayName,
      },
    });
    if (error) throw new Error(`update_user_failed:${account.label}:${error.message}`);
    return { action: "updated", user: data.user };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    app_metadata: metadata,
    user_metadata: { display_name: account.displayName },
  });
  if (error) throw new Error(`create_user_failed:${account.label}:${error.message}`);
  return { action: "created", user: data.user };
}

async function ensureProfile(admin, account, userId) {
  const { error } = await admin
    .from("user_profiles")
    .upsert({
      user_id: userId,
      username: account.email.split("@")[0],
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

async function grantRole(ownerClient, account) {
  const { data, error } = await ownerClient.rpc("admin_grant_platform_role_by_email", {
    p_target_email: account.email,
    p_role: account.role,
    p_reason: `Seeded installed-device proof role for ${account.label}; proof-only account, no money/provider mutation.`,
  });
  if (error) throw new Error(`grant_role_failed:${account.label}:${error.message}`);
  return data;
}

async function grantPermission(ownerClient, account, permissionKey) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await ownerClient.rpc("admin_grant_platform_staff_permission_by_email", {
    p_target_email: account.email,
    p_permission_key: permissionKey,
    p_reason: `Seeded installed-device proof scoped permission for ${account.label}; proof-only and expires automatically where backed.`,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`grant_permission_failed:${account.label}:${permissionKey}:${error.message}`);
  return data;
}

const serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ownerClient = createClient(env.SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  const ownerSignIn = await ownerClient.auth.signInWithPassword({
    email: env.CHILLYWOOD_E2E_OWNER_EMAIL,
    password: env.CHILLYWOOD_E2E_OWNER_PASSWORD,
  });
  if (ownerSignIn.error || !ownerSignIn.data?.user?.id) {
    throw new Error(`owner_sign_in_failed:${ownerSignIn.error?.message ?? "missing_user"}`);
  }

  const results = [];
  for (const account of accounts) {
    const password = String(env[account.passwordKey] ?? "").trim() || generatePassword();
    const { action, user } = await upsertProofUser(serviceClient, account, password);
    await ensureProfile(serviceClient, account, user.id);
    const roleGrant = await grantRole(ownerClient, account);
    const permissionResults = [];
    for (const permission of account.permissions) {
      permissionResults.push(await grantPermission(ownerClient, account, permission));
    }
    writeSafeBrowserStackEnvValue(envPath, account.emailKey, account.email);
    writeSafeBrowserStackEnvValue(envPath, account.userIdKey, user.id);
    writeSafeBrowserStackEnvValue(envPath, account.passwordKey, password);
    results.push({
      label: account.label,
      email: "<redacted>",
      userIdPresent: Boolean(user.id),
      authAction: action,
      role: account.role === "operator" ? "admin/operator" : account.role,
      roleGrantStatus: roleGrant?.status ?? "active",
      permissionCount: permissionResults.length,
      passwordStoredInIgnoredEnv: true,
    });
  }

  chmodSync(envPath, 0o600);
  await ownerClient.auth.signOut();

  const summary = {
    status: "pass",
    envPath: ".env.browserstack-monetization.local",
    envPathIgnoredByGit: true,
    valuesPrinted: false,
    accounts: results,
    safety: {
      proofOnlyEmails: true,
      ownerAuthenticatedRoleGrantRpc: true,
      serviceRoleUsedOnlyForAuthProfileProvisioning: true,
      providerMutation: false,
      moneyActivation: false,
    },
  };

  writeFileSync(path.join(artifactDir, "provision-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({
    artifact: artifactDir,
    status: summary.status,
    accountCount: results.length,
    valuesPrinted: false,
  }, null, 2));
} catch (error) {
  await ownerClient.auth.signOut().catch(() => {});
  const message = error instanceof Error ? error.message : String(error);
  writeFileSync(path.join(artifactDir, "provision-summary.json"), `${JSON.stringify({
    status: "partial",
    blocker: message,
    valuesPrinted: false,
    credentialsWritten: false,
    directRoleBypassUsed: false,
  }, null, 2)}\n`);
  console.error(message);
  process.exit(1);
}
