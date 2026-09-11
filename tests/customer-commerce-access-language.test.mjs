import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(path, "utf8");
const load = (path) => {
  const module = { exports: {} };
  const js = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  }).outputText;
  new Function("exports", "module", "require", js)(module.exports, module, require);
  return module.exports;
};

const presentation = load("_lib/customerExperiencePresentation.ts");

test("canonical access language proves 18 materially different customer scenarios", () => {
  const scenarios = [
    ["Public + Free", { audience: "public" }, { audienceLabel: "Public", accessLabel: null, canPurchase: false }],
    ["Public + Premium", { audience: "public", entitlement: "premium" }, { accessLabel: "Chi'llywood Premium", canPurchase: false }],
    ["Creator VIP", { audience: "public", entitlement: "creator_vip", ownership: "active" }, { accessLabel: "VIP Active", canPurchase: false }],
    ["Public + Paid Video", { audience: "public", paid: true, exactProduct: "paid_video", priceLabel: "$0.99" }, { accessLabel: "$0.99 one-time", canPurchase: true }],
    ["Circle + Free", { audience: "circle", audienceAuthorized: true }, { audienceLabel: "Chi'lly Circle", accessLabel: null, canPurchase: false }],
    ["Circle/Private + Paid", { audience: "private", audienceAuthorized: false, paid: true, exactProduct: "paid_video", priceLabel: "$0.99" }, { accessLabel: "Private access required", canPurchase: false }],
    ["Paid Party Room", { audience: "public", paid: true, exactProduct: "party_room_pass", priceLabel: "$0.99" }, { accessLabel: "$0.99 one-time", canPurchase: true }],
    ["Paid Event", { audience: "public", paid: true, exactProduct: "event_pass", priceLabel: "$4.99" }, { accessLabel: "$4.99 one-time", canPurchase: true }],
    ["Live Stage Pass", { audience: "public", paid: true, exactProduct: "live_stage_pass", priceLabel: "$0.99" }, { canPurchase: true }],
    ["Live Stage Seat Pass", { audience: "public", paid: true, exactProduct: "live_stage_seat_pass", priceLabel: "$0.99" }, { canPurchase: true }],
    ["Purchased / Restored", { audience: "public", paid: true, exactProduct: "paid_video", ownership: "unlocked" }, { accessLabel: "Unlocked", canPurchase: false }],
    ["Expired / Revoked / Refunded / Canceled", { audience: "public", ownership: "unavailable" }, { accessLabel: "Unavailable", canPurchase: false }],
    ["Owner View", { audience: "private", audienceAuthorized: true, ownership: "unlocked" }, { accessLabel: "Unlocked", canPurchase: false }],
    ["Tip Creator", { audience: "public" }, { accessLabel: null, canPurchase: false }],
    ["No Offer / No Inventory", { audience: "public" }, { accessLabel: null, canPurchase: false }],
    ["Deep Link / Notification", { audience: "circle", audienceAuthorized: false, paid: true, exactProduct: "event_pass" }, { accessLabel: "Circle access required", canPurchase: false }],
    ["Offline / Unknown Authority", { audience: "public", paid: true, exactProduct: "paid_video", ownership: "unknown" }, { accessLabel: "Access unavailable", canPurchase: false }],
    ["Rapid Input / Cancellation / Failure Release", { audience: "public", paid: true, exactProduct: "event_pass", priceLabel: "$0.99" }, { canPurchase: true }],
  ];

  for (const [name, input, expected] of scenarios) {
    const actual = presentation.resolveCustomerAccessSummary(input);
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(actual[key], value, `${name}: ${key}`);
    }
  }
  assert.equal(scenarios.length, 18);
});

test("audience authority and commerce remain independent and fail closed", () => {
  const unauthorized = presentation.resolveCustomerAccessSummary({
    audience: "circle",
    audienceAuthorized: false,
    paid: true,
    exactProduct: "paid_video",
    priceLabel: "$0.99",
  });
  assert.equal(unauthorized.canPurchase, false);
  assert.match(unauthorized.detail, /Audience access must be approved/u);

  const authorizedButUnpaid = presentation.resolveCustomerAccessSummary({
    audience: "circle",
    audienceAuthorized: true,
    paid: true,
    exactProduct: "paid_video",
    priceLabel: "$0.99",
  });
  assert.equal(authorizedButUnpaid.canPurchase, true);
  assert.match(authorizedButUnpaid.detail, /Audience restrictions still apply/u);
});

test("account-bound async reads reject stale generations and identity replacement", () => {
  assert.equal(presentation.isCurrentAuthorityRequest({
    generation: 4,
    currentGeneration: 4,
    requestedAuthorityKey: "creator-a:viewer-a",
    currentAuthorityKey: "creator-a:viewer-a",
  }), true);
  assert.equal(presentation.isCurrentAuthorityRequest({
    generation: 3,
    currentGeneration: 4,
    requestedAuthorityKey: "creator-a:viewer-a",
    currentAuthorityKey: "creator-a:viewer-a",
  }), false);
  assert.equal(presentation.isCurrentAuthorityRequest({
    generation: 4,
    currentGeneration: 4,
    requestedAuthorityKey: "creator-a:viewer-a",
    currentAuthorityKey: "creator-a:viewer-b",
  }), false);
});

test("exact products, one-time prices, recurring prices, and Tip are not interchangeable", () => {
  assert.deepEqual(presentation.EXACT_ACCESS_PRODUCT_LABELS, {
    paid_video: "Paid Video",
    party_room_pass: "Party Room Pass",
    event_pass: "Event Pass",
    live_stage_pass: "Live Stage Pass",
    live_stage_seat_pass: "Live Stage Seat Pass",
  });
  assert.equal(presentation.formatOneTimePrice("$0.99"), "$0.99 one-time");
  assert.equal(presentation.formatRecurringPrice("$4.99", "month"), "$4.99 per month");
  assert.match(presentation.TIP_SUPPORT_DOCTRINE, /grants no content, Premium, VIP, Circle, pass, seat, room, or LiveKit authority/u);
});

test("rescheduled Events retain exact-pass semantics without hiding the new time", () => {
  const presentationState = presentation.resolveEventCustomerPresentation({
    status: "rescheduled",
    startsAt: "2026-09-20T20:00:00.000Z",
    isPaid: true,
    accessAllowed: false,
    requiresPurchase: true,
    soldOut: false,
    priceLabel: "$4.99 one-time",
    hasLiveDestination: false,
    hasReplayDestination: false,
  });
  assert.equal(presentationState.statusLabel, "Rescheduled");
  assert.match(presentationState.headline, /New time:/u);
  assert.equal(presentationState.action, "buy_pass");
  assert.equal(presentationState.actionLabel, "Get Event Pass — $4.99 one-time");
});

test("Platform exposes one Tip action and only a published or active creator VIP destination", () => {
  const platform = read("app/channel/[userId].tsx");
  const vip = read("app/vip-pass/[creatorId].tsx");
  const player = read("app/player/[id].tsx");
  const partyRoom = read("app/watch-party/[partyId].tsx");
  const hero = platform.slice(platform.indexOf("const renderHero"), platform.indexOf("const getPublicClipCardTitle"));
  const storefront = platform.slice(platform.indexOf("const renderPlatformMonetization"), platform.indexOf("const renderAbout"));
  assert.match(hero, /canRenderTip[\s\S]*label="Tip"[\s\S]*openTipSheet/u);
  assert.equal((platform.match(/platform-support-tip-button/gu) ?? []).length, 1);
  assert.doesNotMatch(storefront, /platform-support-tip-button/u);
  assert.match(platform, /isPublishedCreatorVipOffer\(vipAccess\?\.offer\)/u);
  assert.match(platform, /if \(!paidAccess\) return "Checking access"/u);
  assert.match(storefront, /button: vipAccess\?\.allowed[\s\S]*\? "VIP Active" : "View VIP"/u);
  assert.match(storefront, /onPress: openVipArea/u);
  assert.doesNotMatch(storefront, /onPress: vipAccess\?\.allowed \? openVipArea : handleGetVip/u);
  assert.match(vip, /chillywoodmobile:\/\/vip-pass\/\$\{encodeURIComponent\(creatorId\)\}/u);
  assert.match(vip, /Sharing does not grant access/u);
  assert.match(vip, /requestedAuthorityKey,[\s\S]*currentAuthorityKey: authorityKeyRef\.current/u);
  assert.match(vip, /accessIdentityPending \? \[\] : accessSnapshot\.videos/u);
  assert.match(vip, /noticeSnapshot\.authorityKey === authorityKey/u);
  assert.match(player, /player-tip-creator-button/u);
  assert.match(player, /readCreatorTipPublicStatus\(creatorId\)/u);
  assert.match(player, /sourceSurface="creator_video_player"/u);
  assert.match(player, /isCreatorStandalonePlaybackSurface, sessionUserId/u);
  assert.match(partyRoom, /onTipCreator=\{canTipSelectedCreator \? openSelectedCreatorTipSheet : undefined\}/u);
});

test("money CTAs are exact, accessible, and synchronously single-flight", () => {
  const tipAuthority = read("_lib/creatorTips.ts");
  const tip = read("components/monetization/tip-sheet.tsx");
  const player = read("app/player/[id].tsx");
  const party = read("app/watch-party/[partyId].tsx");
  const stage = read("app/watch-party/live-stage/[partyId].tsx");
  const event = read("app/event/[eventId].tsx");

  for (const [source, latch] of [
    [tip, "checkoutLatchRef"],
    [player, "paidVideoUnlockLatchRef"],
    [party, "paidTicketPurchaseLatchRef"],
    [stage, "liveMoneyPurchaseLatchRef"],
    [event, "purchaseLatchRef"],
  ]) {
    assert.match(source, new RegExp(`${latch}\\.current\\.tryAcquire\\(\\)`), latch);
    assert.match(source, new RegExp(`${latch}\\.current\\.release\\(\\)`), latch);
  }
  assert.match(tip, /This supports the creator and does not unlock access/u);
  assert.match(tip, /keyboardShouldPersistTaps="handled"/u);
  assert.match(tip, /maxHeight: "92%"/u);
  assert.match(tipAuthority, /no_access_grant: true/u);
  assert.match(tip, /It did not unlock access/u);
  assert.match(player, /Unlock Video[\s\S]*creatorVideoPaidContentOneTimePriceLabel/u);
  assert.match(party, /Get Party Room Pass —/u);
  assert.match(stage, /Get Live Stage Pass —/u);
  assert.match(stage, /Seat eligibility only; host approval required/u);
  assert.match(event, /canPurchaseEventPass[\s\S]*!terminalEventState/u);
});

test("current usable purchased content has a Library return path without using raw transaction history", () => {
  const paidVideos = read("_lib/creatorPaidVideos.ts");
  const library = read("app/(tabs)/my-list.tsx");
  assert.match(paidVideos, /\.from\("access_grants"\)/u);
  assert.match(paidVideos, /resolvePaidVideoAccess\(videoId\)/u);
  assert.match(paidVideos, /access\.reason === "active_grant" \|\| access\.reason === "sandbox_grant"/u);
  assert.match(paidVideos, /subjectUserId: userId/u);
  assert.match(library, /Unlocked Creator Videos/u);
  assert.match(library, /library-unlocked-video-open-button/u);
  assert.match(library, /Current items remain visible/u);
  assert.match(library, /if \(unlockedResult\.status === "resolved"\)/u);
  assert.match(library, /\[loadLibrary, sessionLoading\]/u);
  assert.match(library, /requestedAuthorityKey: requestedViewerUserId/u);
  assert.match(library, /currentAuthorityKey: currentViewerUserIdRef\.current/u);
  assert.match(library, /unlockedResult\.subjectUserId/u);
  assert.match(library, /librarySubjectUserId !== viewerUserId/u);
  assert.match(library, /libraryIdentityPending \? \[\] : unlockedVideos/u);
  assert.doesNotMatch(library, /provider_event_id|original_transaction_id|purchase_intent_id/u);
});
