import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const partyRoom = read("app/watch-party/[partyId].tsx");
const player = read("app/player/[id].tsx");
const liveMoney = read("_lib/liveWatchPartyMoney.ts");
const webhook = read("supabase/functions/revenuecat-webhook/index.ts");
const liveKit = read("supabase/functions/livekit-token/index.ts");
const migration = read("supabase/migrations/20260901010000_watch_party_live_money_rfgc_closure.sql");

test("Player remains Party Waiting Room -> Party Room and Party Room cannot shortcut to Live Stage", () => {
  assert.match(player, /pathname:\s*"\/watch-party"/u);
  assert.doesNotMatch(partyRoom, /\/watch-party\/live-stage/u);
  assert.doesNotMatch(partyRoom, /readLiveWatchPartyMoneyAccess|live_watch_party_access_pass|live_watch_party_seat_pass/u);
});

test("Live Stage performs exact live-pass admission after ordinary room and Premium authority", () => {
  const ordinaryIndex = liveStage.indexOf("resolveRoomAccess({");
  const exactLiveIndex = liveStage.indexOf("readLiveWatchPartyMoneyAccess(partyId)");
  const joinIndex = liveStage.indexOf("joinPartyRoomSession({");
  assert.ok(ordinaryIndex >= 0 && exactLiveIndex > ordinaryIndex && joinIndex > exactLiveIndex);
  assert.match(liveStage, /exactLivePassRequired/u);
  assert.match(liveStage, /Live Access Pass for viewer\/listener entry/u);
  assert.match(liveStage, /Live Seat Pass provides only seat eligibility and never substitutes for access or guarantees speaking/u);
  assert.match(liveStage, /exact_live_access_pass_required/u);
  assert.match(liveStage, /returnToLiveWaitingRoomRoute/u);
  assert.doesNotMatch(liveStage, /returnToWatchPartyRoomRoute/u);
});

test("exact offers, intents, grants, and provider evidence bind buyer creator host product and live target", () => {
  for (const token of [
    '"party_id" text not null references public."watch_party_rooms"',
    '"creator_id" uuid not null',
    '"host_user_id" uuid not null',
    '"pass_type" text not null',
    '"product_id" uuid not null',
    '"provider_event_id" uuid not null',
    "original_transaction_id",
    "live_watch_party_exact_target_binding_invalid",
    "creator_money_blocked_by_audience_policy",
  ]) assert.ok(migration.includes(token), token);
  assert.match(liveMoney, /prepareCreatorMoneyPurchaseSubject/u);
  assert.match(liveMoney, /validateCreatorMoneyPurchaseIntent/u);
});

test("access never becomes a speaker and seat eligibility still requires persisted host approval", () => {
  assert.match(liveKit, /targetAuthority\.paidSeatRequired\s*&& !targetAuthority\.speakerEligible/u);
  assert.match(liveKit, /authority\.allowed && authority\.paidSeatRequired && !authority\.speakerEligible/u);
  assert.match(migration, /exact_live_access_viewer_authority/u);
  assert.match(migration, /exact_live_seat_eligibility_authority/u);
  assert.match(migration, /new\."stage_role"='speaker'/u);
  assert.match(migration, /'authority_granted',false/u);
  assert.match(migration, /v_allowed:=v_access_offer\."id" is null or v_access_grant\."id" is not null/u);
  assert.match(migration, /v_speaker_eligible:=v_seat_offer\."id" is null or v_seat_grant\."id" is not null/u);
  assert.match(liveStage, /currentUserHasLiveSeatRequestEligibility/u);
  assert.match(liveStage, /live-stage-buy-seat-eligibility/u);
  assert.equal([...liveStage.matchAll(/testID="live-stage-buy-seat-eligibility"/gu)].length, 1);
  assert.doesNotMatch(liveStage, /testID="live-stage-buy-seat-pass"/u);
});

test("RevenueCat routes both live products through the dedicated atomic projector and exact Live Stage deep link", () => {
  assert.match(webhook, /live_watch_party_access_pass/u);
  assert.match(webhook, /live_watch_party_seat_pass/u);
  assert.match(webhook, /process_revenuecat_live_watch_party_event_atomic/u);
  assert.match(webhook, /watch-party\/live-stage\/\$\{partyId\}/u);
  assert.match(webhook, /Seat eligibility is ready/u);
  assert.match(webhook, /Host approval is still required/u);
  assert.match(webhook, /createLiveWatchPartyTerminalNotifications/u);
  assert.match(webhook, /creator_money_refunded/u);
  assert.match(webhook, /creator_money_revoked/u);
});

test("live settlement is completion-based with 48-hour hold, reserve, and terminal revocation", () => {
  assert.match(migration, /'live_watch_party_access',null,true,interval '48 hours',1000,interval '30 days'/u);
  assert.match(migration, /'live_watch_party_seat',null,true,interval '48 hours',1000,interval '30 days'/u);
  assert.match(migration, /meaningful_entry_at/u);
  assert.match(migration, /approved_at/u);
  assert.match(migration, /membership_state"='removed'/u);
  assert.match(migration, /when v_event_type='REFUND' then 'refunded' when v_event_type='REVOCATION' then 'reversed'/u);
  assert.match(migration, /immutable_terminal_evidence/u);
  assert.match(migration, /pass_row\."provider_event_id"=v_money\."provider_event_id"/u);
});

test("Premium, VIP, Platform Subscription, Event Pass, Paid Video, and ordinary Party tickets are never live-pass aliases", () => {
  assert.doesNotMatch(liveMoney, /vip_pass|channel_subscription|event_pass|paid_content_access|watch_party_live_ticket/u);
  assert.match(migration, /pass_type" in \('live_watch_party_access_pass','live_watch_party_seat_pass'\)/u);
  assert.doesNotMatch(migration, /pass_type" in \([^)]*(vip_pass|event_pass|watch_party_live_ticket)/u);
});
