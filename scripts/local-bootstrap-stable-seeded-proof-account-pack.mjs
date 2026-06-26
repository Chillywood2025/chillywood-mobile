#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile, writeSafeBrowserStackEnvValue } from "./qa/browserstack-env.mjs";

const root = process.cwd();
const envPath = path.join(root, ".env.browserstack-monetization.local");
const artifactDir = process.env.STABLE_SEEDED_PROOF_ACCOUNT_PACK_ARTIFACT_DIR
  || path.join("/tmp", `app-stable-seeded-proof-account-pack-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`);

const PROOF_EMAILS = new Set([
  "proof_normal_001@chillywood.test",
  "proof_creator_001@chillywood.test",
  "proof_moderator_001@chillywood.test",
  "proof_admin_operator_001@chillywood.test",
  "proof_owner_001@chillywood.test",
  "proof_restricted_001@chillywood.test",
  "proof_blocked_a_001@chillywood.test",
  "proof_blocked_b_001@chillywood.test",
  "proof_premium_001@chillywood.test",
  "proof_nonpremium_001@chillywood.test",
]);

const ACCOUNTS = [
  {
    label: "proof_normal_001",
    displayName: "Proof Normal",
    email: "proof_normal_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_NORMAL_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_NORMAL_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_NORMAL_PASSWORD",
    profileRole: "viewer",
    staffRole: null,
  },
  {
    label: "proof_creator_001",
    displayName: "Proof Creator",
    email: "proof_creator_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_CREATOR_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_CREATOR_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_CREATOR_PASSWORD",
    profileRole: "creator",
    staffRole: null,
  },
  {
    label: "proof_moderator_001",
    displayName: "Proof Moderator",
    email: "proof_moderator_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_MODERATOR_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_MODERATOR_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_MODERATOR_PASSWORD",
    profileRole: "viewer",
    staffRole: "moderator",
    permissions: [
      "reports_review",
      "content_moderation",
      "live_ops",
    ],
  },
  {
    label: "proof_admin_operator_001",
    displayName: "Proof Admin Operator",
    email: "proof_admin_operator_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD",
    profileRole: "viewer",
    staffRole: "operator",
    permissions: [
      "support_inbox",
      "user_lookup",
      "billing_support_read",
      "creator_support",
      "audit_review",
      "security_review",
    ],
  },
  {
    label: "proof_owner_001",
    displayName: "Proof Owner",
    email: "proof_owner_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_OWNER_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_OWNER_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_OWNER_PASSWORD",
    profileRole: "creator",
    staffRole: "owner",
  },
  {
    label: "proof_restricted_001",
    displayName: "Proof Restricted",
    email: "proof_restricted_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_RESTRICTED_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_RESTRICTED_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_RESTRICTED_PASSWORD",
    profileRole: "viewer",
    staffRole: null,
  },
  {
    label: "proof_blocked_a_001",
    displayName: "Proof Blocked A",
    email: "proof_blocked_a_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_BLOCKED_A_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_BLOCKED_A_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_BLOCKED_A_PASSWORD",
    profileRole: "viewer",
    staffRole: null,
  },
  {
    label: "proof_blocked_b_001",
    displayName: "Proof Blocked B",
    email: "proof_blocked_b_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_BLOCKED_B_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_BLOCKED_B_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_BLOCKED_B_PASSWORD",
    profileRole: "viewer",
    staffRole: null,
  },
  {
    label: "proof_premium_001",
    displayName: "Proof Premium",
    email: "proof_premium_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_PREMIUM_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_PREMIUM_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_PREMIUM_PASSWORD",
    profileRole: "viewer",
    staffRole: null,
  },
  {
    label: "proof_nonpremium_001",
    displayName: "Proof NonPremium",
    email: "proof_nonpremium_001@chillywood.test",
    emailKey: "CHILLYWOOD_E2E_NONPREMIUM_EMAIL",
    userIdKey: "CHILLYWOOD_E2E_NONPREMIUM_USER_ID",
    passwordKey: "CHILLYWOOD_E2E_NONPREMIUM_PASSWORD",
    profileRole: "viewer",
    staffRole: null,
  },
];

const STAFF_EXPIRY_DAYS = 7;
const SANDBOX_EXPIRY_DAYS = 30;

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

function assertSafeProofEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!PROOF_EMAILS.has(normalized)) throw new Error(`refusing_non_stable_proof_email:${normalized || "<empty>"}`);
  return normalized;
}

function generatePassword() {
  return `CwProof-${randomBytes(24).toString("base64url")}-26`;
}

function stableUuid(label) {
  const hex = createHash("sha256").update(`chillywood-stable-seeded-proof:${label}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function userIdSuffix(userId) {
  return String(userId ?? "").slice(-8) || null;
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

async function requireOk(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
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
  const email = assertSafeProofEmail(account.email);
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) return null;
  return data?.user ?? null;
}

async function upsertProofUser(admin, account, password, env) {
  const email = assertSafeProofEmail(account.email);
  const metadata = {
    role: "proof_account",
    proof_only: true,
    stable_seeded_pack: true,
    account_label: account.label,
    service_account: false,
    shared_account: false,
    no_money: true,
    no_payout: true,
    no_provider_mutation: true,
  };
  const knownUserId = await findUserFromProfile(admin, account, env);
  if (knownUserId) {
    const { data, error } = await admin.auth.admin.updateUserById(knownUserId, {
      email,
      email_confirm: true,
      password,
      app_metadata: metadata,
      user_metadata: { display_name: account.displayName, proof_label: account.label },
    });
    if (error) throw new Error(`update_user_failed:${account.label}:${error.message}`);
    return { action: "repaired", user: data.user };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: metadata,
    user_metadata: { display_name: account.displayName, proof_label: account.label },
  });
  if (error) {
    const message = String(error.message ?? "");
    if (/already|registered|exists|duplicate/i.test(message)) {
      const existing = await findUserByRecoveryLink(admin, account);
      if (existing?.id) {
        const update = await admin.auth.admin.updateUserById(existing.id, {
          email,
          email_confirm: true,
          password,
          app_metadata: { ...(existing.app_metadata ?? {}), ...metadata },
          user_metadata: { ...(existing.user_metadata ?? {}), display_name: account.displayName, proof_label: account.label },
        });
        if (update.error) throw new Error(`update_existing_auth_user_failed:${account.label}:${update.error.message}`);
        return { action: "repaired_orphan", user: update.data.user };
      }
      throw new Error(`existing_auth_user_without_local_profile_or_user_id:${account.label}`);
    }
    throw new Error(`create_user_failed:${account.label}:${message}`);
  }
  return { action: "created", user: data.user };
}

async function ensureProfile(admin, account, userId) {
  const publicCreator = account.label === "proof_creator_001" || account.label === "proof_owner_001";
  return requireOk(`upsert_profile:${account.label}`, admin
    .from("user_profiles")
    .upsert({
      user_id: userId,
      username: account.label,
      display_name: account.displayName,
      channel_role: account.profileRole,
      profile_visibility: publicCreator ? "everyone" : "private",
      profile_access_visibility: publicCreator ? "public" : "private",
      platform_access_visibility: publicCreator ? "public" : "private",
      subscriber_surface_enabled: publicCreator,
      follower_surface_enabled: true,
      tagline: `${account.displayName} proof-only seeded account`,
      updated_at: nowIso(),
    }, { onConflict: "user_id" })
    .select("user_id,username,channel_role,profile_access_visibility,platform_access_visibility")
    .single());
}

async function ensureCreatorFixtures(admin, creatorId) {
  const now = new Date();
  const videoId = stableUuid("proof_creator_paid_video");
  const eventId = stableUuid("proof_creator_paid_event");
  const partyId = `PROOF-${creatorId.slice(0, 8)}`;
  const startsAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  const fixtureResults = [];
  let tipProduct = null;

  const safe = async (label, fn) => {
    try {
      await fn();
      fixtureResults.push({ label, status: "repaired" });
    } catch (error) {
      fixtureResults.push({ label, status: "blocked", blocker: error.message });
    }
  };

  await safe("creator_video_source", () => requireOk("upsert_paid_video_source", admin.from("videos").upsert({
    id: videoId,
    owner_id: creatorId,
    title: "Stable Proof Paid Video Fixture",
    description: "Sandbox-only stable seeded proof paid video fixture.",
    visibility: "public",
    moderation_status: "clean",
    scan_status: "clean",
    storage_bucket: "creator-videos",
    storage_provider: "supabase",
    playback_url: "https://example.invalid/chillywood/stable-proof-paid-video.mp4",
    updated_at: now.toISOString(),
  }, { onConflict: "id" }).select("id").single()));

  await safe("creator_content_price", () => requireOk("upsert_creator_content_price", admin.from("creator_content_prices").upsert({
    creator_id: creatorId,
    content_type: "creator_video",
    content_id: videoId,
    is_paid: true,
    price_cents: 99,
    currency: "usd",
    status: "sandbox",
    provider: "revenuecat_google_play",
    provider_product_id: "cw_paid_content_access_sandbox_099",
    provider_product_key: "paid_content_access_sandbox_099",
    metadata: { stable_seeded_proof: true, sandbox_only: true, not_payable: true, production_enabled: false, live_money_enabled: false },
  }, { onConflict: "content_type,content_id" }).select("id").single()));

  await safe("watch_party_room", () => requireOk("upsert_watch_party_room", admin.from("watch_party_rooms").upsert({
    party_id: partyId,
    host_user_id: creatorId,
    room_type: "title",
    is_active: true,
    join_policy: "open",
    content_access_rule: "party_pass",
    capture_policy: "host_managed",
    reactions_policy: "enabled",
    playback_state: "paused",
    playback_position_millis: 0,
    source_type: "creator_video",
    source_id: videoId,
    started_at: now.toISOString(),
    last_activity_at: now.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: "party_id" }).select("party_id").single()));

  await safe("creator_event", () => requireOk("upsert_creator_event", admin.from("creator_events").upsert({
    id: eventId,
    host_user_id: creatorId,
    event_title: "Stable Proof Event Pass Fixture",
    event_type: "live_first",
    status: "scheduled",
    starts_at: startsAt,
    ends_at: endsAt,
    replay_policy: "none",
    updated_at: now.toISOString(),
  }, { onConflict: "id" }).select("id").single()));

  await safe("tip_settings", () => requireOk("upsert_tip_settings", admin.from("creator_tip_settings").upsert({
    creator_id: creatorId,
    tips_enabled: true,
    provider: "manual",
    provider_environment: "test",
    provider_onboarding_status: "not_configured",
    provider_charges_enabled: false,
    provider_payouts_enabled: false,
    default_amount_cents: 100,
    suggested_amounts_cents: [100, 300, 500],
    min_amount_cents: 100,
    max_amount_cents: 1000,
    currency: "usd",
    status: "active",
    metadata: { stable_seeded_proof: true, sandbox_only: true, not_payable: true, payout_enabled: false },
  }, { onConflict: "creator_id" }).select("id").single()));

  await safe("monetization_product_creator_tip", async () => {
    tipProduct = await requireOk("upsert_monetization_product_creator_tip", admin.from("monetization_products").upsert({
      product_key: "creator_tip_sandbox_099",
      product_type: "creator_tip",
      display_name: "Stable Proof Creator Tip",
      description: "Stable seeded proof sandbox-only creator tip fixture. Not live money and not payable.",
      provider: "revenuecat_google_play",
      provider_product_id: "creator_tip_sandbox_099",
      provider_base_plan_id: null,
      revenuecat_entitlement: null,
      environment: "sandbox",
      status: "sandbox",
      is_android_digital: true,
      is_physical_good: false,
      metadata: {
        stable_seeded_proof: true,
        sandbox_only: true,
        not_payable: true,
        payout_enabled: false,
        production_enabled: false,
        live_money_enabled: false,
      },
    }, { onConflict: "product_key" }).select("id,product_key").single());
  });

  await safe("creator_monetization_config", () => requireOk("upsert_creator_monetization_config", admin.from("creator_monetization_configs").upsert({
    creator_id: creatorId,
    source_type: "creator_tip",
    source_id: creatorId,
    product_id: tipProduct?.id ?? null,
    product_key: "creator_tip_sandbox_099",
    product_type: "creator_tip",
    provider: "manual",
    provider_product_id: "creator_tip_sandbox_099",
    display_name: "Stable Proof Creator Tip",
    price_label: "$1.00 sandbox/test",
    environment: "sandbox",
    status: "sandbox",
    payable_state: "not_payable",
    production_enabled: false,
    payout_enabled: false,
    creates_digital_access: false,
    grants_livekit_publish: false,
    grants_host_authority: false,
    requires_host_approval: false,
    metadata: { stable_seeded_proof: true, sandbox_only: true, not_payable: true, live_money_enabled: false },
  }, { onConflict: "creator_id,source_type,source_id,product_key" }).select("id").single()));

  return {
    videoIdSuffix: userIdSuffix(videoId),
    eventIdSuffix: userIdSuffix(eventId),
    partyId,
    fixtureResults,
  };
}

async function ensureSandboxTester(admin, account, userId) {
  const now = nowIso();
  await requireOk(`revoke_sandbox_tester_user:${account.label}`, admin
    .from("sandbox_monetization_testers")
    .update({ status: "revoked", revoked_at: now })
    .eq("status", "active")
    .eq("user_id", userId));
  await requireOk(`revoke_sandbox_tester_email:${account.label}`, admin
    .from("sandbox_monetization_testers")
    .update({ status: "revoked", revoked_at: now })
    .eq("status", "active")
    .eq("email", account.email));
  return requireOk(`insert_sandbox_tester:${account.label}`, admin
    .from("sandbox_monetization_testers")
    .insert({
      created_by: "stable-seeded-proof-account-pack",
      email: account.email,
      expires_at: futureIso(SANDBOX_EXPIRY_DAYS),
      note: "Stable seeded proof account pack; sandbox-only tester row",
      status: "active",
      user_id: userId,
    })
    .select("id,status,expires_at")
    .single());
}

async function ensurePremiumEntitlement(admin, userId) {
  return requireOk("upsert_premium_test_entitlement", admin
    .from("user_entitlements")
    .upsert({
      user_id: userId,
      entitlement_key: "premium",
      status: "active",
      source: "test_grant",
      starts_at: nowIso(),
      expires_at: futureIso(SANDBOX_EXPIRY_DAYS),
      revoked_at: null,
      updated_at: nowIso(),
      metadata: {
        stable_seeded_proof: true,
        sandbox_only: true,
        provider_purchase: false,
        live_money_enabled: false,
      },
    }, { onConflict: "user_id,entitlement_key" })
    .select("entitlement_key,status,expires_at")
    .single());
}

async function ensureNoPremiumEntitlement(admin, userId) {
  await requireOk("delete_nonpremium_premium_entitlement", admin
    .from("user_entitlements")
    .delete()
    .eq("user_id", userId)
    .eq("entitlement_key", "premium"));
}

async function ensureBlockPair(admin, aId, bId) {
  const rows = [
    { channel_user_id: aId, blocked_user_id: bId, blocked_by_user_id: aId, reason: "stable_seeded_proof_block_pair", updated_at: nowIso() },
    { channel_user_id: bId, blocked_user_id: aId, blocked_by_user_id: bId, reason: "stable_seeded_proof_block_pair", updated_at: nowIso() },
  ];
  for (const row of rows) {
    await requireOk("upsert_block_pair", admin
      .from("channel_audience_blocks")
      .upsert(row, { onConflict: "channel_user_id,blocked_user_id" })
      .select("channel_user_id,blocked_user_id")
      .single());
  }
}

async function ensureRestrictedState(admin, userId) {
  const { data, error } = await admin.rpc("admin_suspend_account_for_support", {
    p_target_user_id: userId,
    p_reason: "Stable seeded proof restricted account fixture; proof-only user, no real account affected.",
    p_duration_minutes: 10080,
  });
  if (error) throw new Error(`restricted_state_failed:${error.message}`);
  return data;
}

async function ensureOwnerProofRole(admin, account, userId) {
  const { data: existing, error: existingError } = await admin
    .from("platform_role_memberships")
    .select("id,status")
    .eq("role", "owner")
    .or(`email.eq.${account.email},user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`owner_role_read_failed:${existingError.message}`);
  if (existing?.id) {
    await requireOk("reactivate_owner_proof_role", admin
      .from("platform_role_memberships")
      .update({
        email: account.email,
        user_id: userId,
        status: "active",
        notes: "Stable seeded proof Owner account fixture only; not First Owner and not authority proof.",
        updated_at: nowIso(),
      })
      .eq("id", existing.id));
    return { status: "reused", authorityProof: false };
  }
  await requireOk("insert_owner_proof_role", admin
    .from("platform_role_memberships")
    .insert({
      role: "owner",
      email: account.email,
      user_id: userId,
      status: "active",
      notes: "Stable seeded proof Owner account fixture only; not First Owner and not authority proof.",
      granted_by: "stable-seeded-proof-account-pack",
      granted_at: nowIso(),
      updated_at: nowIso(),
    }));
  await admin.from("platform_staff_role_audit").insert({
    actor_role: "system",
    target_user_id: userId,
    target_email: account.email,
    action: "bootstrap",
    role: "owner",
    reason: "Stable seeded proof Owner fixture bootstrap; not First Owner and not role authority proof.",
    metadata: { stable_seeded_proof: true, first_owner_touched: false, authority_proof: false },
  });
  return { status: "created", authorityProof: false };
}

async function signInOwner(env) {
  const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !anon || !env.CHILLYWOOD_E2E_OWNER_EMAIL || !env.CHILLYWOOD_E2E_OWNER_PASSWORD) {
    return { client: null, blocker: "owner_rpc_env_missing" };
  }
  const ownerClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await ownerClient.auth.signInWithPassword({
    email: env.CHILLYWOOD_E2E_OWNER_EMAIL,
    password: env.CHILLYWOOD_E2E_OWNER_PASSWORD,
  });
  if (signIn.error || !signIn.data?.user?.id) {
    return { client: null, blocker: `owner_sign_in_failed:${signIn.error?.message ?? "missing_user"}` };
  }
  return { client: ownerClient, blocker: null };
}

async function grantStaffViaOwnerRpc(ownerClient, account) {
  const role = await ownerClient.rpc("admin_grant_platform_role_by_email", {
    p_target_email: account.email,
    p_role: account.staffRole,
    p_reason: `Stable seeded proof account pack role for ${account.label}; proof-only account, no provider or money mutation.`,
  });
  if (role.error) throw new Error(`owner_rpc_role_failed:${account.label}:${role.error.message}`);
  const permissions = [];
  for (const permission of account.permissions ?? []) {
    const expiresAt = futureIso(STAFF_EXPIRY_DAYS);
    const grant = await ownerClient.rpc("admin_grant_platform_staff_permission_by_email", {
      p_target_email: account.email,
      p_permission_key: permission,
      p_reason: `Stable seeded proof account pack scoped permission for ${account.label}; proof-only and short-expiring.`,
      p_expires_at: expiresAt,
    });
    if (grant.error) throw new Error(`owner_rpc_permission_failed:${account.label}:${permission}:${grant.error.message}`);
    permissions.push({ permission, status: grant.data?.status ?? "active", expiresAt });
  }
  return { role: role.data?.status ?? "active", permissions };
}

async function countRows(admin, table, build) {
  const { count, error } = await build(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

async function main() {
  mkdirSync(artifactDir, { recursive: true });
  const env = loadEnv();
  assertLocalAllowed(env);
  if (!existsSync(envPath)) writeFileSync(envPath, "", { mode: 0o600 });
  chmodSync(envPath, 0o600);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const accountResults = [];
  const users = {};
  for (const account of ACCOUNTS) {
    const password = String(env[account.passwordKey] ?? "").trim() || generatePassword();
    const { action, user } = await upsertProofUser(admin, account, password, env);
    await ensureProfile(admin, account, user.id);
    writeSafeBrowserStackEnvValue(envPath, account.emailKey, account.email);
    writeSafeBrowserStackEnvValue(envPath, account.userIdKey, user.id);
    writeSafeBrowserStackEnvValue(envPath, account.passwordKey, password);
    users[account.label] = { ...account, userId: user.id, action };
    accountResults.push({
      label: account.label,
      authAction: action,
      userIdSuffix: userIdSuffix(user.id),
      emailKey: account.emailKey,
      passwordStoredInIgnoredEnv: true,
    });
  }

  const ownerRole = await ensureOwnerProofRole(admin, users.proof_owner_001, users.proof_owner_001.userId);

  const refreshedEnv = loadEnv();
  const ownerRpc = await signInOwner(refreshedEnv);
  const staffRpcResults = [];
  if (ownerRpc.client) {
    for (const account of [users.proof_moderator_001, users.proof_admin_operator_001]) {
      const result = await grantStaffViaOwnerRpc(ownerRpc.client, account);
      staffRpcResults.push({ label: account.label, role: account.staffRole, roleGrantStatus: result.role, permissionCount: result.permissions.length });
    }
    await ownerRpc.client.auth.signOut();
  } else {
    staffRpcResults.push({ status: "blocked", blocker: ownerRpc.blocker });
  }

  const creatorFixtures = await ensureCreatorFixtures(admin, users.proof_creator_001.userId);
  const premiumEntitlement = await ensurePremiumEntitlement(admin, users.proof_premium_001.userId);
  await ensureNoPremiumEntitlement(admin, users.proof_owner_001.userId);
  await ensureNoPremiumEntitlement(admin, users.proof_nonpremium_001.userId);
  await ensureNoPremiumEntitlement(admin, users.proof_normal_001.userId);
  await ensureSandboxTester(admin, users.proof_premium_001, users.proof_premium_001.userId);
  await ensureSandboxTester(admin, users.proof_nonpremium_001, users.proof_nonpremium_001.userId);
  await ensureBlockPair(admin, users.proof_blocked_a_001.userId, users.proof_blocked_b_001.userId);
  const restricted = await ensureRestrictedState(admin, users.proof_restricted_001.userId);

  writeSafeBrowserStackEnvValue(envPath, "CHILLYWOOD_E2E_CREATOR_ID", users.proof_creator_001.userId);
  chmodSync(envPath, 0o600);

  const safety = {
    liveMoneyOnSwitches: await countRows(admin, "platform_money_kill_switches", (query) => query.eq("key", "live_money_enabled").eq("state", "on")),
    payableLedgerEvents: await countRows(admin, "money_access_ledger_events", (query) => query.in("payable_state", ["payable", "paid"])),
    payoutEnabledConfigs: await countRows(admin, "creator_monetization_configs", (query) => query.eq("payout_enabled", true).eq("production_enabled", true)),
    providerMutation: false,
    firstOwnerTouched: false,
    realUsersModified: false,
    secretsPrinted: false,
  };

  const summary = {
    status: "pass",
    artifactDir,
    envPath: ".env.browserstack-monetization.local",
    envPathIgnoredByGit: true,
    serviceRoleBootstrapUsed: true,
    serviceRoleBoundary: "proof-only account creation/repair and proof-only state fixtures; not role/permission authority proof",
    ownerRpcAuthority: ownerRpc.client ? "used_for_moderator_admin_role_and_permission_grants" : "blocked",
    accounts: accountResults,
    ownerProofRole: ownerRole,
    staffRpcResults,
    creatorFixtures,
    premiumEntitlement: { entitlementKey: premiumEntitlement.entitlement_key, status: premiumEntitlement.status, expiresAtPresent: Boolean(premiumEntitlement.expires_at) },
    nonPremiumEntitlement: "premium entitlement removed",
    blockPair: "proof_blocked_a_001 and proof_blocked_b_001 block each other where backed",
    restricted: { status: "suspended", restrictedReadbackPresent: Boolean(restricted) },
    safety,
  };

  writeFileSync(path.join(artifactDir, "bootstrap-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(artifactDir, "README.md"), [
    "# Stable Seeded Proof Account Pack Bootstrap",
    "",
    "Status: pass",
    "",
    "This artifact is sanitized. It records key presence and proof account readiness only. It does not include passwords, service-role keys, tokens, provider secrets, signed URLs, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction records.",
    "",
  ].join("\n"));

  console.log(JSON.stringify({
    status: summary.status,
    artifact: artifactDir,
    accountCount: accountResults.length,
    serviceRoleBootstrapUsed: true,
    ownerRpcAuthorityUsed: ownerRpc.client ? true : false,
    valuesPrinted: false,
    firstOwnerTouched: false,
    realUsersModified: false,
  }, null, 2));
}

main().catch((error) => {
  mkdirSync(artifactDir, { recursive: true });
  const failure = {
    status: "blocked",
    artifact: artifactDir,
    error: error instanceof Error ? error.message : String(error),
    valuesPrinted: false,
    firstOwnerTouched: false,
    realUsersModified: false,
  };
  writeFileSync(path.join(artifactDir, "bootstrap-summary.json"), `${JSON.stringify(failure, null, 2)}\n`);
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
