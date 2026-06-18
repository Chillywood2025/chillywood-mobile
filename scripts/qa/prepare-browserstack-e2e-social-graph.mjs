#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile, writeSafeBrowserStackEnvValue } from "./browserstack-env.mjs";

const ENV_PATH = ".env.browserstack-monetization.local";
const DEFAULT_PROOF_ROOT = `/tmp/chillywood-browserstack-e2e-social-graph-proof-${new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+$/, "")
  .replace("T", "-")}`;

const ROLES = {
  owner: { label: "Owner creator", email: "bs_e2e_owner_01@chillywood.test" },
  primaryViewer: { label: "Primary viewer/tester", email: "bs_e2e_viewer_01@chillywood.test" },
  followerOnly: { label: "Follower-only viewer", email: "bs_e2e_viewer_02@chillywood.test" },
  circleMember: { label: "Circle member viewer", email: "bs_e2e_viewer_03@chillywood.test" },
  subscriber: { label: "Subscriber viewer", email: "bs_e2e_viewer_04@chillywood.test" },
  vip: { label: "VIP viewer", email: "bs_e2e_viewer_05@chillywood.test" },
  blocked: { label: "Blocked viewer", email: "bs_e2e_viewer_06@chillywood.test" },
  publicViewer: { label: "Public/non-related viewer", email: "bs_e2e_viewer_07@chillywood.test" },
  backupOne: { label: "Backup viewer 1", email: "bs_e2e_viewer_08@chillywood.test" },
  backupTwo: { label: "Backup viewer 2", email: "bs_e2e_viewer_09@chillywood.test" },
};

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CHILLYWOOD_APP_ID"];

function loadEnv() {
  return [".env.local", ".env.browserstack.local", ENV_PATH]
    .map((file) => path.resolve(process.cwd(), file))
    .reduce((env, file) => ({ ...env, ...parseEnvFile(file) }), { ...process.env });
}

function assertSafeEmail(email) {
  if (!/^bs_e2e_(owner|viewer)_\d{2}@chillywood\.test$/i.test(email)) {
    throw new Error(`refusing_non_e2e_email:${email}`);
  }
}

async function requireOk(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function findUserByEmail(admin, email) {
  assertSafeEmail(email);
  let page = 1;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list_users_failed:${error.message}`);
    const user = data?.users?.find((item) => item.email?.toLowerCase() === email.toLowerCase()) ?? null;
    if (user) return user;
    if (!data?.users || data.users.length < 1000) return null;
    page += 1;
  }
  throw new Error("list_users_page_limit_reached");
}

async function loadRoleUsers(admin) {
  const entries = {};
  for (const [key, role] of Object.entries(ROLES)) {
    const user = await findUserByEmail(admin, role.email);
    if (!user?.id) throw new Error(`missing_e2e_user:${role.email}`);
    if (user.app_metadata?.role !== "e2e") throw new Error(`missing_e2e_metadata:${role.email}`);
    entries[key] = { ...role, userId: user.id };
  }
  return entries;
}

function relationPair(ownerId, viewerId) {
  return {
    user_low_id: ownerId < viewerId ? ownerId : viewerId,
    user_high_id: ownerId < viewerId ? viewerId : ownerId,
  };
}

async function clearRoleRelationships(admin, roles) {
  const ownerId = roles.owner.userId;
  const viewerIds = Object.entries(roles)
    .filter(([key]) => key !== "owner")
    .map(([, role]) => role.userId);

  for (const viewerId of viewerIds) {
    const pair = relationPair(ownerId, viewerId);
    await requireOk("delete_channel_followers", admin.from("channel_followers").delete().eq("channel_user_id", ownerId).eq("follower_user_id", viewerId));
    await requireOk("delete_channel_subscribers", admin.from("channel_subscribers").delete().eq("channel_user_id", ownerId).eq("subscriber_user_id", viewerId));
    await requireOk("delete_channel_blocks", admin.from("channel_audience_blocks").delete().eq("channel_user_id", ownerId).eq("blocked_user_id", viewerId));
    await requireOk("delete_friendship", admin.from("user_friendships").delete().eq("user_low_id", pair.user_low_id).eq("user_high_id", pair.user_high_id));
  }

  await requireOk("revoke_social_access_grants", admin
    .from("access_grants")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: "browserstack_e2e_social_graph_reset" })
    .in("user_id", viewerIds)
    .contains("metadata", { browserstack_e2e_social_graph: true }));
}

async function ensureProfiles(admin, roles) {
  const now = new Date().toISOString();
  for (const [key, role] of Object.entries(roles)) {
    await requireOk("upsert_profile", admin
      .from("user_profiles")
      .upsert({
        user_id: role.userId,
        username: role.email.split("@")[0],
        display_name: role.label,
        channel_role: key === "owner" ? "creator" : "viewer",
        profile_visibility: "everyone",
        profile_access_visibility: key === "owner" ? "private" : "public",
        platform_access_visibility: key === "owner" ? "subscriber_only" : "private",
        subscriber_surface_enabled: key === "owner",
        follower_surface_enabled: true,
        tagline: key === "owner" ? "BrowserStack E2E synthetic creator fixture" : "BrowserStack E2E synthetic viewer fixture",
        updated_at: now,
      }, { onConflict: "user_id" })
      .select("user_id")
      .single());
  }
}

async function follow(admin, ownerId, viewerId) {
  await requireOk("upsert_follower", admin
    .from("channel_followers")
    .upsert({ channel_user_id: ownerId, follower_user_id: viewerId }, { onConflict: "channel_user_id,follower_user_id" })
    .select("channel_user_id,follower_user_id")
    .single());
}

async function circle(admin, ownerId, viewerId) {
  const pair = relationPair(ownerId, viewerId);
  await requireOk("upsert_friendship", admin
    .from("user_friendships")
    .upsert({
      ...pair,
      requested_by_user_id: viewerId,
      status: "active",
      responded_at: new Date().toISOString(),
      actioned_by_user_id: ownerId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_low_id,user_high_id" })
    .select("user_low_id,user_high_id,status")
    .single());
}

async function block(admin, ownerId, viewerId) {
  await requireOk("upsert_block", admin
    .from("channel_audience_blocks")
    .upsert({
      channel_user_id: ownerId,
      blocked_user_id: viewerId,
      blocked_by_user_id: ownerId,
      reason: "browserstack_e2e_social_graph_fixture",
      updated_at: new Date().toISOString(),
    }, { onConflict: "channel_user_id,blocked_user_id" })
    .select("channel_user_id,blocked_user_id")
    .single());
}

async function activeOffer(admin, table, ownerId) {
  const { data, error } = await admin
    .from(table)
    .select("id,creator_id,status")
    .eq("creator_id", ownerId)
    .in("status", ["sandbox", "active", "paused", "blocked"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`read_${table}: ${error.message}`);
  if (!data?.id) throw new Error(`missing_${table}_fixture`);
  return data;
}

async function insertGrant(admin, input) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await requireOk("revoke_existing_role_grant", admin
    .from("access_grants")
    .update({ status: "revoked", revoked_at: now, revoke_reason: "browserstack_e2e_social_graph_replace" })
    .eq("user_id", input.userId)
    .eq("grant_type", input.grantType)
    .contains("metadata", { browserstack_e2e_social_graph: true }));
  return requireOk("insert_role_grant", admin
    .from("access_grants")
    .insert({
      user_id: input.userId,
      grant_type: input.grantType,
      source_type: "admin",
      source_id: null,
      environment: "sandbox",
      status: "sandbox_only",
      starts_at: now,
      expires_at: expiresAt,
      provider: "browserstack_e2e_fixture",
      metadata: {
        browserstack_e2e_social_graph: true,
        purpose: "browserstack_e2e",
        environment: "sandbox",
        not_payable: true,
        no_payout: true,
        production_enabled: false,
        payout_enabled: false,
        authority_free: true,
        source_offer_id: input.offerId,
      },
    })
    .select("id,user_id,grant_type,status,environment")
    .single());
}

async function subscribe(admin, ownerId, viewerId, offerId, withGrant = true) {
  let grant = null;
  if (withGrant) {
    grant = await insertGrant(admin, { userId: viewerId, grantType: "channel_subscription", offerId });
  }
  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await requireOk("upsert_legacy_channel_subscriber", admin
    .from("channel_subscribers")
    .upsert({
      channel_user_id: ownerId,
      subscriber_user_id: viewerId,
      status: "active",
      source: "operator_grant",
      started_at: now,
      expires_at: periodEnd,
      updated_at: now,
    }, { onConflict: "channel_user_id,subscriber_user_id" })
    .select("channel_user_id,subscriber_user_id,status")
    .single());
  const { data: existing, error: existingError } = await admin
    .from("creator_channel_subscriptions")
    .select("id")
    .eq("offer_id", offerId)
    .eq("subscriber_id", viewerId)
    .in("status", ["active", "trialing", "grace_period", "cancel_pending"])
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`read_existing_subscription:${existingError.message}`);
  const row = {
    offer_id: offerId,
    creator_id: ownerId,
    subscriber_id: viewerId,
    access_grant_id: grant?.id ?? null,
    provider: "revenuecat_google_play",
    provider_customer_id: "browserstack_e2e_fixture",
    status: "active",
    current_period_start: now,
    current_period_end: periodEnd,
    revoked_at: null,
    expired_at: null,
    metadata: {
      browserstack_e2e_social_graph: true,
      purpose: "browserstack_e2e",
      environment: "sandbox",
      not_payable: true,
      no_payout: true,
      production_enabled: false,
    },
  };
  if (existing?.id) {
    return requireOk("update_subscription", admin.from("creator_channel_subscriptions").update(row).eq("id", existing.id).select("id,status").single());
  }
  return requireOk("insert_subscription", admin.from("creator_channel_subscriptions").insert(row).select("id,status").single());
}

async function vip(admin, ownerId, viewerId, offerId, withGrant = true) {
  let grant = null;
  if (withGrant) {
    grant = await insertGrant(admin, { userId: viewerId, grantType: "vip_pass", offerId });
  }
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("creator_vip_passes")
    .select("id")
    .eq("offer_id", offerId)
    .eq("fan_id", viewerId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`read_existing_vip:${existingError.message}`);
  const row = {
    offer_id: offerId,
    creator_id: ownerId,
    fan_id: viewerId,
    access_grant_id: grant?.id ?? null,
    provider: "revenuecat_google_play",
    provider_transaction_id: null,
    status: "active",
    activated_at: now,
    revoked_at: null,
    refunded_at: null,
    expires_at: null,
    metadata: {
      browserstack_e2e_social_graph: true,
      purpose: "browserstack_e2e",
      environment: "sandbox",
      not_payable: true,
      no_payout: true,
      production_enabled: false,
    },
  };
  if (existing?.id) {
    return requireOk("update_vip", admin.from("creator_vip_passes").update(row).eq("id", existing.id).select("id,status").single());
  }
  return requireOk("insert_vip", admin.from("creator_vip_passes").insert(row).select("id,status").single());
}

function updateRoleEnv(roles) {
  const envPath = path.resolve(process.cwd(), ENV_PATH);
  if (!existsSync(envPath)) throw new Error(`${ENV_PATH} is missing`);
  const pairs = {
    CHILLYWOOD_E2E_OWNER_EMAIL: roles.owner.email,
    CHILLYWOOD_E2E_CREATOR_ID: roles.owner.userId,
    CHILLYWOOD_E2E_VIEWER_EMAIL: roles.primaryViewer.email,
    CHILLYWOOD_E2E_FOLLOWER_ONLY_EMAIL: roles.followerOnly.email,
    CHILLYWOOD_E2E_FOLLOWER_ONLY_USER_ID: roles.followerOnly.userId,
    CHILLYWOOD_E2E_CIRCLE_MEMBER_EMAIL: roles.circleMember.email,
    CHILLYWOOD_E2E_CIRCLE_MEMBER_USER_ID: roles.circleMember.userId,
    CHILLYWOOD_E2E_SUBSCRIBER_EMAIL: roles.subscriber.email,
    CHILLYWOOD_E2E_SUBSCRIBER_USER_ID: roles.subscriber.userId,
    CHILLYWOOD_E2E_VIP_EMAIL: roles.vip.email,
    CHILLYWOOD_E2E_VIP_USER_ID: roles.vip.userId,
    CHILLYWOOD_E2E_BLOCKED_EMAIL: roles.blocked.email,
    CHILLYWOOD_E2E_BLOCKED_USER_ID: roles.blocked.userId,
    CHILLYWOOD_E2E_PUBLIC_VIEWER_EMAIL: roles.publicViewer.email,
    CHILLYWOOD_E2E_PUBLIC_VIEWER_USER_ID: roles.publicViewer.userId,
  };
  for (const [key, value] of Object.entries(pairs)) writeSafeBrowserStackEnvValue(envPath, key, value);
  chmodSync(envPath, 0o600);
}

async function countRows(admin, table, build) {
  const { count, error } = await build(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

async function main() {
  const env = loadEnv();
  const missing = REQUIRED_ENV.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) throw new Error(`missing_env:${missing.join(",")}`);
  if (env.CHILLYWOOD_APP_ID !== "com.chillywood.mobile") throw new Error("CHILLYWOOD_APP_ID must be com.chillywood.mobile");

  const proofRoot = path.resolve(process.argv.find((arg) => arg.startsWith("--proof-root="))?.slice("--proof-root=".length) || DEFAULT_PROOF_ROOT);
  mkdirSync(proofRoot, { recursive: true });

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const roles = await loadRoleUsers(admin);
  const ownerId = roles.owner.userId;
  const subscriptionOffer = await activeOffer(admin, "creator_channel_subscription_offers", ownerId);
  const vipOffer = await activeOffer(admin, "creator_vip_pass_offers", ownerId);

  await clearRoleRelationships(admin, roles);
  await ensureProfiles(admin, roles);

  await follow(admin, ownerId, roles.followerOnly.userId);
  await circle(admin, ownerId, roles.circleMember.userId);
  await subscribe(admin, ownerId, roles.subscriber.userId, subscriptionOffer.id, true);
  await vip(admin, ownerId, roles.vip.userId, vipOffer.id, true);

  await follow(admin, ownerId, roles.blocked.userId);
  await circle(admin, ownerId, roles.blocked.userId);
  await subscribe(admin, ownerId, roles.blocked.userId, subscriptionOffer.id, true);
  await vip(admin, ownerId, roles.blocked.userId, vipOffer.id, true);
  await block(admin, ownerId, roles.blocked.userId);

  updateRoleEnv(roles);

  const viewerIds = Object.entries(roles).filter(([key]) => key !== "owner").map(([, role]) => role.userId);
  const summary = {
    ok: true,
    proofRoot,
    accountCount: Object.keys(roles).length,
    roleMap: Object.fromEntries(Object.entries(roles).map(([key, role]) => [key, { label: role.label, email: role.email, userId: role.userId }])),
    fixtures: {
      ownerProfileAccessVisibility: "private",
      ownerPlatformAccessVisibility: "subscriber_only",
      followerOnly: "channel_followers",
      circleMember: "user_friendships.active",
      subscriber: "channel_subscribers + creator_channel_subscriptions + sandbox access_grant",
      vip: "creator_vip_passes + sandbox access_grant",
      blocked: "channel_audience_blocks; also has follower/circle/subscriber/vip rows so block precedence can be proved",
    },
    safety: {
      liveMoneyOnSwitches: await countRows(admin, "platform_money_kill_switches", (query) => query.eq("key", "live_money_enabled").eq("state", "on")),
      ownerPayableLedgerEvents: await countRows(admin, "money_access_ledger_events", (query) => query.eq("creator_id", ownerId).in("payable_state", ["payable", "paid"])),
      ownerPayoutEnabledConfigs: await countRows(admin, "creator_monetization_configs", (query) => query.eq("creator_id", ownerId).eq("payout_enabled", true)),
      socialGraphAccessGrants: await countRows(admin, "access_grants", (query) => query.in("user_id", viewerIds).contains("metadata", { browserstack_e2e_social_graph: true })),
    },
    secretsPrinted: false,
    realUsersTouched: false,
  };

  writeFileSync(path.join(proofRoot, "prepare_social_graph_redacted.log"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
