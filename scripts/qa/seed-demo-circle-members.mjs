#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile } from "./browserstack-env.mjs";

const SCRIPT_NAME = "seed-demo-circle-members";
const TARGET_EMAILS = [
  "rob2008gn@gmail.com",
  "rob2037gn@gmail.com",
  "chillywood92@gmail.com",
];

const DEMO_MEMBERS = [
  { key: "creator-one", displayName: "Demo Creator One", username: "democircle01", role: "creator", tagline: "QA-only demo creator profile. Not a real person." },
  { key: "viewer-two", displayName: "Demo Viewer Two", username: "democircle02", role: "viewer", tagline: "QA-only demo viewer profile. Not a real person." },
  { key: "chicago-film-fan", displayName: "Demo Chicago Film Fan", username: "democircle03", role: "viewer", tagline: "QA-only film fan for internal Circle screenshots." },
  { key: "music-host", displayName: "Demo Music Host", username: "democircle04", role: "creator", tagline: "QA-only watch host for internal proof." },
  { key: "watch-party-fan", displayName: "Demo Watch Party Fan", username: "democircle05", role: "viewer", tagline: "QA-only Party Room fan. No paid access." },
  { key: "platform-subscriber", displayName: "Demo Platform Subscriber", username: "democircle06", role: "viewer", tagline: "QA-only profile label. No subscription grant." },
  { key: "event-planner", displayName: "Demo Event Planner", username: "democircle07", role: "creator", tagline: "QA-only event-interest profile. No event pass." },
  { key: "indie-director", displayName: "Demo Indie Director", username: "democircle08", role: "creator", tagline: "QA-only creator persona. Not a real person." },
  { key: "late-night-viewer", displayName: "Demo Late Night Viewer", username: "democircle09", role: "viewer", tagline: "QA-only viewer persona for profile population." },
  { key: "private-member", displayName: "Demo Private Member", username: "democircle10", role: "viewer", tagline: "QA-only private visibility example." },
  { key: "subscriber-only-member", displayName: "Demo Subscriber Visibility", username: "democircle11", role: "viewer", tagline: "QA-only subscriber visibility example. No paid access." },
  { key: "blocked-example", displayName: "Demo Blocked Example", username: "democircle12", role: "viewer", tagline: "QA-only blocked-user example." },
  { key: "pending-one", displayName: "Demo Pending Request One", username: "democircle13", role: "viewer", tagline: "QA-only pending Circle request example." },
  { key: "pending-two", displayName: "Demo Pending Request Two", username: "democircle14", role: "viewer", tagline: "QA-only outgoing Circle request example." },
  { key: "cinema-regular", displayName: "Demo Cinema Regular", username: "democircle15", role: "viewer", tagline: "QA-only regular viewer profile." },
  { key: "community-host", displayName: "Demo Community Host", username: "democircle16", role: "creator", tagline: "QA-only community host profile." },
  { key: "creator-supporter", displayName: "Demo Creator Supporter", username: "democircle17", role: "viewer", tagline: "QA-only supporter identity. No tip or VIP grant." },
  { key: "room-regular", displayName: "Demo Room Regular", username: "democircle18", role: "viewer", tagline: "QA-only room regular. No room ticket." },
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

function proofRootFromArgs() {
  const direct = process.argv.find((arg) => arg.startsWith("--proof-root="))?.slice("--proof-root=".length);
  if (direct) return path.resolve(direct);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `/tmp/chillywood-demo-circle-seed-proof-${stamp}`;
}

function requireEnv(env, key) {
  const value = String(env[key] ?? "").trim();
  if (!value) throw new Error(`missing_env:${key}`);
  return value;
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function demoEmail(member) {
  return `demo-circle-${member.key}@chillywood.test`;
}

function createPassword() {
  return `${randomBytes(24).toString("base64url")}Aa1`;
}

function demoMetadata(member) {
  return {
    demo_seed: true,
    created_by: SCRIPT_NAME,
    not_real_user: true,
    qa_only: true,
    seed_key: member.key,
  };
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

async function updateUserMetadata(admin, user, member) {
  const metadata = demoMetadata(member);
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      ...metadata,
      role: "qa_demo_circle_member",
    },
    user_metadata: {
      ...(user.user_metadata ?? {}),
      ...metadata,
      display_name: member.displayName,
    },
  });
  if (error) throw new Error(`update_demo_user_metadata:${error.message}`);
  return data?.user ?? user;
}

async function ensureDemoUser(admin, member) {
  const email = demoEmail(member);
  const existing = await findUserByEmail(admin, email);
  if (existing?.id) return updateUserMetadata(admin, existing, member);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: createPassword(),
    email_confirm: true,
    app_metadata: {
      ...demoMetadata(member),
      role: "qa_demo_circle_member",
    },
    user_metadata: {
      ...demoMetadata(member),
      display_name: member.displayName,
    },
  });
  if (error || !data?.user?.id) throw new Error(`create_demo_user:${email}:${error?.message ?? "missing_user"}`);
  return data.user;
}

function relationshipPair(leftId, rightId) {
  return {
    user_low_id: leftId < rightId ? leftId : rightId,
    user_high_id: leftId < rightId ? rightId : leftId,
  };
}

async function ensureProfile(admin, userId, member, overrides = {}) {
  const now = new Date().toISOString();
  await requireOk("upsert_demo_profile", admin
    .from("user_profiles")
    .upsert({
      user_id: userId,
      username: member.username,
      display_name: member.displayName,
      channel_role: member.role,
      profile_visibility: overrides.profile_visibility ?? "everyone",
      profile_access_visibility: overrides.profile_access_visibility ?? "public",
      platform_access_visibility: overrides.platform_access_visibility ?? "private",
      public_activity_visibility: overrides.public_activity_visibility ?? "public",
      follower_surface_enabled: true,
      subscriber_surface_enabled: false,
      tagline: `${member.tagline} QA demo seed: true.`,
      updated_at: now,
    }, { onConflict: "user_id" })
    .select("user_id")
    .single());
}

async function ensureTargetProfileIfMissing(admin, target) {
  const { data, error } = await admin
    .from("user_profiles")
    .select("user_id,username,display_name,tagline")
    .eq("user_id", target.userId)
    .maybeSingle();
  if (error) throw new Error(`read_target_profile:${error.message}`);
  if (data?.user_id) return { existed: true, changed: false };

  const username = normalizeEmail(target.email).split("@")[0].replace(/[^a-z0-9_.]/g, "_").slice(0, 24);
  await requireOk("insert_target_profile", admin
    .from("user_profiles")
    .insert({
      user_id: target.userId,
      username,
      display_name: username,
      channel_role: "viewer",
      profile_visibility: "everyone",
      profile_access_visibility: "public",
      platform_access_visibility: "public",
      public_activity_visibility: "public",
      follower_surface_enabled: true,
      subscriber_surface_enabled: false,
      tagline: "Internal tester profile for QA proof.",
      updated_at: new Date().toISOString(),
    })
    .select("user_id")
    .single());
  return { existed: false, changed: true };
}

async function upsertFollow(admin, channelUserId, followerUserId) {
  await requireOk("upsert_channel_follow", admin
    .from("channel_followers")
    .upsert({ channel_user_id: channelUserId, follower_user_id: followerUserId, updated_at: new Date().toISOString() }, { onConflict: "channel_user_id,follower_user_id" })
    .select("channel_user_id,follower_user_id")
    .single());
}

async function upsertFriendship(admin, leftUserId, rightUserId, status = "active", requestedByUserId = leftUserId) {
  const now = new Date().toISOString();
  const pair = relationshipPair(leftUserId, rightUserId);
  await requireOk("upsert_friendship", admin
    .from("user_friendships")
    .upsert({
      ...pair,
      requested_by_user_id: requestedByUserId,
      status,
      responded_at: status === "active" ? now : null,
      actioned_by_user_id: status === "active" ? rightUserId : null,
      updated_at: now,
    }, { onConflict: "user_low_id,user_high_id" })
    .select("user_low_id,user_high_id,status")
    .single());
}

async function upsertBlock(admin, channelUserId, blockedUserId) {
  await requireOk("upsert_block", admin
    .from("channel_audience_blocks")
    .upsert({
      channel_user_id: channelUserId,
      blocked_user_id: blockedUserId,
      blocked_by_user_id: channelUserId,
      reason: "qa_demo_circle_seed_block_example",
      updated_at: new Date().toISOString(),
    }, { onConflict: "channel_user_id,blocked_user_id" })
    .select("channel_user_id,blocked_user_id")
    .single());
}

async function countRows(admin, table, build) {
  const { count, error } = await build(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

async function countCircleForUser(admin, userId) {
  const { count, error } = await admin
    .from("user_friendships")
    .select("*", { count: "exact", head: true })
    .or(`user_low_id.eq.${userId},user_high_id.eq.${userId}`)
    .eq("status", "active");
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = requireEnv(env, "SUPABASE_URL");
  const serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const proofRoot = proofRootFromArgs();
  mkdirSync(proofRoot, { recursive: true });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const targets = [];
  for (const email of TARGET_EMAILS) {
    const user = await findUserByEmail(admin, email);
    if (!user?.id) throw new Error(`missing_target_auth_user:${email}`);
    targets.push({ email, userId: user.id });
  }

  const targetProfileResults = [];
  for (const target of targets) {
    targetProfileResults.push({ email: target.email, ...(await ensureTargetProfileIfMissing(admin, target)) });
  }

  const demoUsers = [];
  for (const member of DEMO_MEMBERS) {
    const user = await ensureDemoUser(admin, member);
    const visibility = member.key === "private-member"
      ? { profile_access_visibility: "private", platform_access_visibility: "private", public_activity_visibility: "private" }
      : member.key === "subscriber-only-member"
        ? { profile_access_visibility: "subscriber_only", platform_access_visibility: "subscriber_only", public_activity_visibility: "subscribers_only" }
        : {};
    await ensureProfile(admin, user.id, member, visibility);
    demoUsers.push({ ...member, email: demoEmail(member), userId: user.id });
  }

  const activeDemoMembers = demoUsers.filter((member) => !member.key.startsWith("pending") && member.key !== "blocked-example");
  for (const target of targets) {
    for (const member of activeDemoMembers.slice(0, 12)) {
      await upsertFollow(admin, target.userId, member.userId);
      await upsertFollow(admin, member.userId, target.userId);
      await upsertFriendship(admin, target.userId, member.userId, "active", target.userId);
    }
    await upsertFriendship(admin, target.userId, demoUsers.find((member) => member.key === "pending-one").userId, "pending", target.userId);
    await upsertFriendship(admin, target.userId, demoUsers.find((member) => member.key === "pending-two").userId, "pending", demoUsers.find((member) => member.key === "pending-two").userId);
    await upsertFollow(admin, target.userId, demoUsers.find((member) => member.key === "blocked-example").userId);
    await upsertBlock(admin, target.userId, demoUsers.find((member) => member.key === "blocked-example").userId);
  }

  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      await upsertFollow(admin, targets[i].userId, targets[j].userId);
      await upsertFollow(admin, targets[j].userId, targets[i].userId);
      await upsertFriendship(admin, targets[i].userId, targets[j].userId, "active", targets[i].userId);
    }
  }

  for (let i = 0; i < activeDemoMembers.length - 1; i += 1) {
    await upsertFriendship(admin, activeDemoMembers[i].userId, activeDemoMembers[i + 1].userId, "active", activeDemoMembers[i].userId);
    await upsertFollow(admin, activeDemoMembers[i + 1].userId, activeDemoMembers[i].userId);
  }

  const demoIds = demoUsers.map((member) => member.userId);
  const targetReadback = [];
  for (const target of targets) {
    targetReadback.push({
      email: target.email,
      userId: target.userId,
      followers: await countRows(admin, "channel_followers", (query) => query.eq("channel_user_id", target.userId)),
      following: await countRows(admin, "channel_followers", (query) => query.eq("follower_user_id", target.userId)),
      activeCircle: await countCircleForUser(admin, target.userId),
      blocks: await countRows(admin, "channel_audience_blocks", (query) => query.eq("channel_user_id", target.userId)),
    });
  }

  const safety = {
    demoAccessGrants: await countRows(admin, "access_grants", (query) => query.in("user_id", demoIds)),
    demoVipPasses: await countRows(admin, "creator_vip_passes", (query) => query.in("fan_id", demoIds)),
    demoCreatorSubscriptions: await countRows(admin, "creator_channel_subscriptions", (query) => query.in("subscriber_id", demoIds)),
    demoPaidVideoGrants: await countRows(admin, "content_access_grants", (query) => query.in("user_id", demoIds)),
    demoEventPassAccessGrants: await countRows(admin, "access_grants", (query) => query.in("user_id", demoIds).eq("grant_type", "event_pass")),
    demoPartyTickets: await countRows(admin, "paid_watch_party_tickets", (query) => query.in("buyer_id", demoIds)),
    demoPlatformRoles: await countRows(admin, "platform_role_memberships", (query) => query.in("user_id", demoIds).eq("status", "active")),
    liveMoneyOnSwitches: await countRows(admin, "platform_money_kill_switches", (query) => query.eq("key", "live_money_enabled").eq("state", "on")),
    payableLedgerEvents: await countRows(admin, "money_access_ledger_events", (query) => query.in("user_id", demoIds).in("payable_state", ["payable", "paid"])),
  };

  const output = {
    ok: true,
    proofRoot,
    targetAccounts: targets,
    demoMemberCount: demoUsers.length,
    demoUsers: demoUsers.map((member) => ({
      email: member.email,
      userId: member.userId,
      displayName: member.displayName,
      username: member.username,
      qaOnly: true,
      notRealUser: true,
    })),
    targetProfileResults,
    seededRelationships: {
      activeDemoCirclePerTarget: 12,
      activeTargetTargetCirclePairs: 3,
      pendingRequestsPerTarget: 2,
      blockedExamplesPerTarget: 1,
      bidirectionalFollowsBetweenTargets: true,
      bidirectionalFollowsBetweenTargetsAndDemoMembers: true,
    },
    targetReadback,
    safety,
    resetCommand: `node scripts/qa/reset-demo-circle-members.mjs --proof-root=${proofRoot}`,
    notes: [
      "user_profiles has no metadata column in the current schema; demo markers are stored in Auth app/user metadata and visible QA-only profile copy.",
      "No money/access-grant tables are written by this seed script.",
      "Default reset removes demo users and demo relationships; target-to-target links require --include-target-links.",
    ],
    secretsPrinted: false,
  };

  writeFileSync(path.join(proofRoot, "seed_demo_circle_redacted.log"), `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(path.join(proofRoot, "demo-circle-seed-proof-report.md"), [
    "# Chi'llywood Demo Circle Seed Proof",
    "",
    `Date: ${new Date().toISOString()}`,
    `Target accounts: ${TARGET_EMAILS.join(", ")}`,
    `Proof folder: ${proofRoot}`,
    "",
    "## What was seeded",
    `- Demo users created/upserted: ${demoUsers.length}`,
    "- Demo relationships created: active Circle, follower/following, pending request, and blocked examples.",
    "- Target account relationships created: active Circle and bidirectional follows among the three target accounts.",
    "- Pending/blocked examples: two pending Circle rows per target and one blocked demo profile per target.",
    "",
    "## Safety",
    "- Demo/test users are clearly marked in Auth metadata and visible QA-only profile copy.",
    "- No fake real people, celebrities, or brands were seeded.",
    "- No fake purchases, payouts, Premium, VIP, subscriptions, tickets, event passes, or paid-video grants were created.",
    "- No LiveKit authority, RLS policy, mobile service-role usage, payout, or live-money behavior changed.",
    "",
    "## UI proof",
    "- Backend readback shows populated Circle/follow counts for each target account.",
    "- Attached-device visual screenshots should be captured separately if a logged-in target session is available.",
    "",
    "## Reset",
    `- Default reset command: \`${output.resetCommand}\``,
    "- Add `--include-target-links` only if the target-to-target tester relationships should be removed too.",
    "",
  ].join("\n"));

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
