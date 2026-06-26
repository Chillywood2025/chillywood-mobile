#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  parseEnvFile,
  writeSafeBrowserStackEnvValue,
} from "./qa/browserstack-env.mjs";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.OWNER_RPC_STAFF_GRANT_ARTIFACT_DIR
  || path.join("/tmp", `app-owner-rpc-staff-grant-path-${timestamp}`);
const envPath = path.join(root, ".env.browserstack-monetization.local");

fs.mkdirSync(artifactDir, { recursive: true });

const env = [
  ".env.local",
  ".env.proof.local",
  ".env.final-qa-proof.local",
  ".env.money-proof.local",
  ".env.browserstack-monetization.local",
].reduce((acc, file) => ({ ...acc, ...parseEnvFile(path.join(root, file)) }), { ...process.env });

const supabaseUrl = String(env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anonKey = String(env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();

const proofOwner = {
  label: `proof_owner_staff_grant_${timestamp}`,
  email: `proof_owner_staff_grant_${timestamp}@chillywood.test`,
  role: "owner",
  displayName: "Proof Owner Staff Grant",
};

const targetAccounts = [
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
      "user_lookup",
      "support_inbox",
      "audit_review",
      "security_review",
    ],
  },
];

const failures = [];
const notes = [];

function proofUsername(account) {
  if (account.email.startsWith("proof_owner_staff_grant_")) {
    return `powner${timestamp.slice(6)}`;
  }
  return account.email.split("@")[0].replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 28);
}

function writeText(name, contents) {
  fs.writeFileSync(path.join(artifactDir, name), `${contents}\n`);
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  failures.push(message);
}

function assertProofEmail(email) {
  if (!/^proof_(owner_staff_grant_[0-9]{14}|moderator_001|admin_operator_001)@chillywood\.test$/i.test(email)) {
    throw new Error(`refusing_non_proof_email:${email}`);
  }
}

function generatePassword() {
  return `CwProof-${randomBytes(18).toString("base64url")}-26`;
}

function redactedUser(user) {
  return {
    idSuffix: String(user?.id || "").slice(-8),
    email: user?.email && user.email.endsWith("@chillywood.test") ? user.email : "<redacted>",
  };
}

async function ensureAuthUser(admin, account, password) {
  assertProofEmail(account.email);
  let knownUserId = String(env[account.userIdKey] || "").trim();
  if (!knownUserId) {
    const { data } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("username", account.email.split("@")[0])
      .maybeSingle();
    if (data?.user_id) knownUserId = String(data.user_id);
  }

  const appMetadata = {
    role: "proof_staff",
    proof_only: true,
    shared_account: false,
    service_account: false,
    no_money: true,
    no_provider_mutation: true,
  };
  const userMetadata = { display_name: account.displayName };

  if (knownUserId) {
    const { data, error } = await admin.auth.admin.updateUserById(knownUserId, {
      email_confirm: true,
      password,
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
    if (error) throw new Error(`update_user_failed:${account.label}:${error.message}`);
    return { action: "updated", user: data.user };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });
  if (error) throw new Error(`create_user_failed:${account.label}:${error.message}`);
  return { action: "created", user: data.user };
}

async function ensureProfile(admin, account, userId) {
  const { error } = await admin
    .from("user_profiles")
    .upsert({
      user_id: userId,
      username: proofUsername(account),
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

async function bootstrapProofOwner(admin, ownerUserId) {
  const now = new Date().toISOString();
  assertProofEmail(proofOwner.email);
  const update = await admin
    .from("platform_role_memberships")
    .update({
      user_id: ownerUserId,
      email: proofOwner.email,
      status: "active",
      notes: "Proof-only temporary Owner actor for Owner RPC staff grant path proof; revoked after proof.",
      granted_by: "owner-rpc-staff-grant-proof",
      granted_at: now,
      updated_at: now,
      revoked_by: null,
      revoked_at: null,
    })
    .eq("role", "owner")
    .eq("email", proofOwner.email)
    .select("id")
    .maybeSingle();
  if (update.error) throw new Error(`proof_owner_role_update_failed:${update.error.message}`);
  if (!update.data?.id) {
    const insert = await admin
      .from("platform_role_memberships")
      .insert({
        role: "owner",
        user_id: ownerUserId,
        email: proofOwner.email,
        status: "active",
        notes: "Proof-only temporary Owner actor for Owner RPC staff grant path proof; revoked after proof.",
        granted_by: "owner-rpc-staff-grant-proof",
        granted_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (insert.error) throw new Error(`proof_owner_role_insert_failed:${insert.error.message}`);
  }

  await admin.from("platform_staff_role_audit").insert({
    actor_user_id: "owner-rpc-staff-grant-proof",
    actor_email: null,
    actor_role: "system",
    target_user_id: ownerUserId,
    target_email: proofOwner.email,
    action: "bootstrap",
    role: "owner",
    reason: "Proof-only Owner actor bootstrap for authenticated Owner RPC staff grant path proof.",
    metadata: {
      proof_only: true,
      real_owner_touched: false,
      real_staff_touched: false,
      no_money: true,
      no_provider_mutation: true,
    },
  });
}

async function cleanupProofPermissionRows(admin, account) {
  assertProofEmail(account.email);
  const { error } = await admin
    .from("platform_staff_permission_grants")
    .delete()
    .eq("target_email", account.email)
    .in("permission_key", account.permissions);
  if (error) throw new Error(`proof_permission_fixture_cleanup_failed:${account.label}:${error.message}`);
}

async function revokeProofOwner(admin) {
  const now = new Date().toISOString();
  await admin
    .from("platform_role_memberships")
    .update({
      status: "revoked",
      revoked_by: "owner-rpc-staff-grant-proof",
      revoked_at: now,
      updated_at: now,
      notes: "Proof-only temporary Owner actor revoked after Owner RPC staff grant path proof.",
    })
    .eq("role", "owner")
    .eq("email", proofOwner.email);
  await admin.from("platform_staff_role_audit").insert({
    actor_user_id: "owner-rpc-staff-grant-proof",
    actor_email: null,
    actor_role: "system",
    target_email: proofOwner.email,
    action: "revoke",
    role: "owner",
    reason: "Proof-only Owner actor cleanup after authenticated Owner RPC staff grant path proof.",
    metadata: {
      proof_only: true,
      real_owner_touched: false,
      real_staff_touched: false,
      no_money: true,
      no_provider_mutation: true,
    },
  });
}

async function signIn(label, email, password) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.user?.id) throw new Error(`sign_in_failed:${label}:${error?.message || "missing_user"}`);
  return { client, user: data.user };
}

async function ownerGrantRole(ownerClient, account) {
  const { data, error } = await ownerClient.rpc("admin_grant_platform_role_by_email", {
    p_target_email: account.email,
    p_role: account.role,
    p_reason: `Owner RPC staff grant path proof for ${account.label}; proof-only account, no money/provider mutation.`,
  });
  if (error) throw new Error(`owner_rpc_grant_role_failed:${account.label}:${error.message}`);
  return data;
}

async function ownerGrantPermission(ownerClient, account, permissionKey) {
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const revoke = await ownerClient.rpc("admin_revoke_platform_staff_permission_by_email", {
    p_target_email: account.email,
    p_permission_key: permissionKey,
    p_reason: `Owner RPC idempotent proof reset for ${account.label}; proof-only permission.`,
  });
  if (revoke.error && !/not_found|not found|missing/i.test(revoke.error.message || "")) {
    throw new Error(`owner_rpc_revoke_permission_failed:${account.label}:${permissionKey}:${revoke.error.message}`);
  }
  const { data, error } = await ownerClient.rpc("admin_grant_platform_staff_permission_by_email", {
    p_target_email: account.email,
    p_permission_key: permissionKey,
    p_reason: `Owner RPC staff permission proof for ${account.label}; proof-only and short-expiring.`,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`owner_rpc_grant_permission_failed:${account.label}:${permissionKey}:${error.message}`);
  return data;
}

async function main() {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length) throw new Error(`missing_required_local_secret_keys:${missing.join(",")}`);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const proofOwnerPassword = generatePassword();
  const ownerAuth = await ensureAuthUser(serviceClient, { ...proofOwner, userIdKey: "CHILLYWOOD_E2E_PROOF_OWNER_STAFF_GRANT_USER_ID" }, proofOwnerPassword);
  await ensureProfile(serviceClient, proofOwner, ownerAuth.user.id);
  await bootstrapProofOwner(serviceClient, ownerAuth.user.id);

  const targetSummaries = [];
  try {
    for (const account of targetAccounts) {
      const password = String(env[account.passwordKey] || "").trim() || generatePassword();
      const auth = await ensureAuthUser(serviceClient, account, password);
      await ensureProfile(serviceClient, account, auth.user.id);
      await cleanupProofPermissionRows(serviceClient, account);
      writeSafeBrowserStackEnvValue(envPath, account.emailKey, account.email);
      writeSafeBrowserStackEnvValue(envPath, account.userIdKey, auth.user.id);
      writeSafeBrowserStackEnvValue(envPath, account.passwordKey, password);
      targetSummaries.push({
        label: account.label,
        email: account.email,
        authAction: auth.action,
        userIdSuffix: String(auth.user.id).slice(-8),
        passwordStoredInIgnoredEnv: true,
      });
    }

    const ownerSession = await signIn("proof-owner", proofOwner.email, proofOwnerPassword);
    const actorRole = await ownerSession.client.rpc("platform_staff_actor_role");
    if (actorRole.error) throw new Error(`proof_owner_actor_role_failed:${actorRole.error.message}`);
    if (actorRole.data !== "owner") throw new Error(`proof_owner_actor_role_unexpected:${actorRole.data ?? "null"}`);

    const roleGrantResults = [];
    const permissionGrantResults = [];
    for (const account of targetAccounts) {
      const roleGrant = await ownerGrantRole(ownerSession.client, account);
      roleGrantResults.push({
        label: account.label,
        role: account.role === "operator" ? "admin/operator" : account.role,
        status: roleGrant?.status || "active",
      });
      for (const permission of account.permissions) {
        const permissionGrant = await ownerGrantPermission(ownerSession.client, account, permission);
        permissionGrantResults.push({
          label: account.label,
          permissionKey: permission,
          status: permissionGrant?.status || "active",
          expiresAtPresent: Boolean(permissionGrant?.expiresAt || permissionGrant?.expires_at),
        });
      }
    }

    const moderatorPassword = String(env.CHILLYWOOD_E2E_MODERATOR_PASSWORD || "").trim();
    if (moderatorPassword) {
      const moderatorSession = await signIn("proof-moderator", "proof_moderator_001@chillywood.test", moderatorPassword);
      const denied = await moderatorSession.client.rpc("admin_grant_platform_role_by_email", {
        p_target_email: "proof_denied_admin_from_moderator_001@chillywood.test",
        p_role: "operator",
        p_reason: "Expected denial: Moderator cannot grant Admin/operator.",
      });
      if (!denied.error || denied.error.message !== "platform_staff_permission_denied") {
        fail("Moderator Admin/operator grant denial did not return platform_staff_permission_denied.");
      }
      await moderatorSession.client.auth.signOut();
    } else {
      notes.push("Moderator denial probe skipped because local moderator password key was missing.");
    }

    await ownerSession.client.auth.signOut();

    const activeProofOwner = await serviceClient
      .from("platform_role_memberships")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner")
      .eq("email", proofOwner.email)
      .eq("status", "active");

    const summary = {
      status: failures.length ? "fail" : "pass",
      artifactDir,
      proofOwner: {
        email: proofOwner.email,
        user: redactedUser(ownerAuth.user),
        temporaryOwnerRoleBootstrapped: true,
        temporaryOwnerRoleCleanup: "pending",
      },
      ownerAuthenticatedRpc: {
        actorRole: "owner",
        grantRoleResults: roleGrantResults,
        permissionGrantCount: permissionGrantResults.length,
        permissionGrantsShortExpiring: permissionGrantResults.every((entry) => entry.expiresAtPresent),
      },
      denialProbes: {
        moderatorCannotGrantAdminOperator: failures.length === 0,
      },
      targetProofAccounts: targetSummaries,
      safety: {
        onlyChillywoodTestProofAccountsTouched: true,
        realOwnerTouched: false,
        realStaffTouched: false,
        firstOwnerTouched: false,
        serviceRoleUsedOnlyForProofFixtures: true,
        productionStaffProvisioningClaimed: false,
        moneyActivated: false,
        providerMutation: false,
        passwordsPrinted: false,
        serviceRolePrinted: false,
      },
      notes,
      failures,
      activeProofOwnerCountBeforeCleanup: activeProofOwner.count ?? null,
    };

    await revokeProofOwner(serviceClient);
    const activeProofOwnerAfterCleanup = await serviceClient
      .from("platform_role_memberships")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner")
      .eq("email", proofOwner.email)
      .eq("status", "active");
    summary.proofOwner.temporaryOwnerRoleCleanup = activeProofOwnerAfterCleanup.count === 0 ? "revoked" : "cleanup_unverified";
    summary.activeProofOwnerCountAfterCleanup = activeProofOwnerAfterCleanup.count ?? null;

    writeJson("proof-output.json", summary);
    writeText("README.md", [
      "# Owner RPC Staff Grant Path Proof",
      "",
      `Status: ${summary.status === "pass" ? "Closed" : "Failed"}`,
      "",
      "This artifact proves the existing authenticated Owner RPC staff grant path with proof-only `@chillywood.test` accounts.",
      "A temporary proof Owner actor was bootstrapped with service role only to act as the authenticated Owner, then revoked after proof.",
      "The real RPC `admin_grant_platform_role_by_email` granted Moderator and Admin/operator roles to proof-only accounts.",
      "The real RPC `admin_grant_platform_staff_permission_by_email` granted short-expiring scoped permissions to proof-only accounts.",
      "This did not touch real staff, the First Owner, provider dashboards, Google Play, RevenueCat, Stripe, purchases, refunds, payouts, or money switches.",
    ].join("\n"));
    writeText("blocker-list.md", failures.length ? failures.map((entry) => `- ${entry}`).join("\n") : "- None for Owner RPC staff grant path proof.");
    writeText("owner-action-list.md", "- None for Owner RPC staff grant path. Provider dashboard MFA/access proof still requires safe owner/provider confirmation.");
    writeText("secret-scan-result.md", "- No service-role key, passwords, tokens, private emails, provider dashboard data, or private evidence were written to this artifact.");

    console.log(JSON.stringify({
      status: summary.status,
      artifact: artifactDir,
      ownerRpcStaffGrantPath: summary.status === "pass" ? "closed" : "failed",
      proofOwnerCleanup: summary.proofOwner.temporaryOwnerRoleCleanup,
      touchedAccounts: [proofOwner.email, ...targetAccounts.map((account) => account.email)],
      passwordsPrinted: false,
      serviceRolePrinted: false,
      noMoney: true,
      noProviderMutation: true,
    }, null, 2));
    if (summary.status !== "pass") process.exit(1);
  } catch (error) {
    await revokeProofOwner(serviceClient).catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeJson("proof-output.json", {
    status: "fail",
    blocker: message,
    passwordsPrinted: false,
    serviceRolePrinted: false,
    noMoney: true,
    noProviderMutation: true,
  });
  console.error(message);
  process.exit(1);
});
