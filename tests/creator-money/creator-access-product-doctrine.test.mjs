import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260831120000_creator_access_product_doctrine_amendment.sql");
const contentClient = read("_lib/creatorMonetization.ts");
const vipClient = read("_lib/creatorVipPasses.ts");
const subscriptionClient = read("_lib/channelSubscriptions.ts");
const publicCards = read("supabase/functions/public-creator-video-cards/index.ts");
const platform = read("app/channel/[userId].tsx");
const vipScreen = read("app/vip-pass/[creatorId].tsx");
const subscriptionScreen = read("app/channel-subscription/[creatorId].tsx");
const sevenFlowProof = read("scripts/proof-seven-flow-production-switchboard.mjs");

test("VIP duration is canonical provider time plus exactly 30 days and cannot be client-extended", () => {
  assert.match(migration, /provider_event\."occurred_at"\+interval '30 days'/);
  assert.match(migration, /new\."starts_at":=old\."starts_at"/);
  assert.match(migration, /new\."expires_at":=old\."starts_at"\+interval '30 days'/);
  assert.match(migration, /vip_verified_activation_required/);
  assert.match(migration, /'INITIAL_PURCHASE','NON_RENEWING_PURCHASE'/);
  assert.match(migration, /pass_row\."expires_at">timezone\('utc'::text,now\(\)\)/);
  assert.match(migration, /pass_row\."refunded_at" is null/);
  assert.match(migration, /pass_row\."revoked_at" is null/);
  assert.match(vipClient, /VIP_PASS_DURATION_DAYS = 30/);
  assert.doesNotMatch(vipClient, /expiresAtMs > Date\.now/);
});

test("ordinary Paid Video gets exact active-creator subscription as a read-only alternate authority", () => {
  assert.match(migration, /not coalesce\(video\."vip_access_required",false\)/);
  assert.match(migration, /price\."creator_id"=video\."owner_id"/);
  assert.match(migration, /resolve_creator_channel_subscription_access"\(v_owner\)/);
  assert.match(migration, /'subscription_active','subscription_cancel_pending'/);
  assert.match(migration, /'reason','active_creator_subscription'/);
  assert.match(contentClient, /"active_creator_subscription"/);

  const alternateAuthority = migration.slice(
    migration.indexOf("create or replace function public.\"creator_video_subscription_access_internal\""),
    migration.indexOf("alter function public.\"resolve_creator_content_access\""),
  );
  assert.doesNotMatch(alternateAuthority, /insert\s+into/i);
  assert.doesNotMatch(alternateAuthority, /update\s+public/i);
  assert.doesNotMatch(alternateAuthority, /paid_content_access|money_access_ledger_events|provider_transactions/i);
});

test("VIP-only content remains excluded from subscription and ordinary purchase authority", () => {
  assert.match(migration, /not coalesce\(video\."vip_access_required",false\)/);
  assert.match(migration, /VIP-only content requires exact-creator VIP/);
  assert.match(migration, /resolve_creator_content_access_pre_subscription_doctrine/);
  assert.doesNotMatch(migration, /active_creator_subscription[\s\S]{0,300}vip_access_required\s*=\s*true/i);
});

test("client presentation uses server-authorized access and truthful product copy", () => {
  assert.doesNotMatch(subscriptionClient, /Date\.parse\(currentPeriodEnd\) > Date\.now\(\)/);
  assert.match(publicCards, /paidAccessRequired/);
  assert.match(publicCards, /creator_content_prices/);
  assert.match(platform, /Included with subscription/);
  assert.match(vipScreen, /one-time 30-day VIP Pass/);
  assert.match(vipScreen, /VIP-only video shelf/);
  assert.match(subscriptionScreen, /ordinary Paid Videos/);
  assert.match(subscriptionScreen, /Included video access ends when the subscription becomes inactive/);
  assert.doesNotMatch(vipScreen, /No VIP perks yet|VIP perks coming later/);
});

test("product isolation is explicit in canonical migration metadata", () => {
  for (const isolation of [
    /'auto_renew',false/,
    /'channel_subscription_unlock',false/,
    /'paid_video_ownership_unlock',false/,
  ]) assert.match(migration, isolation);
  assert.match(sevenFlowProof, /read-time access to that creator's ordinary Paid Videos while active, without per-video grants or economics/);
  assert.match(sevenFlowProof, /exactly 30 days of exact-creator VIP Area and VIP-only shelf access/);
  assert.match(sevenFlowProof, /providerType: "one-time consumable\/pass"/);
});
