#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CHILLYWOOD_E2E_OWNER_USER_ID"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(JSON.stringify({ ok: false, error: "missing_env", missing }, null, 2));
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ownerUserId = String(process.env.CHILLYWOOD_E2E_OWNER_USER_ID).trim();
const viewerUserId = String(process.env.CHILLYWOOD_E2E_VIEWER_USER_ID ?? "").trim() || null;
const viewerEmail = String(process.env.CHILLYWOOD_E2E_VIEWER_EMAIL ?? "").trim().toLowerCase() || null;

const safeRpc = async (name, args = {}) => {
  const { data, error } = await supabase.rpc(name, args);
  return error ? { ok: false, error: error.message } : { ok: true, data };
};

const safeSelect = async (table, query) => {
  const { data, error } = await query(supabase.from(table));
  return error ? { ok: false, error: error.message } : { ok: true, data };
};

const safeCount = async (table, query) => {
  const { count, error } = await query(
    supabase.from(table).select("*", { count: "exact", head: true }),
  );
  return error ? { ok: false, error: error.message } : { ok: true, count: count ?? 0 };
};

const sandboxTesterRows = viewerUserId || viewerEmail
  ? await safeSelect("sandbox_monetization_testers", (query) => {
      let builder = query
        .select("id,user_id,email,status,expires_at,revoked_at,created_at,updated_at")
        .eq("status", "active");
      if (viewerUserId && viewerEmail) {
        builder = builder.or(`user_id.eq.${viewerUserId},email.eq.${viewerEmail}`);
      } else if (viewerUserId) {
        builder = builder.eq("user_id", viewerUserId);
      } else {
        builder = builder.eq("email", viewerEmail);
      }
      return builder.order("updated_at", { ascending: false }).limit(5);
    })
  : { ok: false, error: "viewer_not_configured" };

const creatorConfigs = await safeSelect("creator_monetization_configs", (query) =>
  query
    .select("id, creator_id, source_type, source_id, product_type, product_key, display_name, status, environment, payable_state, payout_enabled, production_enabled, creates_digital_access, grants_livekit_publish, grants_host_authority, updated_at")
    .eq("creator_id", ownerUserId)
    .order("updated_at", { ascending: false })
    .limit(40),
);

const output = {
  ok: true,
  ownerUserId,
  viewerUserId,
  viewerEmail,
  sandboxTesterResolver: viewerUserId || viewerEmail
    ? await safeRpc("resolve_sandbox_monetization_tester", {
        p_user_id: viewerUserId,
        p_email: viewerEmail,
      })
    : { ok: false, error: "viewer_not_configured" },
  sandboxTesterRows,
  creatorConfigs,
  purchaseIntents: await safeSelect("money_purchase_intents", (query) =>
    query.select("id, user_id, creator_id, product_type, source_type, source_id, status, environment, provider, amount_minor, currency, consumed_at, revoked_at, created_at, updated_at")
      .eq("creator_id", ownerUserId)
      .order("updated_at", { ascending: false })
      .limit(20),
  ),
  accessGrants: await safeSelect("access_grants", (query) =>
    query.select("id, user_id, grant_type, source_type, source_id, environment, status, provider, starts_at, expires_at, revoked_at, refunded_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(40),
  ),
  ledger: await safeSelect("money_access_ledger_events", (query) =>
    query.select("id, user_id, creator_id, product_id, event_type, source_type, source_id, environment, payable_state, status, amount_minor, currency, created_at")
      .eq("creator_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(40),
  ),
  watchPartyTicketOffers: await safeSelect("paid_watch_party_offers", (query) =>
    query.select("id, party_id, creator_id, host_id, title_id, video_id, status, provider, price_cents, currency, starts_at, ends_at, updated_at")
      .eq("creator_id", ownerUserId)
      .order("updated_at", { ascending: false })
      .limit(10),
  ),
  eventPassOffers: await safeSelect("paid_creator_events", (query) =>
    query.select("id, creator_event_id, creator_id, title, event_type, starts_at, ends_at, status, provider, price_cents, currency, updated_at")
      .eq("creator_id", ownerUserId)
      .order("updated_at", { ascending: false })
      .limit(10),
  ),
  channelSubscriptionOffers: await safeSelect("creator_channel_subscription_offers", (query) =>
    query.select("id, creator_id, title, interval, status, provider, price_cents, currency, subscriber_count, updated_at")
      .eq("creator_id", ownerUserId)
      .order("updated_at", { ascending: false })
      .limit(10),
  ),
  vipPassOffers: await safeSelect("creator_vip_pass_offers", (query) =>
    query.select("id, creator_id, title, pass_type, status, provider, price_cents, currency, vip_count, updated_at")
      .eq("creator_id", ownerUserId)
      .order("updated_at", { ascending: false })
      .limit(10),
  ),
  tipSettings: await safeSelect("creator_tip_settings", (query) =>
    query.select("id, creator_id, tips_enabled, status, provider, provider_environment, provider_charges_enabled, provider_payouts_enabled, currency, updated_at")
      .eq("creator_id", ownerUserId)
      .order("updated_at", { ascending: false })
      .limit(10),
  ),
  liveMoneyReadback: {
    productionPurchaseIntents: await safeCount("money_purchase_intents", (query) =>
      query.eq("environment", "production"),
    ),
    payableLedgerEvents: await safeCount("money_access_ledger_events", (query) =>
      query.in("payable_state", ["payable", "paid"]),
    ),
  },
};

console.log(JSON.stringify(output, null, 2));
