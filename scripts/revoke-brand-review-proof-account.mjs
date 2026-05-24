#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
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

function parseCredentialFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function readPermissions(fileEnv) {
  const raw = String(
    process.env.BRAND_REVIEW_PROOF_PERMISSIONS ?? fileEnv.BRAND_REVIEW_PROOF_PERMISSIONS ?? "content_moderation",
  )
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

async function insertRoleAudit(adminClient, input) {
  const roleAudit = await adminClient.from("platform_staff_role_audit").insert({
    actor_user_id: "revoke-brand-review-proof-account",
    actor_email: null,
    actor_role: "system",
    target_user_id: input.userId,
    target_email: input.email,
    action: "revoke",
    role: "moderator",
    reason: input.reason,
    metadata: {
      brand_review_proof: true,
      membership_id: input.membershipId,
      proof_closed: true,
    },
  });
  if (roleAudit.error) throw roleAudit.error;

  const adminAudit = await adminClient.from("platform_admin_audit_logs").insert({
    actor_user_id: "revoke-brand-review-proof-account",
    actor_email: null,
    actor_role: "service_role_script",
    action: "platform_brand_review_proof_moderator_role_revoked",
    action_category: "role",
    target_type: "platform_role_membership",
    target_id: String(input.membershipId ?? `${input.email}:moderator`),
    target_user_id: input.userId,
    target_channel_user_id: input.userId,
    reason: input.reason,
    severity: "notice",
    before_state: input.beforeState,
    after_state: {
      role: "moderator",
      status: "revoked",
    },
    metadata: {
      brand_review_proof: true,
      membership_id: input.membershipId,
      proof_closed: true,
    },
  });
  if (adminAudit.error) throw adminAudit.error;
}

async function insertPermissionAudit(adminClient, input) {
  const permissionAudit = await adminClient.from("platform_staff_permission_audit").insert({
    actor_user_id: "revoke-brand-review-proof-account",
    actor_email: null,
    actor_role: "service_role_script",
    target_user_id: input.userId,
    target_email: input.email,
    permission_key: input.permissionKey,
    action: "revoke",
    reason: input.reason,
    metadata: {
      brand_review_proof: true,
      grant_id: input.grantId,
      proof_closed: true,
    },
  });
  if (permissionAudit.error) throw permissionAudit.error;

  const adminAudit = await adminClient.from("platform_admin_audit_logs").insert({
    actor_user_id: "revoke-brand-review-proof-account",
    actor_email: null,
    actor_role: "service_role_script",
    action: "platform_brand_review_proof_permission_revoked",
    action_category: "role",
    target_type: "platform_staff_permission",
    target_id: `${input.email}:${input.permissionKey}`,
    target_user_id: input.userId,
    target_channel_user_id: input.userId,
    reason: input.reason,
    severity: "notice",
    before_state: input.beforeState,
    after_state: {
      permission_key: input.permissionKey,
      status: "revoked",
    },
    metadata: {
      brand_review_proof: true,
      grant_id: input.grantId,
      proof_closed: true,
    },
  });
  if (adminAudit.error) throw adminAudit.error;
}

async function main() {
  const supabaseUrl = readFirstPresentEnv(["SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]);
  const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const credentialFile = String(process.env.BRAND_REVIEW_PROOF_ENV_FILE || ".env.brand-review-proof.local").trim();
  const fileEnv = parseCredentialFile(credentialFile);
  const email = normalizeEmail(process.env.BRAND_REVIEW_PROOF_EMAIL || fileEnv.BRAND_REVIEW_PROOF_EMAIL);
  const userId = String(process.env.BRAND_REVIEW_PROOF_USER_ID || fileEnv.BRAND_REVIEW_PROOF_USER_ID || "").trim();
  const membershipId = String(
    process.env.BRAND_REVIEW_PROOF_MODERATOR_MEMBERSHIP_ID ||
      fileEnv.BRAND_REVIEW_PROOF_MODERATOR_MEMBERSHIP_ID ||
      "",
  ).trim();
  const permissions = readPermissions(fileEnv);
  const nowIso = new Date().toISOString();
  const reason =
    String(process.env.BRAND_REVIEW_PROOF_REVOKE_REASON ?? "").trim() ||
    `Brand Studio review proof completed; temporary reviewer access revoked ${nowIso}.`;

  if (!email) throw new Error("Missing BRAND_REVIEW_PROOF_EMAIL.");

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let roleQuery = adminClient
    .from("platform_role_memberships")
    .select("*")
    .eq("role", "moderator")
    .eq("status", "active");
  if (membershipId) {
    roleQuery = roleQuery.eq("id", membershipId);
  } else {
    roleQuery = roleQuery.ilike("email", email);
  }
  const { data: memberships, error: membershipSelectError } = await roleQuery;
  if (membershipSelectError) throw membershipSelectError;

  const revokedMemberships = [];
  for (const membership of memberships ?? []) {
    const { data, error } = await adminClient
      .from("platform_role_memberships")
      .update({
        status: "revoked",
        revoked_by: "revoke-brand-review-proof-account",
        revoked_at: nowIso,
        updated_at: nowIso,
        notes: reason,
      })
      .eq("id", membership.id)
      .select("id,user_id,email,role,status")
      .single();
    if (error) throw error;
    revokedMemberships.push(data);
    await insertRoleAudit(adminClient, {
      email,
      userId: userId || membership.user_id,
      membershipId: membership.id,
      reason,
      beforeState: membership,
    });
  }

  const { data: grants, error: grantSelectError } = await adminClient
    .from("platform_staff_permission_grants")
    .select("*")
    .eq("status", "active")
    .ilike("target_email", email)
    .in("permission_key", permissions);
  if (grantSelectError) throw grantSelectError;

  const revokedGrants = [];
  for (const grant of grants ?? []) {
    const { data, error } = await adminClient
      .from("platform_staff_permission_grants")
      .update({
        status: "revoked",
        revoked_by: "revoke-brand-review-proof-account",
        revoked_at: nowIso,
        updated_at: nowIso,
        reason,
      })
      .eq("id", grant.id)
      .select("id,target_user_id,target_email,permission_key,status")
      .single();
    if (error) throw error;
    revokedGrants.push(data);
    await insertPermissionAudit(adminClient, {
      email,
      userId: userId || grant.target_user_id,
      permissionKey: grant.permission_key,
      grantId: grant.id,
      reason,
      beforeState: grant,
    });
  }

  console.log("Brand review proof access revoked.");
  console.log(`Credential file: ${credentialFile}`);
  console.log(`Moderator memberships revoked: ${revokedMemberships.length}`);
  console.log(`Scoped permission grants revoked: ${revokedGrants.length}`);
  console.log("Proof password and service-role key were not printed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
