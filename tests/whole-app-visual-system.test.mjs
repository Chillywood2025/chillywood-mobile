import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sources = {
  appLayout: read("app/_layout.tsx"),
  appSurface: read("components/ui/app-surface.tsx"),
  authCallback: read("app/auth-callback.tsx"),
  betaAccess: read("components/system/beta-access-screen.tsx"),
  circle: read("app/chilly-circle.tsx"),
  explore: read("app/(tabs)/explore.tsx"),
  forgot: read("app/(auth)/forgot-password.tsx"),
  home: read("app/(tabs)/index.tsx"),
  legal: read("components/legal/legal-page-shell.tsx"),
  library: read("app/(tabs)/my-list.tsx"),
  live: read("app/(tabs)/live.tsx"),
  login: read("app/(auth)/login.tsx"),
  player: read("app/player/[id].tsx"),
  profileTab: read("app/(tabs)/profile.tsx"),
  reset: read("app/reset-password.tsx"),
  settings: read("app/settings.tsx"),
  signup: read("app/(auth)/signup.tsx"),
  subscribe: read("app/subscribe.tsx"),
  studio: read("app/channel-settings.tsx"),
  tabs: read("app/(tabs)/_layout.tsx"),
  thread: read("app/chat/[threadId].tsx"),
  title: read("app/title/[id].tsx"),
  visual: read("components/ui/chillywood-visual-system.tsx"),
  partyRoom: read("app/watch-party/[partyId].tsx"),
  liveStage: read("app/watch-party/live-stage/[partyId].tsx"),
  watchParty: read("app/watch-party/index.tsx"),
};

test("the Sign In-derived system owns one exact canonical primary gradient", () => {
  for (const marker of [
    'direction: Object.freeze({ x1: "0", x2: "1", y1: "0", y2: "0" })',
    'Object.freeze({ offset: "0", color: "#7300D8" })',
    'Object.freeze({ offset: "0.54", color: "#321CFF" })',
    'Object.freeze({ offset: "1", color: "#00A8FF" })',
    'primaryBorder: "rgba(91,214,255,0.72)"',
    'primaryGlow: "#241DFF"',
  ]) assert.ok(sources.visual.includes(marker), `missing canonical visual marker: ${marker}`);

  assert.match(sources.login, /function NeonSignInButton/);
  assert.match(sources.login, /<LinearGradient id="loginButtonGradient" x1="0" x2="1" y1="0" y2="0">/);
  assert.match(sources.login, /<Stop offset="0" stopColor="#7300D8" \/>/);
  assert.match(sources.login, /<Stop offset="0\.54" stopColor="#321CFF" \/>/);
  assert.match(sources.login, /<Stop offset="1" stopColor="#00A8FF" \/>/);
  assert.match(sources.visual, /preserveAspectRatio="none"/);
  assert.match(sources.visual, /styles\.primaryActionFill/);
  assert.match(sources.visual, /\.\.\.StyleSheet\.absoluteFillObject/);
  assert.match(sources.visual, /backgroundColor:\s*CHILLYWOOD_PRIMARY_GRADIENT\.stops\[2\]\.color/);
  assert.match(sources.visual, /overflow:\s*"hidden"/);
  assert.match(sources.visual, /viewBox="0 0 100 100"/);
  assert.match(sources.visual, /<Svg[^>]+height="100%"[^>]+width="100%"/s);
  assert.doesNotMatch(sources.visual, /<Svg[^>]+style=\{StyleSheet\.absoluteFillObject\}/s);
  assert.doesNotMatch(sources.appSurface, /#7300D8|#321CFF|#00A8FF/);
});

test("the entire route tree inherits the Chicago-night foundation and branded navigation", () => {
  assert.match(sources.appLayout, /<ChillywoodBrandedSurface style=\{styles\.appRootReady\} testID="app-root-ready" variant="app">/);
  assert.match(sources.appLayout, /contentStyle: styles\.navigatorContent/);
  assert.match(sources.tabs, /backgroundColor: 'rgba\(7,5,27,0\.94\)'/);
  assert.match(sources.tabs, /borderTopColor: 'rgba\(132,40,255,0\.58\)'/);
  for (const tab of ["index", "explore", "live", "my-list"]) {
    assert.ok(sources.tabs.includes(`name="${tab}"`), `bottom tab ${tab} was not audited`);
  }
});

test("equivalent primary actions across the main user-facing families reuse the canonical fill", () => {
  const families = [
    ["signup", sources.signup],
    ["forgot password", sources.forgot],
    ["password recovery", sources.reset],
    ["auth callback", sources.authCallback],
    ["legal gate", sources.appLayout],
    ["Home", sources.home],
    ["Live", sources.live],
    ["Library", sources.library],
    ["Profile", sources.profileTab],
    ["Settings", sources.settings],
    ["Chi'lly Circle", sources.circle],
    ["Chat", sources.thread],
    ["Platform Studio", sources.studio],
    ["Watch-Party", sources.watchParty],
    ["shared actions", sources.appSurface],
    ["access gate", sources.betaAccess],
  ];
  for (const [label, source] of families) {
    assert.match(source, /ChillywoodPrimaryActionFill|variant="primary"/, `${label} lacks the canonical primary treatment`);
  }
});

test("panels, legal pages, loading states, and error states use reusable branded primitives", () => {
  assert.match(sources.legal, /ChillywoodBrandedSurface/);
  assert.match(sources.legal, /ChillywoodGlassPanel/);
  assert.match(sources.betaAccess, /ChillywoodBrandedSurface/);
  assert.match(sources.betaAccess, /ChillywoodGlassPanel/);
  assert.match(sources.appSurface, /ChillywoodPrimaryActionFill/);
  assert.match(sources.visual, /export function ChillywoodPanel/);
  assert.match(sources.visual, /export function ChillywoodInputFrame/);
});

test("physically observed half-migrated surfaces use the Sign In-derived surface roles", () => {
  assert.match(sources.settings, /card:[\s\S]+borderColor: CHILLYWOOD_VISUAL\.glassBorder,[\s\S]+backgroundColor: CHILLYWOOD_VISUAL\.glassBackground,/);
  assert.match(sources.settings, /settingsRow:[\s\S]+borderColor: CHILLYWOOD_VISUAL\.controlBorder,[\s\S]+backgroundColor: CHILLYWOOD_VISUAL\.controlBackground,/);
  assert.match(sources.circle, /sectionCard:[\s\S]+borderColor: CHILLYWOOD_VISUAL\.glassBorder,[\s\S]+backgroundColor: CHILLYWOOD_VISUAL\.glassBackground,/);
  assert.match(sources.explore, /scopeChipActive:[\s\S]+borderColor: CHILLYWOOD_VISUAL\.primaryBorder,[\s\S]+rgba\(110,33,255,0\.28\)/);
  assert.match(sources.library, /scopePill:[^\n]+CHILLYWOOD_VISUAL\.controlBorder[^\n]+CHILLYWOOD_VISUAL\.controlBackground/);
  assert.match(sources.live, /primaryButton:[^\n]+CHILLYWOOD_VISUAL\.accentPurple[^\n]+CHILLYWOOD_VISUAL\.primaryBorder/);
  assert.match(sources.watchParty, /primaryButton:[\s\S]+backgroundColor: CHILLYWOOD_VISUAL\.accentPurple,[\s\S]+borderColor: CHILLYWOOD_VISUAL\.primaryBorder,/);
  assert.doesNotMatch(sources.watchParty, /primaryButton:[\s\S]{0,260}backgroundColor: "#DC143C"/);
  assert.match(sources.subscribe, /premium-purchase-button[\s\S]+<ChillywoodPrimaryActionFill opacity=\{busy \? 0\.56 : 1\} radius=\{14\} \/>/);
  assert.doesNotMatch(sources.subscribe, /primaryButton:[\s\S]{0,260}backgroundColor: "#DC143C"/);
  assert.match(sources.studio, /active \? <ChillywoodPrimaryActionFill radius=\{999\} \/> : null/);
  assert.match(sources.studio, /titleOverlayPosition === option\.id \? <ChillywoodPrimaryActionFill radius=\{999\} \/> : null/);
  assert.match(sources.studio, /templatePreset === option\.id \? <ChillywoodPrimaryActionFill radius=\{14\} \/> : null/);
  assert.match(sources.studio, /creatorContentPanel:[\s\S]+borderColor: CHILLYWOOD_VISUAL\.glassBorder,[\s\S]+backgroundColor: CHILLYWOOD_VISUAL\.glassBackground,/);
  assert.match(sources.studio, /creator-upload-source-gallery-button[\s\S]+<ChillywoodPrimaryActionFill radius=\{16\} \/>/);
  assert.match(sources.studio, /studioTabButtonActive:[\s\S]+borderColor: CHILLYWOOD_VISUAL\.primaryBorder/);
  assert.match(sources.studio, /studioHeaderCard:[\s\S]+borderColor: CHILLYWOOD_VISUAL\.glassBorder,[\s\S]+backgroundColor: CHILLYWOOD_VISUAL\.glassBackground/);
  assert.match(sources.partyRoom, /watch-party-open-shared-player-button[\s\S]+<ChillywoodPrimaryActionFill opacity=\{watchPartyLiveOpening \? 0\.58 : 1\} radius=\{16\} \/>/);
  assert.doesNotMatch(sources.partyRoom, /watchCTA:[\s\S]{0,260}backgroundColor: "#DC143C"/);
  assert.match(sources.liveStage, /live-room-enter-stage-button[\s\S]+<ChillywoodPrimaryActionFill radius=\{16\} \/>/);
  assert.match(sources.liveStage, /liveRoomSurfaceContentHost:\s*\{ paddingTop: 112 \}/);
  assert.match(sources.liveStage, /liveMoneyHostSetupExpanded && \{[\s\S]+paddingTop: Math\.max\(320, Math\.min\(440, windowHeight - 180\)\)/);
  assert.match(sources.liveStage, /liveRoomShareButton[\s\S]+<ChillywoodPrimaryActionFill radius=\{999\} \/>/);
  assert.match(sources.liveStage, /routeGateBackground:[\s\S]+StyleSheet\.absoluteFillObject/);
  assert.match(sources.liveStage, /isLiveRoomSurface[\s\S]+styles\.liveMoneyHostControlsRoom[\s\S]+styles\.liveMoneyHostControlsStage/);
  assert.match(sources.liveStage, /!isLiveRoomSurface && liveMoneyHostSetupExpanded[\s\S]+styles\.liveMoneyHostControlsStageExpanded/);
  assert.match(sources.liveStage, /!isLiveRoomSurface \? \{ top: safeAreaInsets\.top \+ 252 \} : null/);
  assert.match(sources.liveStage, /liveMoneyHostControlsStage: \{[\s\S]{0,180}right: 12,[\s\S]{0,120}width: 156,[\s\S]{0,120}borderRadius: 999/);
  assert.match(sources.liveStage, /liveMoneyHostControlsStageExpanded: \{[\s\S]{0,180}left: 12,[\s\S]{0,80}right: 12,[\s\S]{0,80}width: "auto"/);
  assert.match(sources.liveStage, /!isLiveRoomSurface && !liveMoneyHostSetupExpanded[\s\S]{0,120}\? "Money"[\s\S]{0,120}: "Live Stage monetization"/);
  assert.match(sources.liveStage, /stageHeroFallback:[\s\S]+backgroundColor: CHILLYWOOD_VISUAL\.glassBackground/);
  assert.equal((sources.liveStage.match(/NotificationBellButton surface="live-stage"/gu) ?? []).length, 1);
  assert.match(sources.title, /title-details-branded-surface/);
  assert.match(sources.title, /<ChillywoodGlassPanel style=\{styles\.content\}>/);
  assert.match(sources.title, /<ChillywoodPrimaryActionFill opacity=\{accessLoading \? 0\.7 : 1\} radius=\{14\} \/>/);
  assert.match(sources.player, /PLAYER_CHICAGO_NIGHT_BACKGROUND = require\("\.\.\/\.\.\/assets\/images\/chicago-skyline\.jpg"\)/);
  assert.match(sources.player, /source=\{PLAYER_CHICAGO_NIGHT_BACKGROUND\}[\s\S]+frameworkBackgroundSource/);
  assert.match(sources.player, /topSectionFramework:[\s\S]+borderColor: CHILLYWOOD_VISUAL\.glassBorder,[\s\S]+backgroundColor: CHILLYWOOD_VISUAL\.glassBackground,/);
});

test("the preserved user-visible route inventory remains present", () => {
  const routes = [
    "app/(auth)/login.tsx", "app/(auth)/signup.tsx", "app/(auth)/forgot-password.tsx",
    "app/auth-callback.tsx", "app/reset-password.tsx", "app/settings.tsx", "app/chilly-circle.tsx",
    "app/chat/index.tsx", "app/chat/[threadId].tsx", "app/profile/[userId].tsx",
    "app/channel/[userId].tsx", "app/channel-settings.tsx", "app/channel-studio/index.tsx",
    "app/title/[id].tsx", "app/player/[id].tsx", "app/player/replay/[replayId].tsx",
    "app/watch-party/index.tsx", "app/watch-party/[partyId].tsx",
    "app/watch-party/live-stage/[partyId].tsx", "app/event/[eventId].tsx",
    "app/subscribe.tsx", "app/admin.tsx", "app/support.tsx",
    "app/community-guidelines.tsx", "app/privacy.tsx", "app/terms.tsx",
  ];
  for (const route of routes) {
    assert.equal(existsSync(new URL(`../${route}`, import.meta.url)), true, `missing audited route ${route}`);
  }
});

test("presentation primitives do not gain auth, call, provider, or database authority", () => {
  for (const source of [sources.visual, sources.appSurface, sources.legal]) {
    assert.doesNotMatch(source, /supabase|RevenueCat|CallKit|PushKit|LiveKit|startChatThreadCall|sendChatMessage|fetch\(/i);
  }
  for (const marker of [
    'onPress={() => void handleStartCall("voice")}',
    'onPress={() => void handleStartCall("video")}',
    "sendChatMessage(threadId, trimmedDraft, selectedAttachment)",
  ]) assert.ok(sources.thread.includes(marker), `Chat behavior marker changed: ${marker}`);
});

test("responsive, keyboard, safe-area, disabled, and accessibility contracts remain visible", () => {
  const joined = Object.values(sources).join("\n");
  for (const marker of [
    "KeyboardAvoidingView",
    "keyboardShouldPersistTaps",
    "useSafeAreaInsets",
    "useWindowDimensions",
    "accessibilityRole",
    "accessibilityState",
    "disabled=",
    "ScrollView",
  ]) assert.ok(joined.includes(marker), `missing responsive/accessibility marker: ${marker}`);
});
