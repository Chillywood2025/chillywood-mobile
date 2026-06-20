#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile } from "./browserstack-env.mjs";

const SCRIPT_NAME = "seed-demo-circle-members";
const TARGET_EMAILS = [
  "rob2008gn@gmail.com",
  "rob2037gn@gmail.com",
  "chillywood92@gmail.com",
];
const DEMO_EMAILS = [
  "demo-circle-creator-one@chillywood.test",
  "demo-circle-viewer-two@chillywood.test",
  "demo-circle-chicago-film-fan@chillywood.test",
  "demo-circle-music-host@chillywood.test",
  "demo-circle-watch-party-fan@chillywood.test",
  "demo-circle-platform-subscriber@chillywood.test",
  "demo-circle-event-planner@chillywood.test",
  "demo-circle-indie-director@chillywood.test",
  "demo-circle-late-night-viewer@chillywood.test",
  "demo-circle-private-member@chillywood.test",
  "demo-circle-subscriber-only-member@chillywood.test",
  "demo-circle-blocked-example@chillywood.test",
  "demo-circle-pending-one@chillywood.test",
  "demo-circle-pending-two@chillywood.test",
  "demo-circle-cinema-regular@chillywood.test",
  "demo-circle-community-host@chillywood.test",
  "demo-circle-creator-supporter@chillywood.test",
  "demo-circle-room-regular@chillywood.test",
];

function loadEnv() {
  const extraEnvPath = process.argv.find((arg) => arg.startsWith("--env-path="))?.slice("--env-path=".length);
  return [
    ".env.local",
    ".env.attached-device-monetization.local",
    ".env.demo-circle.local",
    extraEnvPath || "",
  ]
    .filter(Boolean)
    .map((file) => path.resolve(process.cwd(), file))
    .reduce((env, file) => ({ ...env, ...parseEnvFile(file) }), { ...process.env });
}

function requireEnv(env, key) {
  const value = String(env[key] ?? "").trim();
  if (!value) throw new Error(`missing_env:${key}`);
  return value;
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function proofRootFromArgs() {
  const direct = process.argv.find((arg) => arg.startsWith("--proof-root="))?.slice("--proof-root=".length);
  if (direct) return path.resolve(direct);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `/tmp/chillywood-demo-circle-reset-proof-${stamp}`;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function requireOk(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}:${error.message}`);
  return data;
}

async function findUserByEmail(admin, email) {
  const normalized = normalizeEmail(email);
  let page = 1;
  while (page < 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list_users_failed:${error.message}`);
    const users = data?.users ?? [];
    const match = users.find((user) => normalizeEmail(user.email) === normalized) ?? null;
    if (match) return match;
    if (users.length < 1000) return null;
    page += 1;
  }
  throw new Error("list_users_page_limit_reached");
}

function relationshipPair(leftId, rightId) {
  return {
    user_low_id: leftId < rightId ? leftId : rightId,
    user_high_id: leftId < rightId ? rightId : leftId,
  };
}

async function deleteWhereIds(admin, table, column, ids) {
  if (!ids.length) return;
  await requireOk(`delete_${table}_${column}`, admin.from(table).delete().in(column, ids));
}

async function revokeWhereIds(admin, table, column, ids, fields) {
  if (!ids.length) return;
  await requireOk(`revoke_${table}_${column}`, admin.from(table).update(fields).in(column, ids));
}

async function countRows(admin, table, build) {
  const { count, error } = await build(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = requireEnv(env, "SUPABASE_URL");
  const serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const proofRoot = proofRootFromArgs();
  const includeTargetLinks = hasFlag("include-target-links");
  const dryRun = hasFlag("dry-run");
  mkdirSync(proofRoot, { recursive: true });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const demoUsers = [];
  for (const email of DEMO_EMAILS) {
    const user = await findUserByEmail(admin, email);
    if (!user?.id) continue;
    const appMetadata = user.app_metadata ?? {};
    if (appMetadata.demo_seed !== true || appMetadata.created_by !== SCRIPT_NAME) {
      throw new Error(`refusing_unmarked_demo_user:${email}`);
    }
    demoUsers.push({ email, userId: user.id });
  }
  const demoIds = demoUsers.map((user) => user.userId);

  const targets = [];
  for (const email of TARGET_EMAILS) {
    const user = await findUserByEmail(admin, email);
    if (user?.id) targets.push({ email, userId: user.id });
  }

  const beforeCounts = {
    demoProfiles: demoIds.length
      ? await countRows(admin, "user_profiles", (query) => query.in("user_id", demoIds))
      : { ok: true, count: 0 },
    demoAccessGrants: demoIds.length
      ? await countRows(admin, "access_grants", (query) => query.in("user_id", demoIds))
      : { ok: true, count: 0 },
    demoFollowerRowsAsChannel: demoIds.length
      ? await countRows(admin, "channel_followers", (query) => query.in("channel_user_id", demoIds))
      : { ok: true, count: 0 },
    demoFollowerRowsAsFollower: demoIds.length
      ? await countRows(admin, "channel_followers", (query) => query.in("follower_user_id", demoIds))
      : { ok: true, count: 0 },
    demoFriendRowsLow: demoIds.length
      ? await countRows(admin, "user_friendships", (query) => query.in("user_low_id", demoIds))
      : { ok: true, count: 0 },
    demoFriendRowsHigh: demoIds.length
      ? await countRows(admin, "user_friendships", (query) => query.in("user_high_id", demoIds))
      : { ok: true, count: 0 },
  };

  if (!dryRun) {
    await deleteWhereIds(admin, "channel_followers", "channel_user_id", demoIds);
    await deleteWhereIds(admin, "channel_followers", "follower_user_id", demoIds);
    await deleteWhereIds(admin, "channel_audience_blocks", "channel_user_id", demoIds);
    await deleteWhereIds(admin, "channel_audience_blocks", "blocked_user_id", demoIds);
    await deleteWhereIds(admin, "channel_audience_requests", "channel_user_id", demoIds);
    await deleteWhereIds(admin, "channel_audience_requests", "requester_user_id", demoIds);
    await deleteWhereIds(admin, "user_friendships", "user_low_id", demoIds);
    await deleteWhereIds(admin, "user_friendships", "user_high_id", demoIds);
  }

  const now = new Date().toISOString();
  if (!dryRun) {
    await revokeWhereIds(admin, "access_grants", "user_id", demoIds, {
      status: "revoked",
      revoked_at: now,
      revoke_reason: "demo_circle_reset",
    });
  }

  if (!dryRun) {
    await requireOk("delete_demo_profiles", admin.from("user_profiles").delete().in("user_id", demoIds));
  }

  if (!dryRun && includeTargetLinks && targets.length >= 2) {
    for (let i = 0; i < targets.length; i += 1) {
      for (let j = i + 1; j < targets.length; j += 1) {
        const pair = relationshipPair(targets[i].userId, targets[j].userId);
        await requireOk("delete_target_friendship", admin
          .from("user_friendships")
          .delete()
          .eq("user_low_id", pair.user_low_id)
          .eq("user_high_id", pair.user_high_id));
        await requireOk("delete_target_follow_a", admin
          .from("channel_followers")
          .delete()
          .eq("channel_user_id", targets[i].userId)
          .eq("follower_user_id", targets[j].userId));
        await requireOk("delete_target_follow_b", admin
          .from("channel_followers")
          .delete()
          .eq("channel_user_id", targets[j].userId)
          .eq("follower_user_id", targets[i].userId));
      }
    }
  }

  if (!dryRun) {
    for (const user of demoUsers) {
      const { error } = await admin.auth.admin.deleteUser(user.userId);
      if (error) throw new Error(`delete_demo_auth_user:${user.email}:${error.message}`);
    }
  }

  const output = {
    ok: true,
    proofRoot,
    dryRun,
    demoUserCount: demoUsers.length,
    demoUsersDeleted: demoUsers.map((user) => ({ email: user.email, userId: user.userId })),
    targetLinksRemoved: includeTargetLinks,
    beforeCounts,
    remainingDemoProfiles: demoIds.length
      ? await countRows(admin, "user_profiles", (query) => query.in("user_id", demoIds))
      : { ok: true, count: 0 },
    remainingDemoAccessGrants: demoIds.length
      ? await countRows(admin, "access_grants", (query) => query.in("user_id", demoIds))
      : { ok: true, count: 0 },
    safety: {
      noMoneyRowsCreatedByReset: true,
      noRealUsersDeleted: true,
      serviceRolePrinted: false,
    },
  };

  writeFileSync(path.join(proofRoot, "reset_demo_circle_redacted.log"), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "unknown_error",
    secretsPrinted: false,
  }, null, 2));
  process.exit(1);
});
