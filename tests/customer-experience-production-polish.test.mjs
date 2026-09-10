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

test("every customer-facing main tab reserves the same bounded brand-safe region", () => {
  assert.equal(presentation.resolveMainTabBrandRevealHeight(700), 188);
  assert.equal(presentation.resolveMainTabBrandRevealHeight(852), 204);
  assert.equal(presentation.resolveMainTabBrandRevealHeight(1200), 224);

  const tabs = [
    ["app/(tabs)/index.tsx", "home-brand-reveal", "renderHomeEventRail({"],
    ["app/(tabs)/explore.tsx", "main-tab-explore-brand-reveal", "<Text style={styles.exploreTitle}>Explore</Text>"],
    ["app/(tabs)/live.tsx", "main-tab-live-brand-reveal", "<View style={styles.heroHeader}>"],
    ["app/(tabs)/my-list.tsx", "main-tab-library-brand-reveal", "<View style={styles.headerBlock}>"],
  ];
  for (const [path, testId, firstContent] of tabs) {
    const source = read(path);
    assert.match(source, /resolveMainTabBrandRevealHeight\(viewportHeight\)/u, path);
    assert.match(source, new RegExp(`testID=["']${testId}["']`, "u"), path);
    const revealIndex = source.indexOf(testId);
    assert.ok(source.indexOf(firstContent, revealIndex) > revealIndex, `${path} keeps content below the brand reveal`);
  }

  assert.match(read("app/(tabs)/explore.tsx"), /source=\{CHILLYWOOD_BACKGROUND_SOURCE\}/u);
  assert.match(read("app/(tabs)/live.tsx"), /source=\{CHILLYWOOD_BACKGROUND_SOURCE\}/u);
  assert.match(read("app/(tabs)/my-list.tsx"), /source=\{CHILLYWOOD_BACKGROUND_SOURCE\}/u);
});

test("Live Hub cards remain useful with populated rails and the page stays vertically scrollable", () => {
  assert.equal(presentation.resolveLiveHubCardWidth(320), 256);
  assert.equal(presentation.resolveLiveHubCardWidth(393), 320);
  assert.equal(presentation.resolveLiveHubCardWidth(900), 320);
  const live = read("app/(tabs)/live.tsx");
  assert.match(live, /testID="live-hub-scroll"/u);
  assert.match(live, /alwaysBounceVertical/u);
  assert.match(live, /style=\{\[styles\.discoveryCard, \{ width: discoveryCardWidth \}\]\}/u);
  assert.match(live, /useRefreshOnForeground\(\(\) => loadLive\(true\)\)/u);
});

test("Event presentation never masquerades a future state as an Open Event action", () => {
  const futureFree = presentation.resolveEventCustomerPresentation({
    status: "scheduled", startsAt: "2030-01-02T18:00:00.000Z", isPaid: false,
    accessAllowed: true, requiresPurchase: false, soldOut: false,
    hasLiveDestination: false, hasReplayDestination: false,
  });
  assert.equal(futureFree.statusLabel, "Upcoming");
  assert.equal(futureFree.action, "none");
  assert.match(futureFree.body, /free/u);

  const futurePaid = presentation.resolveEventCustomerPresentation({
    status: "scheduled", startsAt: "2030-01-02T18:00:00.000Z", isPaid: true,
    accessAllowed: false, requiresPurchase: true, soldOut: false, priceLabel: "$4.99",
    hasLiveDestination: false, hasReplayDestination: false,
  });
  assert.equal(futurePaid.action, "buy_pass");
  assert.equal(futurePaid.actionLabel, "Get Event Pass — $4.99");

  const live = presentation.resolveEventCustomerPresentation({
    status: "live_now", isPaid: false, accessAllowed: true, requiresPurchase: false,
    soldOut: false, hasLiveDestination: true, hasReplayDestination: false,
  });
  assert.equal(live.action, "open_live");
  assert.equal(live.actionLabel, "Watch Event Live");

  const canceled = presentation.resolveEventCustomerPresentation({
    status: "canceled", isPaid: false, accessAllowed: true, requiresPurchase: false,
    soldOut: false, hasLiveDestination: false, hasReplayDestination: false,
  });
  assert.equal(canceled.action, "none");
  assert.equal(canceled.statusLabel, "Canceled");
});

test("Platform storefront contains only backed creator offers", () => {
  assert.deepEqual(presentation.resolvePlatformViewerOfferKeys({
    canTip: false, canPurchaseSubscription: false, hasSubscriptionAccess: false,
    canPurchaseVip: false, hasVipAccess: false, hasPartyRoomOffer: false,
  }), []);
  assert.deepEqual(presentation.resolvePlatformViewerOfferKeys({
    canTip: true, canPurchaseSubscription: false, hasSubscriptionAccess: false,
    canPurchaseVip: true, hasVipAccess: false, hasPartyRoomOffer: true,
  }), ["tip", "vip", "party_room"]);
  assert.deepEqual(presentation.resolvePlatformViewerOfferKeys({
    canTip: false, canPurchaseSubscription: false, hasSubscriptionAccess: true,
    canPurchaseVip: false, hasVipAccess: true, hasPartyRoomOffer: false,
  }), ["subscription", "vip"]);

  const channel = read("app/channel/[userId].tsx");
  const renderedStorefront = channel.slice(
    channel.indexOf("const renderPlatformMonetization"),
    channel.indexOf("const renderAbout"),
  );
  assert.match(renderedStorefront, /if \(isOwnerPlatformMode\(platformMode\)\) return null/u);
  assert.doesNotMatch(renderedStorefront, /Paid video status|Event Pass status|Party Room status|Creator Offers/u);
  const renderedHero = channel.slice(channel.indexOf("const renderHero"), channel.indexOf("const getPublicClipCardTitle"));
  assert.doesNotMatch(renderedHero, /Sandbox Tip|Sandbox subscription complete|Sandbox VIP complete/u);
  assert.match(renderedStorefront, /watchPartyTicketOffer\.title/u);
  assert.match(read("app/player/[id].tsx"), /paid-video-purchase-success-receipt/u);
  assert.doesNotMatch(read("app/profile/[userId].tsx"), /OFFICIAL READY|Rachi is ready|CONTEXT NEEDED/u);
  assert.match(read("app/profile/[userId].tsx"), /kicker: "CHI'LLYWOOD OFFICIAL"/u);
  assert.match(read("app/profile/[userId].tsx"), /officialAccount\?\.officialBadgeLabel \?\? "OFFICIAL"/u);
  assert.doesNotMatch(read("app/profile/[userId].tsx"), /profile\.platformOwnershipLabel \?\? "PLATFORM OWNED"/u);
});

test("Follow capability mirrors protected-target RLS and repeated presses are single-flight", () => {
  const audience = read("_lib/channelAudience.ts");
  const channel = read("app/channel/[userId].tsx");
  assert.match(audience, /rpc\("is_platform_owner_user"/u);
  assert.match(audience, /reason: "protected_platform"/u);
  assert.match(audience, /reason: "authority_unavailable"/u);
  assert.match(audience, /typeof data !== "boolean"/u);
  assert.match(channel, /followLatchRef\.current\.tryAcquire\(\)/u);
  assert.match(channel, /followLatchRef\.current\.release\(\)/u);
  assert.match(channel, /Alert\.alert\("Follow Platform", result\.message\)/u);
  const profile = read("app/profile/[userId].tsx");
  assert.match(profile, /followActionLatchRef\.current\.tryAcquire\(\)/u);
  assert.match(profile, /followActionLatchRef\.current\.release\(\)/u);
  assert.match(profile, /Alert\.alert\("Follow Platform", result\.message\)/u);
});

test("Settings uses customer language for profile controls and support diagnostics", () => {
  const settings = read("app/settings.tsx");
  assert.match(settings, /value=\{myProfile \? "Customize" : "Loading"\}/u);
  assert.match(settings, /Release details you can share with support\./u);
  assert.doesNotMatch(settings, /value=\{myProfile \? "Ready" : "Loading"\}/u);
  assert.doesNotMatch(settings, /installed OTA proof/u);
});
