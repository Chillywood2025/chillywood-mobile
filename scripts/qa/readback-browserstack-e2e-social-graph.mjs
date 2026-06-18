#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile } from "./browserstack-env.mjs";

const ENV_PATH = ".env.browserstack-monetization.local";
const DEFAULT_PROOF_ROOT = `/tmp/chillywood-browserstack-e2e-social-graph-proof-${new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+$/, "")
  .replace("T", "-")}`;

const ROLE_TARGETS = [
  { key: "owner", label: "Owner creator", email: "bs_e2e_owner_01@chillywood.test", passwordKey: "CHILLYWOOD_E2E_OWNER_PASSWORD" },
  { key: "primaryViewer", label: "Primary viewer/tester", email: "bs_e2e_viewer_01@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_PASSWORD" },
  { key: "followerOnly", label: "Follower-only viewer", email: "bs_e2e_viewer_02@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_02_PASSWORD" },
  { key: "circleMember", label: "Circle member viewer", email: "bs_e2e_viewer_03@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_03_PASSWORD" },
  { key: "subscriber", label: "Subscriber viewer", email: "bs_e2e_viewer_04@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_04_PASSWORD" },
  { key: "vip", label: "VIP viewer", email: "bs_e2e_viewer_05@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_05_PASSWORD" },
  { key: "blocked", label: "Blocked viewer", email: "bs_e2e_viewer_06@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_06_PASSWORD" },
  { key: "publicViewer", label: "Public/non-related viewer", email: "bs_e2e_viewer_07@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_07_PASSWORD" },
  { key: "backupOne", label: "Backup viewer 1", email: "bs_e2e_viewer_08@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_08_PASSWORD" },
  { key: "backupTwo", label: "Backup viewer 2", email: "bs_e2e_viewer_09@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_09_PASSWORD" },
];

const EXPECTED = {
  owner: { profile: true, platform: true, subscription: true, vip: true },
  primaryViewer: { profile: false, platform: false, subscription: false, vip: false },
  followerOnly: { profile: false, platform: false, subscription: false, vip: false },
  circleMember: { profile: true, platform: false, subscription: false, vip: false },
  subscriber: { profile: true, platform: true, subscription: true, vip: false },
  vip: { profile: false, platform: false, subscription: false, vip: true },
  blocked: { profile: false, platform: false, subscription: false, vip: false },
  publicViewer: { profile: false, platform: false, subscription: false, vip: false },
  backupOne: { profile: false, platform: false, subscription: false, vip: false },
  backupTwo: { profile: false, platform: false, subscription: false, vip: false },
};

function loadEnv() {
  return [".env.local", ".env.browserstack.local", ENV_PATH]
    .map((file) => path.resolve(process.cwd(), file))
    .reduce((env, file) => ({ ...env, ...parseEnvFile(file) }), { ...process.env });
}

async function requireOk(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function findUserByEmail(admin, email) {
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

async function countRows(admin, table, build) {
  const { count, error } = await build(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

async function countActiveCircleRows(admin, ownerId, viewerIds) {
  let count = 0;
  for (const viewerId of viewerIds) {
    const low = ownerId < viewerId ? ownerId : viewerId;
    const high = ownerId < viewerId ? viewerId : ownerId;
    const { count: rowCount, error } = await admin
      .from("user_friendships")
      .select("*", { count: "exact", head: true })
      .eq("user_low_id", low)
      .eq("user_high_id", high)
      .eq("status", "active");
    if (error) return { ok: false, error: error.message };
    count += rowCount ?? 0;
  }
  return { ok: true, count };
}

function allowed(value) {
  return value && typeof value === "object" && value.allowed === true;
}

async function evaluateRole(env, ownerId, role) {
  const password = String(env[role.passwordKey] ?? "").trim();
  if (!password) throw new Error(`missing_password_for_${role.key}`);
  const client = createClient(env.SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: role.email, password });
  if (signInError || !signIn?.user?.id) throw new Error(`sign_in_failed:${role.email}:${signInError?.message ?? "unknown"}`);

  const profile = await requireOk(`${role.key}_profile_access`, client.rpc("resolve_profile_visibility_access", { profile_owner_id: ownerId }));
  const platform = await requireOk(`${role.key}_platform_access`, client.rpc("resolve_platform_visibility_access", { platform_owner_id: ownerId }));
  const subscription = await requireOk(`${role.key}_subscription_access`, client.rpc("resolve_creator_channel_subscription_access", { p_creator_id: ownerId }));
  const vip = await requireOk(`${role.key}_vip_access`, client.rpc("resolve_creator_vip_pass_access", { p_creator_id: ownerId }));
  await client.auth.signOut();

  const actual = {
    profile: allowed(profile),
    platform: allowed(platform),
    subscription: allowed(subscription),
    vip: allowed(vip),
  };
  const expected = EXPECTED[role.key];
  return {
    key: role.key,
    label: role.label,
    email: role.email,
    userId: signIn.user.id,
    actual,
    expected,
    pass: Object.entries(expected).every(([surface, expectedAllowed]) => actual[surface] === expectedAllowed),
    reasons: {
      profile: profile?.reason ?? null,
      platform: platform?.reason ?? null,
      subscription: subscription?.reason ?? null,
      vip: vip?.reason ?? null,
    },
    flags: {
      isBlocked: profile?.is_blocked === true || platform?.is_blocked === true,
      isCircleMember: profile?.is_circle_member === true || platform?.is_circle_member === true,
      isSubscriber: profile?.is_subscriber === true || platform?.is_subscriber === true,
      isFollower: profile?.is_follower === true || platform?.is_follower === true,
    },
  };
}

async function main() {
  const env = loadEnv();
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EXPO_PUBLIC_SUPABASE_ANON_KEY"];
  const missing = required.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) throw new Error(`missing_env:${missing.join(",")}`);
  const proofRoot = path.resolve(process.argv.find((arg) => arg.startsWith("--proof-root="))?.slice("--proof-root=".length) || DEFAULT_PROOF_ROOT);
  mkdirSync(proofRoot, { recursive: true });

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const owner = await findUserByEmail(admin, "bs_e2e_owner_01@chillywood.test");
  if (!owner?.id) throw new Error("missing_owner");

  const users = [];
  for (const role of ROLE_TARGETS) {
    const user = await findUserByEmail(admin, role.email);
    users.push({ key: role.key, email: role.email, userId: user?.id ?? null, exists: !!user, e2eMetadata: user?.app_metadata?.role === "e2e" });
  }

  const matrix = [];
  for (const role of ROLE_TARGETS) {
    matrix.push(await evaluateRole(env, owner.id, role));
  }
  const allPass = matrix.every((row) => row.pass);
  const viewerIds = users.filter((user) => user.key !== "owner" && user.userId).map((user) => user.userId);

  const relationshipReadback = {
    followers: await countRows(admin, "channel_followers", (query) => query.eq("channel_user_id", owner.id).in("follower_user_id", viewerIds)),
    circle: await countActiveCircleRows(admin, owner.id, viewerIds),
    blocks: await countRows(admin, "channel_audience_blocks", (query) => query.eq("channel_user_id", owner.id).in("blocked_user_id", viewerIds)),
    legacySubscribers: await countRows(admin, "channel_subscribers", (query) => query.eq("channel_user_id", owner.id).in("subscriber_user_id", viewerIds).eq("status", "active")),
    creatorSubscriptions: await countRows(admin, "creator_channel_subscriptions", (query) => query.eq("creator_id", owner.id).in("subscriber_id", viewerIds).in("status", ["active", "trialing", "grace_period", "cancel_pending"])),
    vipPasses: await countRows(admin, "creator_vip_passes", (query) => query.eq("creator_id", owner.id).in("fan_id", viewerIds).eq("status", "active")),
  };

  const safety = {
    liveMoneyOnSwitches: await countRows(admin, "platform_money_kill_switches", (query) => query.eq("key", "live_money_enabled").eq("state", "on")),
    ownerPayableLedgerEvents: await countRows(admin, "money_access_ledger_events", (query) => query.eq("creator_id", owner.id).in("payable_state", ["payable", "paid"])),
    ownerPayoutEnabledConfigs: await countRows(admin, "creator_monetization_configs", (query) => query.eq("creator_id", owner.id).eq("payout_enabled", true)),
    socialGraphAccessGrants: await countRows(admin, "access_grants", (query) => query.in("user_id", viewerIds).contains("metadata", { browserstack_e2e_social_graph: true }).eq("environment", "sandbox")),
  };

  const output = {
    ok: allPass,
    proofRoot,
    accountCount: users.filter((user) => user.exists).length,
    users,
    ownerUserId: owner.id,
    accessMatrix: matrix,
    relationshipReadback,
    safety,
    secretsPrinted: false,
    realUsersTouched: false,
  };

  writeFileSync(path.join(proofRoot, "readback_social_graph_redacted.log"), `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(path.join(proofRoot, "access_matrix_readback.log"), `${JSON.stringify({ ok: allPass, matrix }, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  if (!allPass) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
