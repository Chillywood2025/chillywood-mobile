#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { parseEnvFile } from "./browserstack-env.mjs";

const MONETIZATION_ENV_PATH = ".env.browserstack-monetization.local";
const DEFAULT_PROOF_ROOT = `/tmp/chillywood-browserstack-e2e-account-pool-proof-${new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+$/, "")
  .replace("T", "-")}`;

const TARGETS = [
  { role: "owner", email: "bs_e2e_owner_01@chillywood.test", passwordKey: "CHILLYWOOD_E2E_OWNER_PASSWORD" },
  { role: "viewer", index: "01", email: "bs_e2e_viewer_01@chillywood.test", passwordKey: "CHILLYWOOD_E2E_VIEWER_PASSWORD" },
  ...Array.from({ length: 8 }, (_, offset) => {
    const index = String(offset + 2).padStart(2, "0");
    return {
      role: "viewer",
      index,
      email: `bs_e2e_viewer_${index}@chillywood.test`,
      passwordKey: `CHILLYWOOD_E2E_VIEWER_${index}_PASSWORD`,
    };
  }),
];

function loadLocalEnv() {
  return [".env.local", ".env.browserstack.local", MONETIZATION_ENV_PATH]
    .map((file) => path.resolve(process.cwd(), file))
    .reduce((env, file) => ({ ...env, ...parseEnvFile(file) }), { ...process.env });
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

async function safeSelect(label, promise) {
  const { data, error } = await promise;
  return error ? { ok: false, label, error: error.message } : { ok: true, label, data };
}

async function safeCount(label, promise) {
  const { count, error } = await promise;
  return error ? { ok: false, label, error: error.message } : { ok: true, label, count: count ?? 0 };
}

function countQuery(supabase, table) {
  return supabase.from(table).select("*", { count: "exact", head: true });
}

async function signInCheck(anon, account, env) {
  const password = String(env[account.passwordKey] ?? "").trim();
  if (!password) return { ok: false, email: account.email, reason: "missing_local_password" };
  const { data, error } = await anon.auth.signInWithPassword({ email: account.email, password });
  await anon.auth.signOut();
  return {
    ok: !error && !!data?.user?.id,
    email: account.email,
    userId: data?.user?.id ?? null,
    reason: error?.message ?? null,
  };
}

async function main() {
  const env = loadLocalEnv();
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    "CHILLYWOOD_E2E_CREATOR_ID",
  ];
  const missing = required.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) throw new Error(`missing_env:${missing.join(",")}`);

  const proofRoot = path.resolve(process.argv.find((arg) => arg.startsWith("--proof-root="))?.slice("--proof-root=".length) || DEFAULT_PROOF_ROOT);
  mkdirSync(proofRoot, { recursive: true });

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(env.SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = [];
  for (const target of TARGETS) {
    const user = await findUserByEmail(admin, target.email);
    users.push({
      email: target.email,
      role: target.role,
      userId: user?.id ?? null,
      exists: !!user,
      emailConfirmed: !!user?.email_confirmed_at,
      e2eMetadata: user?.app_metadata?.role === "e2e"
        && user?.app_metadata?.purpose === "browserstack_monetization"
        && user?.app_metadata?.not_payable === true
        && user?.app_metadata?.no_payout === true,
    });
  }

  const owner = users.find((user) => user.email === "bs_e2e_owner_01@chillywood.test");
  const primaryViewer = users.find((user) => user.email === "bs_e2e_viewer_01@chillywood.test");
  if (!owner?.userId || !primaryViewer?.userId) throw new Error("owner_or_primary_viewer_missing");

  const signIn = {
    owner: await signInCheck(anon, TARGETS[0], env),
    primaryViewer: await signInCheck(anon, TARGETS[1], env),
  };

  const viewerIds = users.filter((user) => user.role === "viewer" && user.userId).map((user) => user.userId);
  const profiles = await safeSelect("profiles", admin
    .from("user_profiles")
    .select("user_id,username,display_name,channel_role,profile_visibility,profile_access_visibility,platform_access_visibility,subscriber_surface_enabled")
    .in("user_id", users.map((user) => user.userId).filter(Boolean)));

  const sandboxTesterRows = await safeSelect("sandbox_monetization_testers", admin
    .from("sandbox_monetization_testers")
    .select("id,user_id,email,status,expires_at,revoked_at")
    .eq("status", "active")
    .in("user_id", viewerIds)
    .order("email", { ascending: true }));

  const fixtureReadback = {
    premiumStatus: {
      ok: true,
      scopedToRouteReadback: true,
      productionMoneyEnabled: false,
      note: "Premium entitlement state is not granted or altered by the E2E account pool.",
    },
    tipConfig: await safeSelect("creator_tip_settings", admin
      .from("creator_tip_settings")
      .select("id,creator_id,tips_enabled,status,provider,provider_environment,provider_charges_enabled,provider_payouts_enabled,currency")
      .eq("creator_id", owner.userId)
      .limit(5)),
    paidVideoFixture: await safeSelect("creator_content_prices", admin
      .from("creator_content_prices")
      .select("id,creator_id,content_type,content_id,is_paid,price_cents,currency,status,provider,provider_product_id,provider_product_key")
      .eq("creator_id", owner.userId)
      .eq("content_type", "creator_video")
      .eq("is_paid", true)
      .limit(5)),
    watchPartyTicketFixture: await safeSelect("paid_watch_party_offers", admin
      .from("paid_watch_party_offers")
      .select("id,party_id,creator_id,host_id,status,provider,provider_product_id,provider_product_key,seat_limit")
      .eq("creator_id", owner.userId)
      .limit(5)),
    eventPassFixture: await safeSelect("paid_creator_events", admin
      .from("paid_creator_events")
      .select("id,creator_event_id,creator_id,title,event_type,status,provider,provider_product_id,provider_product_key")
      .eq("creator_id", owner.userId)
      .limit(5)),
    channelSubscriptionFixture: await safeSelect("creator_channel_subscription_offers", admin
      .from("creator_channel_subscription_offers")
      .select("id,creator_id,title,interval,status,provider,provider_product_id,provider_product_key,provider_entitlement_id")
      .eq("creator_id", owner.userId)
      .limit(5)),
    vipFixture: await safeSelect("creator_vip_pass_offers", admin
      .from("creator_vip_pass_offers")
      .select("id,creator_id,title,pass_type,status,provider,provider_product_id,provider_product_key")
      .eq("creator_id", owner.userId)
      .limit(5)),
    creatorConfigs: await safeSelect("creator_monetization_configs", admin
      .from("creator_monetization_configs")
      .select("id,creator_id,source_type,source_id,product_key,product_type,status,environment,payable_state,production_enabled,payout_enabled,grants_livekit_publish,grants_host_authority")
      .eq("creator_id", owner.userId)
      .order("updated_at", { ascending: false })
      .limit(20)),
  };

  const safety = {
    liveMoneyOff: await safeCount("live_money_enabled_switches", countQuery(admin, "platform_money_kill_switches").eq("key", "live_money_enabled").eq("state", "on")),
    productionPurchaseIntents: await safeCount("owner_production_purchase_intents", countQuery(admin, "money_purchase_intents").eq("creator_id", owner.userId).eq("environment", "production")),
    payableLedgerEvents: await safeCount("owner_payable_ledger_events", countQuery(admin, "money_access_ledger_events").eq("creator_id", owner.userId).in("payable_state", ["payable", "paid"])),
    payoutEnabledConfigs: await safeCount("owner_payout_enabled_configs", countQuery(admin, "creator_monetization_configs").eq("creator_id", owner.userId).eq("payout_enabled", true)),
    liveAuthorityConfigs: await safeCount("owner_live_authority_configs", countQuery(admin, "creator_monetization_configs").eq("creator_id", owner.userId).or("production_enabled.eq.true,grants_livekit_publish.eq.true,grants_host_authority.eq.true")),
  };

  const accountReadback = {
    ok: true,
    proofRoot,
    accountsExist: users.every((user) => user.exists),
    accountCount: users.filter((user) => user.exists).length,
    ownerEmail: owner.email,
    ownerUserId: owner.userId,
    primaryViewerEmail: primaryViewer.email,
    primaryViewerUserId: primaryViewer.userId,
    backupViewerCount: users.filter((user) => user.role === "viewer" && user.email !== primaryViewer.email && user.exists).length,
    users,
    signIn,
    profiles,
    sandboxTesterRows,
    sandboxTesterPrimaryActive: Array.isArray(sandboxTesterRows.data)
      && sandboxTesterRows.data.some((row) => row.user_id === primaryViewer.userId && row.status === "active"),
    envFileIgnoredLocalOnly: existsSync(path.resolve(process.cwd(), MONETIZATION_ENV_PATH)),
    secretsPrinted: false,
  };

  const fixtureSummary = {
    ok: true,
    proofRoot,
    ownerUserId: owner.userId,
    fixtureReadback,
    safety,
    fixturePresence: {
      tipConfig: Array.isArray(fixtureReadback.tipConfig.data) && fixtureReadback.tipConfig.data.length > 0,
      paidVideoFixture: Array.isArray(fixtureReadback.paidVideoFixture.data) && fixtureReadback.paidVideoFixture.data.length > 0,
      watchPartyTicketFixture: Array.isArray(fixtureReadback.watchPartyTicketFixture.data) && fixtureReadback.watchPartyTicketFixture.data.length > 0,
      eventPassFixture: Array.isArray(fixtureReadback.eventPassFixture.data) && fixtureReadback.eventPassFixture.data.length > 0,
      channelSubscriptionFixture: Array.isArray(fixtureReadback.channelSubscriptionFixture.data) && fixtureReadback.channelSubscriptionFixture.data.length > 0,
      vipFixture: Array.isArray(fixtureReadback.vipFixture.data) && fixtureReadback.vipFixture.data.length > 0,
      creatorConfigCount: Array.isArray(fixtureReadback.creatorConfigs.data) ? fixtureReadback.creatorConfigs.data.length : 0,
    },
    sandboxOnly: true,
    notPayable: true,
    noSecretsPrinted: true,
  };

  writeFileSync(path.join(proofRoot, "account_readback_redacted.log"), `${JSON.stringify(accountReadback, null, 2)}\n`);
  writeFileSync(path.join(proofRoot, "fixture_readback.log"), `${JSON.stringify(fixtureSummary, null, 2)}\n`);
  console.log(JSON.stringify({ accountReadback, fixtureSummary }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
