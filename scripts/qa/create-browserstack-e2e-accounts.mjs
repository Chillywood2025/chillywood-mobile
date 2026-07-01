#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  parseEnvFile,
  writeSafeBrowserStackEnvValue,
} from "./browserstack-env.mjs";

const MONETIZATION_ENV_PATH = ".env.browserstack-monetization.local";
const DEFAULT_PROOF_ROOT = `/tmp/chillywood-browserstack-e2e-account-pool-proof-${new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+$/, "")
  .replace("T", "-")}`;

const TARGET_ACCOUNTS = [
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

const PRODUCT_FIXTURES = [
  {
    key: "paid_content_access_sandbox_099",
    providerProductId: "cw_paid_content_access_sandbox_099",
    productType: "paid_content_access",
    sourceType: "paid_content",
    displayName: "Paid video sandbox fixture",
    priceLabel: "$0.99 sandbox/test",
    priceCents: 99,
  },
  {
    key: "watch_party_live_ticket_sandbox_099",
    providerProductId: "cw_watch_party_live_ticket_sandbox_099",
    productType: "watch_party_live_ticket",
    sourceType: "watch_party_live",
    displayName: "Watch-Party Seat Pass sandbox fixture",
    priceLabel: "$0.99 sandbox/test",
    priceCents: 99,
  },
  {
    key: "creator_tip_sandbox_099",
    providerProductId: "cw_creator_tip_sandbox_099",
    productType: "creator_tip",
    sourceType: "creator_tip",
    displayName: "Creator tip sandbox fixture",
    priceLabel: "$0.99 sandbox/test",
    priceCents: 99,
  },
  {
    key: "event_pass_sandbox_099",
    providerProductId: "cw_event_pass_sandbox_099",
    productType: "event_pass",
    sourceType: "event",
    displayName: "Event pass sandbox fixture",
    priceLabel: "$0.99 sandbox/test",
    priceCents: 99,
  },
  {
    key: "channel_subscription_sandbox_monthly_499",
    providerProductId: "channel_subscription_sandbox_monthly_499",
    productType: "channel_subscription",
    sourceType: "channel_subscription",
    displayName: "Channel subscription sandbox fixture",
    priceLabel: "$4.99/month sandbox/test",
    priceCents: 499,
    providerBasePlanId: "monthly",
    revenuecatEntitlement: "creator_channel_subscription",
  },
  {
    key: "vip_pass_sandbox_499",
    providerProductId: "cw_vip_pass_sandbox_499",
    productType: "vip_pass",
    sourceType: "vip_pass",
    displayName: "VIP pass sandbox fixture",
    priceLabel: "$4.99 sandbox/test",
    priceCents: 499,
  },
];

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "CHILLYWOOD_APP_ID",
];

function loadLocalEnv() {
  const repoRoot = process.cwd();
  const files = [
    path.resolve(repoRoot, ".env.local"),
    path.resolve(repoRoot, ".env.browserstack.local"),
    path.resolve(repoRoot, MONETIZATION_ENV_PATH),
  ];
  return files.reduce((acc, file) => ({ ...acc, ...parseEnvFile(file) }), { ...process.env });
}

function assertSafeEmail(email) {
  if (!/^bs_e2e_(owner|viewer)_\d{2}@chillywood\.test$/i.test(email)) {
    throw new Error(`refusing_to_manage_non_e2e_email:${email}`);
  }
}

function generatePassword() {
  return `CwE2E-${randomBytes(18).toString("base64url")}-26`;
}

function stableUuid(label) {
  const hex = createHash("sha256").update(`chillywood-browserstack-e2e:${label}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${(parseInt(hex.slice(16, 18), 16) & 0x3f | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
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
    const match = data?.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (!data?.users || data.users.length < 1000) return null;
    page += 1;
  }
  throw new Error("list_users_page_limit_reached");
}

async function upsertE2EUser(admin, account, password) {
  assertSafeEmail(account.email);
  const metadata = {
    role: "e2e",
    purpose: "browserstack_monetization",
    account_role: account.role,
    not_payable: true,
    no_payout: true,
  };
  const existing = await findUserByEmail(admin, account.email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      password,
      app_metadata: {
        ...(existing.app_metadata ?? {}),
        ...metadata,
      },
    });
    if (error) throw new Error(`update_user_failed:${account.email}:${error.message}`);
    return { action: "updated", user: data.user };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    app_metadata: metadata,
    user_metadata: {
      display_name: account.role === "owner" ? "BrowserStack E2E Owner" : `BrowserStack E2E Viewer ${account.index}`,
    },
  });
  if (error) throw new Error(`create_user_failed:${account.email}:${error.message}`);
  return { action: "created", user: data.user };
}

async function ensureProfile(supabase, userId, account) {
  const username = account.email.split("@")[0];
  await requireOk("upsert_user_profile", supabase
    .from("user_profiles")
    .upsert({
      user_id: userId,
      username,
      display_name: account.role === "owner" ? "BrowserStack E2E Owner" : `BrowserStack E2E Viewer ${account.index}`,
      channel_role: account.role === "owner" ? "creator" : "viewer",
      profile_visibility: "everyone",
      profile_access_visibility: "public",
      platform_access_visibility: account.role === "owner" ? "public" : "private",
      subscriber_surface_enabled: account.role === "owner",
      follower_surface_enabled: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select("user_id,username,display_name,channel_role,platform_access_visibility")
    .single());
}

async function ensureSandboxTester(supabase, account, userId) {
  if (account.role !== "viewer") return null;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await requireOk("revoke_existing_sandbox_tester_by_user", supabase
    .from("sandbox_monetization_testers")
    .update({ status: "revoked", revoked_at: now })
    .eq("status", "active")
    .eq("user_id", userId));
  await requireOk("revoke_existing_sandbox_tester_by_email", supabase
    .from("sandbox_monetization_testers")
    .update({ status: "revoked", revoked_at: now })
    .eq("status", "active")
    .eq("email", account.email));
  return requireOk("insert_sandbox_tester", supabase
    .from("sandbox_monetization_testers")
    .insert({
      created_by: "browserstack-e2e-account-pool",
      email: account.email,
      expires_at: expiresAt,
      note: "BrowserStack monetization E2E account pool",
      status: "active",
      user_id: userId,
    })
    .select("id,user_id,email,status,expires_at")
    .single());
}

async function ensureProduct(supabase, fixture) {
  return requireOk(`upsert_product:${fixture.key}`, supabase
    .from("monetization_products")
    .upsert({
      product_key: fixture.key,
      product_type: fixture.productType,
      display_name: fixture.displayName,
      description: "BrowserStack E2E sandbox-only fixture. Not live money and not payable.",
      provider: "revenuecat_google_play",
      provider_product_id: fixture.providerProductId,
      provider_base_plan_id: fixture.providerBasePlanId ?? null,
      revenuecat_entitlement: fixture.revenuecatEntitlement ?? null,
      environment: "sandbox",
      status: "sandbox",
      is_android_digital: true,
      is_physical_good: false,
      metadata: {
        sandbox_only: true,
        browserstack_e2e_fixture: true,
        not_payable: true,
        payout_enabled: false,
        production_enabled: false,
        live_money_enabled: false,
        premium_unlock: false,
        sandbox_purchase_intents_enabled: true,
        source_policy_checked: true,
      },
    }, { onConflict: "product_key" })
    .select("id,product_key,product_type,provider_product_id")
    .single());
}

async function ensureSourceFixtures(supabase, ownerId) {
  const videoId = stableUuid("paid-video");
  const eventId = stableUuid("event-pass");
  const partyId = `BS-E2E-${ownerId.slice(0, 8)}`;
  const now = new Date();
  const startsAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();

  await requireOk("upsert_paid_video_source", supabase
    .from("videos")
    .upsert({
      id: videoId,
      owner_id: ownerId,
      title: "BrowserStack E2E Paid Video Fixture",
      description: "Sandbox-only BrowserStack E2E paid video fixture.",
      visibility: "public",
      moderation_status: "clean",
      scan_status: "clean",
      storage_bucket: "creator-videos",
      storage_provider: "supabase",
      playback_url: "https://example.invalid/chillywood/browserstack-e2e-paid-video.mp4",
      updated_at: now.toISOString(),
    }, { onConflict: "id" })
    .select("id")
    .single());

  await requireOk("upsert_creator_content_price", supabase
    .from("creator_content_prices")
    .upsert({
      creator_id: ownerId,
      content_type: "creator_video",
      content_id: videoId,
      is_paid: true,
      price_cents: 99,
      currency: "usd",
      status: "sandbox",
      provider: "revenuecat_google_play",
      provider_product_id: "cw_paid_content_access_sandbox_099",
      provider_product_key: "paid_content_access_sandbox_099",
      metadata: {
        sandbox_only: true,
        browserstack_e2e_fixture: true,
        not_payable: true,
        premium_unlock: false,
        production_enabled: false,
      },
    }, { onConflict: "content_type,content_id" })
    .select("id")
    .single());

  await requireOk("upsert_watch_party_room", supabase
    .from("watch_party_rooms")
    .upsert({
      party_id: partyId,
      host_user_id: ownerId,
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
    }, { onConflict: "party_id" })
    .select("party_id")
    .single());

  await requireOk("upsert_creator_event", supabase
    .from("creator_events")
    .upsert({
      id: eventId,
      host_user_id: ownerId,
      event_title: "BrowserStack E2E Event Pass Fixture",
      event_type: "live_first",
      status: "scheduled",
      starts_at: startsAt,
      ends_at: endsAt,
      replay_policy: "none",
      updated_at: now.toISOString(),
    }, { onConflict: "id" })
    .select("id")
    .single());

  return { videoId, eventId, partyId, startsAt, endsAt };
}

async function selectExistingId(supabase, table, applyFilter) {
  const { data, error } = await applyFilter(supabase.from(table).select("id").limit(1)).maybeSingle();
  if (error) throw new Error(`select_existing_${table}: ${error.message}`);
  return data?.id ?? null;
}

async function putOfferRow(supabase, table, row, applyFilter, selectColumns = "id") {
  const existingId = await selectExistingId(supabase, table, applyFilter);
  if (existingId) {
    return requireOk(`update_${table}`, supabase
      .from(table)
      .update(row)
      .eq("id", existingId)
      .select(selectColumns)
      .single());
  }
  return requireOk(`insert_${table}`, supabase
    .from(table)
    .insert(row)
    .select(selectColumns)
    .single());
}

async function ensureOfferFixtures(supabase, ownerId, sourceIds, products) {
  await putOfferRow(
    supabase,
    "paid_watch_party_offers",
    {
      party_id: sourceIds.partyId,
      creator_id: ownerId,
      host_id: ownerId,
      title: "BrowserStack E2E Watch-Party Seat Pass",
      description: "Sandbox-only ticket fixture. No LiveKit publish or host authority.",
      price_cents: 99,
      currency: "usd",
      seat_limit: 25,
      status: "sandbox",
      provider: "revenuecat_google_play",
      provider_product_key: "watch_party_live_ticket_sandbox_099",
      provider_product_id: "cw_watch_party_live_ticket_sandbox_099",
      starts_at: sourceIds.startsAt,
      ends_at: sourceIds.endsAt,
      metadata: { sandbox_only: true, browserstack_e2e_fixture: true, not_payable: true, live_money_enabled: false },
    },
    (query) => query.eq("party_id", sourceIds.partyId).in("status", ["sandbox", "active", "paused", "sold_out", "blocked"]),
  );

  await putOfferRow(
    supabase,
    "paid_creator_events",
    {
      creator_event_id: sourceIds.eventId,
      creator_id: ownerId,
      title: "BrowserStack E2E Event Pass",
      description: "Sandbox-only event pass fixture.",
      event_type: "live_first",
      starts_at: sourceIds.startsAt,
      ends_at: sourceIds.endsAt,
      price_cents: 99,
      currency: "usd",
      capacity_limit: 25,
      status: "sandbox",
      provider: "revenuecat_google_play",
      provider_product_key: "event_pass_sandbox_099",
      provider_product_id: "cw_event_pass_sandbox_099",
      metadata: { sandbox_only: true, browserstack_e2e_fixture: true, not_payable: true, live_money_enabled: false },
    },
    (query) => query.eq("creator_event_id", sourceIds.eventId).in("status", ["sandbox", "active", "paused", "sold_out", "blocked"]),
  );

  await putOfferRow(
    supabase,
    "creator_channel_subscription_offers",
    {
      creator_id: ownerId,
      title: "BrowserStack E2E Channel Subscription",
      description: "Sandbox-only creator channel subscription fixture.",
      price_cents: 499,
      currency: "usd",
      interval: "monthly",
      status: "sandbox",
      provider: "revenuecat_google_play",
      provider_product_key: "channel_subscription_sandbox_monthly_499",
      provider_product_id: "channel_subscription_sandbox_monthly_499",
      provider_entitlement_id: "creator_channel_subscription",
      metadata: { sandbox_only: true, browserstack_e2e_fixture: true, not_payable: true, live_money_enabled: false },
    },
    (query) => query.eq("creator_id", ownerId).in("status", ["sandbox", "active", "paused", "blocked"]),
  );

  await putOfferRow(
    supabase,
    "creator_vip_pass_offers",
    {
      creator_id: ownerId,
      title: "BrowserStack E2E VIP Pass",
      description: "Sandbox-only creator VIP pass fixture.",
      price_cents: 499,
      currency: "usd",
      pass_type: "one_time",
      status: "sandbox",
      provider: "revenuecat_google_play",
      provider_product_key: "vip_pass_sandbox_499",
      provider_product_id: "cw_vip_pass_sandbox_499",
      metadata: { sandbox_only: true, browserstack_e2e_fixture: true, not_payable: true, live_money_enabled: false },
    },
    (query) => query.eq("creator_id", ownerId).in("status", ["sandbox", "active", "paused", "blocked"]),
  );

  await requireOk("upsert_tip_settings", supabase
    .from("creator_tip_settings")
    .upsert({
      creator_id: ownerId,
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
      metadata: { sandbox_only: true, browserstack_e2e_fixture: true, not_payable: true, payout_enabled: false },
    }, { onConflict: "creator_id" })
    .select("id")
    .single());

  const configSources = [
    ["paid_content_access_sandbox_099", sourceIds.videoId],
    ["watch_party_live_ticket_sandbox_099", stableUuid(`party:${sourceIds.partyId}`)],
    ["creator_tip_sandbox_099", ownerId],
    ["event_pass_sandbox_099", sourceIds.eventId],
    ["channel_subscription_sandbox_monthly_499", ownerId],
    ["vip_pass_sandbox_499", ownerId],
  ];

  for (const [key, sourceId] of configSources) {
    const fixture = PRODUCT_FIXTURES.find((item) => item.key === key);
    const product = products[key];
    await requireOk(`upsert_creator_config:${key}`, supabase
      .from("creator_monetization_configs")
      .upsert({
        creator_id: ownerId,
        source_type: fixture.sourceType,
        source_id: sourceId,
        product_id: product.id,
        product_key: fixture.key,
        product_type: fixture.productType,
        provider: "revenuecat_google_play",
        provider_product_id: fixture.providerProductId,
        display_name: fixture.displayName,
        price_label: fixture.priceLabel,
        environment: "sandbox",
        status: "sandbox",
        payable_state: "not_payable",
        production_enabled: false,
        payout_enabled: false,
        creates_digital_access: fixture.productType !== "creator_tip",
        grants_livekit_publish: false,
        grants_host_authority: false,
        requires_host_approval: false,
        metadata: {
          sandbox_only: true,
          browserstack_e2e_fixture: true,
          not_payable: true,
          production_enabled: false,
          payout_enabled: false,
          live_money_enabled: false,
          premium_unlock: false,
        },
      }, { onConflict: "creator_id,source_type,source_id,product_key" })
      .select("id,product_key")
      .single());
  }
}

async function countRows(supabase, table, filter) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  query = filter(query);
  const { count, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

async function main() {
  const env = loadLocalEnv();
  const missing = requiredEnv.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) throw new Error(`missing_env:${missing.join(",")}`);
  if (env.CHILLYWOOD_APP_ID !== "com.chillywood.mobile") {
    throw new Error("CHILLYWOOD_APP_ID must be com.chillywood.mobile");
  }

  const proofRoot = path.resolve(process.argv.find((arg) => arg.startsWith("--proof-root="))?.slice("--proof-root=".length) || DEFAULT_PROOF_ROOT);
  mkdirSync(proofRoot, { recursive: true });

  const envPath = path.resolve(process.cwd(), MONETIZATION_ENV_PATH);
  if (!existsSync(envPath)) writeFileSync(envPath, "", { mode: 0o600 });
  chmodSync(envPath, 0o600);

  const serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(env.SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const accountResults = [];
  const accountsByEmail = new Map();
  for (const account of TARGET_ACCOUNTS) {
    const existingPassword = String(env[account.passwordKey] ?? "").trim();
    const password = existingPassword || generatePassword();
    const { action, user } = await upsertE2EUser(serviceClient, account, password);
    await ensureProfile(serviceClient, user.id, account);
    const testerRow = await ensureSandboxTester(serviceClient, account, user.id);
    accountsByEmail.set(account.email, { ...account, userId: user.id, password });
    accountResults.push({ email: account.email, role: account.role, userId: user.id, action, sandboxTesterActive: testerRow?.status === "active" });
    writeSafeBrowserStackEnvValue(envPath, account.passwordKey, password);
  }

  const owner = accountsByEmail.get("bs_e2e_owner_01@chillywood.test");
  const primaryViewer = accountsByEmail.get("bs_e2e_viewer_01@chillywood.test");

  writeSafeBrowserStackEnvValue(envPath, "CHILLYWOOD_APP_ID", "com.chillywood.mobile");
  writeSafeBrowserStackEnvValue(envPath, "CHILLYWOOD_E2E_OWNER_EMAIL", owner.email);
  writeSafeBrowserStackEnvValue(envPath, "CHILLYWOOD_E2E_OWNER_USER_ID", owner.userId);
  writeSafeBrowserStackEnvValue(envPath, "CHILLYWOOD_E2E_VIEWER_EMAIL", primaryViewer.email);
  writeSafeBrowserStackEnvValue(envPath, "CHILLYWOOD_E2E_VIEWER_USER_ID", primaryViewer.userId);
  writeSafeBrowserStackEnvValue(envPath, "CHILLYWOOD_E2E_CREATOR_ID", owner.userId);
  for (const account of TARGET_ACCOUNTS.filter((item) => item.role === "viewer" && item.index !== "01")) {
    const row = accountsByEmail.get(account.email);
    writeSafeBrowserStackEnvValue(envPath, `CHILLYWOOD_E2E_VIEWER_${account.index}_EMAIL`, row.email);
    writeSafeBrowserStackEnvValue(envPath, `CHILLYWOOD_E2E_VIEWER_${account.index}_USER_ID`, row.userId);
  }
  chmodSync(envPath, 0o600);

  const products = {};
  for (const fixture of PRODUCT_FIXTURES) {
    products[fixture.key] = await ensureProduct(serviceClient, fixture);
  }
  const sourceIds = await ensureSourceFixtures(serviceClient, owner.userId);
  await ensureOfferFixtures(serviceClient, owner.userId, sourceIds, products);

  const signInChecks = {};
  for (const label of ["owner", "primaryViewer"]) {
    const account = label === "owner" ? owner : primaryViewer;
    const { data, error } = await anonClient.auth.signInWithPassword({ email: account.email, password: account.password });
    signInChecks[label] = { ok: !error && !!data?.user?.id, userId: data?.user?.id ?? null, error: error?.message ?? null };
    await anonClient.auth.signOut();
  }

  const safety = {
    productionPurchaseIntents: await countRows(serviceClient, "money_purchase_intents", (query) => query.eq("environment", "production").eq("creator_id", owner.userId)),
    payableLedgerEvents: await countRows(serviceClient, "money_access_ledger_events", (query) => query.eq("creator_id", owner.userId).in("payable_state", ["payable", "paid"])),
    payoutEnabledConfigs: await countRows(serviceClient, "creator_monetization_configs", (query) => query.eq("creator_id", owner.userId).eq("payout_enabled", true)),
    liveAuthorityConfigs: await countRows(serviceClient, "creator_monetization_configs", (query) => query.eq("creator_id", owner.userId).or("production_enabled.eq.true,grants_livekit_publish.eq.true,grants_host_authority.eq.true")),
  };

  const summary = {
    ok: true,
    proofRoot,
    accounts: {
      total: accountResults.length,
      created: accountResults.filter((row) => row.action === "created").length,
      updated: accountResults.filter((row) => row.action === "updated").length,
      ownerEmail: owner.email,
      primaryViewerEmail: primaryViewer.email,
      backupViewerCount: 8,
      ownerUserId: owner.userId,
    },
    signInChecks,
    fixtures: {
      sourceIds,
      productKeys: Object.keys(products),
      sandboxOnly: true,
      notPayable: true,
    },
    safety,
    secretsPrinted: false,
    envFile: {
      path: MONETIZATION_ENV_PATH,
      ignoredLocalOnly: true,
      permissions: "600",
    },
  };

  writeFileSync(path.join(proofRoot, "account_create_redacted.log"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
