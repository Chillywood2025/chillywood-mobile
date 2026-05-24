#!/usr/bin/env node

import { chmodSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_PERMISSIONS = new Set(["content_moderation", "reports_review"]);

function readRequiredEnv(key) {
  const value = String(process.env[key] ?? "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readFirstPresentEnv(keys) {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: one of ${keys.join(", ")}`);
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function createTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function createPassword() {
  return `${randomBytes(24).toString("base64url")}Aa1`;
}

function readTtlHours() {
  const parsed = Number(process.env.BRAND_REVIEW_PROOF_TTL_HOURS ?? 24);
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.min(168, Math.floor(parsed)));
}

function readPermissions() {
  const raw = String(process.env.BRAND_REVIEW_PROOF_PERMISSIONS ?? "content_moderation")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const permissions = Array.from(new Set(raw.length ? raw : ["content_moderation"]));
  const unsupported = permissions.filter((entry) => !ALLOWED_PERMISSIONS.has(entry));
  if (unsupported.length) {
    throw new Error(`Unsupported proof permission(s): ${unsupported.join(", ")}`);
  }
  return permissions;
}

async function findUserByEmail(adminClient, email) {
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const matched = users.find((user) => normalizeEmail(user.email) === email);
    if (matched) return matched;
    if (!users.length || users.length < 200) return null;
    page += 1;
  }
}

async function upsertPermissionGrant(adminClient, input) {
  const { data: existing, error: existingError } = await adminClient
    .from("platform_staff_permission_grants")
    .select("id,status")
    .eq("permission_key", input.permissionKey)
    .eq("status", "active")
    .ilike("target_email", input.email)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const payload = {
    target_user_id: input.userId,
    target_email: input.email,
    permission_key: input.permissionKey,
    status: "active",
    reason: input.reason,
    metadata: {
      brand_review_proof: true,
      scoped_permission_only: true,
      broad_admin_role_granted: false,
      created_by: "create-brand-review-proof-account",
    },
    granted_by: "create-brand-review-proof-account",
    granted_at: input.nowIso,
    expires_at: input.expiresAt,
    revoked_by: null,
    revoked_at: null,
    updated_at: input.nowIso,
  };

  if (existing?.id) {
    const { error } = await adminClient
      .from("platform_staff_permission_grants")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await adminClient
    .from("platform_staff_permission_grants")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

async function writeGrantAudit(adminClient, input) {
  const permissionAudit = await adminClient.from("platform_staff_permission_audit").insert({
    actor_user_id: "create-brand-review-proof-account",
    actor_email: null,
    actor_role: "service_role_script",
    target_user_id: input.userId,
    target_email: input.email,
    permission_key: input.permissionKey,
    action: "grant",
    reason: input.reason,
    metadata: {
      brand_review_proof: true,
      expires_at: input.expiresAt,
      grant_id: input.grantId,
      fake_approval: false,
      broad_admin_role_granted: false,
    },
  });
  if (permissionAudit.error) throw permissionAudit.error;

  const adminAudit = await adminClient.from("platform_admin_audit_logs").insert({
    actor_user_id: "create-brand-review-proof-account",
    actor_email: null,
    actor_role: "service_role_script",
    action: "platform_brand_review_proof_permission_granted",
    action_category: "role",
    target_type: "platform_staff_permission",
    target_id: `${input.email}:${input.permissionKey}`,
    target_user_id: input.userId,
    target_channel_user_id: input.userId,
    reason: input.reason,
    severity: "notice",
    before_state: null,
    after_state: {
      permission_key: input.permissionKey,
      status: "active",
      expires_at: input.expiresAt,
    },
    metadata: {
      brand_review_proof: true,
      grant_id: input.grantId,
      fake_approval: false,
      broad_admin_role_granted: false,
      raw_password_logged: false,
    },
  });
  if (adminAudit.error) throw adminAudit.error;
}

async function verifyProofLogin(supabaseUrl, anonKey, email, password, permissions) {
  if (!anonKey) return { signedIn: false, permissionKeys: [], skipped: "missing anon key" };
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const { data, error } = await client.rpc("read_my_platform_staff_permission_keys");
  if (error) throw error;
  const permissionKeys = Array.isArray(data) ? data.map(String).sort() : [];
  const missing = permissions.filter((permission) => !permissionKeys.includes(permission));
  if (missing.length) {
    throw new Error(`Proof login is missing permission(s): ${missing.join(", ")}`);
  }
  return { signedIn: true, permissionKeys };
}

async function main() {
  const supabaseUrl = readFirstPresentEnv(["SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]);
  const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "").trim();
  const timestamp = createTimestamp();
  const email = normalizeEmail(
    process.env.BRAND_REVIEW_PROOF_EMAIL || `brand-review-proof-${timestamp.toLowerCase()}@chillywood.test`,
  );
  const password = String(process.env.BRAND_REVIEW_PROOF_PASSWORD || createPassword());
  const ttlHours = readTtlHours();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const permissions = readPermissions();
  const reason = `Temporary Brand Studio review proof account; expires ${expiresAt}.`;
  const credentialFile = String(process.env.BRAND_REVIEW_PROOF_ENV_FILE || ".env.brand-review-proof.local").trim();

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let user = await findUserByEmail(adminClient, email);
  if (user?.id) {
    const { data, error } = await adminClient.auth.admin.updateUserById(user.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        brandReviewProof: true,
        broadAdminRoleGranted: false,
        updatedBy: "create-brand-review-proof-account",
      },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        brandReviewProof: true,
        broadAdminRoleGranted: false,
        createdBy: "create-brand-review-proof-account",
      },
    });
    if (error) throw error;
    user = data.user;
  }

  if (!user?.id) throw new Error("Proof account bootstrap did not return a valid user id.");

  const grantIds = [];
  for (const permissionKey of permissions) {
    const grantId = await upsertPermissionGrant(adminClient, {
      email,
      userId: user.id,
      permissionKey,
      reason,
      expiresAt,
      nowIso,
    });
    await writeGrantAudit(adminClient, {
      email,
      userId: user.id,
      permissionKey,
      reason,
      expiresAt,
      grantId,
    });
    grantIds.push(`${permissionKey}:${grantId ?? "unknown"}`);
  }

  const verification = await verifyProofLogin(supabaseUrl, anonKey, email, password, permissions);
  const fileBody = [
    "# Local-only Brand Studio review proof credentials. Do not commit.",
    `BRAND_REVIEW_PROOF_EMAIL=${email}`,
    `BRAND_REVIEW_PROOF_PASSWORD=${password}`,
    `BRAND_REVIEW_PROOF_USER_ID=${user.id}`,
    `BRAND_REVIEW_PROOF_EXPIRES_AT=${expiresAt}`,
    `BRAND_REVIEW_PROOF_PERMISSIONS=${permissions.join(",")}`,
    "",
  ].join("\n");
  writeFileSync(credentialFile, fileBody, { encoding: "utf8", mode: 0o600 });
  chmodSync(credentialFile, 0o600);

  console.log("Brand review proof account ready.");
  console.log(`Email: ${email}`);
  console.log(`User id: ${user.id}`);
  console.log(`Permissions: ${permissions.join(", ")}`);
  console.log(`Grant ids: ${grantIds.join(", ")}`);
  console.log(`Expires at: ${expiresAt}`);
  console.log(`Credential file: ${credentialFile}`);
  console.log(`Verified sign-in: ${verification.signedIn ? "yes" : `skipped (${verification.skipped})`}`);
  console.log("Password was written only to the local credential file.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
