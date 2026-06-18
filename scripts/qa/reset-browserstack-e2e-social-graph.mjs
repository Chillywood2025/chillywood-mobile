#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile } from "./browserstack-env.mjs";

const ENV_PATH = ".env.browserstack-monetization.local";
const DEFAULT_PROOF_ROOT = `/tmp/chillywood-browserstack-e2e-social-graph-reset-${new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+$/, "")
  .replace("T", "-")}`;

const EMAILS = [
  "bs_e2e_owner_01@chillywood.test",
  "bs_e2e_viewer_01@chillywood.test",
  "bs_e2e_viewer_02@chillywood.test",
  "bs_e2e_viewer_03@chillywood.test",
  "bs_e2e_viewer_04@chillywood.test",
  "bs_e2e_viewer_05@chillywood.test",
  "bs_e2e_viewer_06@chillywood.test",
  "bs_e2e_viewer_07@chillywood.test",
  "bs_e2e_viewer_08@chillywood.test",
  "bs_e2e_viewer_09@chillywood.test",
];

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
  if (!/^bs_e2e_(owner|viewer)_\d{2}@chillywood\.test$/i.test(email)) {
    throw new Error(`refusing_non_e2e_email:${email}`);
  }
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

function pair(ownerId, viewerId) {
  return {
    user_low_id: ownerId < viewerId ? ownerId : viewerId,
    user_high_id: ownerId < viewerId ? viewerId : ownerId,
  };
}

async function main() {
  const env = loadEnv();
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) throw new Error(`missing_env:${missing.join(",")}`);
  const proofRoot = path.resolve(process.argv.find((arg) => arg.startsWith("--proof-root="))?.slice("--proof-root=".length) || DEFAULT_PROOF_ROOT);
  mkdirSync(proofRoot, { recursive: true });

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users = [];
  for (const email of EMAILS) {
    const user = await findUserByEmail(admin, email);
    if (user?.id) users.push({ email, userId: user.id });
  }
  const owner = users.find((user) => user.email === "bs_e2e_owner_01@chillywood.test");
  if (!owner?.userId) throw new Error("missing_owner");
  const viewers = users.filter((user) => user.email !== owner.email);
  const viewerIds = viewers.map((user) => user.userId);
  const now = new Date().toISOString();

  for (const viewer of viewers) {
    const friendship = pair(owner.userId, viewer.userId);
    await requireOk("delete_follow", admin.from("channel_followers").delete().eq("channel_user_id", owner.userId).eq("follower_user_id", viewer.userId));
    await requireOk("delete_legacy_subscriber", admin.from("channel_subscribers").delete().eq("channel_user_id", owner.userId).eq("subscriber_user_id", viewer.userId));
    await requireOk("delete_block", admin.from("channel_audience_blocks").delete().eq("channel_user_id", owner.userId).eq("blocked_user_id", viewer.userId));
    await requireOk("delete_friendship", admin.from("user_friendships").delete().eq("user_low_id", friendship.user_low_id).eq("user_high_id", friendship.user_high_id));
  }

  await requireOk("revoke_access_grants", admin
    .from("access_grants")
    .update({ status: "revoked", revoked_at: now, revoke_reason: "browserstack_e2e_social_graph_reset" })
    .in("user_id", viewerIds)
    .contains("metadata", { browserstack_e2e_social_graph: true }));
  await requireOk("revoke_creator_subscriptions", admin
    .from("creator_channel_subscriptions")
    .update({ status: "revoked", revoked_at: now, metadata: { browserstack_e2e_social_graph: true, reset_at: now } })
    .eq("creator_id", owner.userId)
    .in("subscriber_id", viewerIds)
    .contains("metadata", { browserstack_e2e_social_graph: true }));
  await requireOk("revoke_vip_passes", admin
    .from("creator_vip_passes")
    .update({ status: "revoked", revoked_at: now, metadata: { browserstack_e2e_social_graph: true, reset_at: now } })
    .eq("creator_id", owner.userId)
    .in("fan_id", viewerIds)
    .contains("metadata", { browserstack_e2e_social_graph: true }));
  await requireOk("reset_owner_access_visibility", admin
    .from("user_profiles")
    .update({ profile_access_visibility: "public", platform_access_visibility: "public", updated_at: now })
    .eq("user_id", owner.userId));

  const output = {
    ok: true,
    proofRoot,
    ownerEmail: owner.email,
    ownerUserId: owner.userId,
    viewerCount: viewers.length,
    resetRelationships: true,
    revokedSyntheticAccess: true,
    ownerVisibilityResetToPublic: true,
    secretsPrinted: false,
    realUsersTouched: false,
  };
  writeFileSync(path.join(proofRoot, "reset_social_graph_redacted.log"), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
