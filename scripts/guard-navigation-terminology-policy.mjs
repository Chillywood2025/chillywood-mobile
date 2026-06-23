#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Navigation terminology policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const tabs = read("app/(tabs)/_layout.tsx");
const liveTab = read("app/(tabs)/live.tsx");
const profileTab = read("app/(tabs)/profile.tsx");
const libraryTab = read("app/(tabs)/my-list.tsx");
const explore = read("app/(tabs)/explore.tsx");
const home = read("app/(tabs)/index.tsx");
const homeRoute = read("app/home.tsx");
const libraryRoute = read("app/library.tsx");
const player = read("app/player/[id].tsx");
const watchPartyIndex = read("app/watch-party/index.tsx");
const mainTabTopBar = read("components/navigation/main-tab-top-bar.tsx");
const iconSymbol = read("components/ui/icon-symbol.tsx");
const masterVision = read("MASTER_VISION.md");
const architectureRules = read("ARCHITECTURE_RULES.md");
const roomBlueprint = read("ROOM_BLUEPRINT.md");
const navDoc = read("docs/NAVIGATION_TERMINOLOGY_MAP.md");

[
  "title: 'Home'",
  "title: 'Explore'",
  "title: 'Live'",
  "title: 'Saved'",
].forEach((label) => assertIncludes(tabs, label, "bottom navigation"));

assertIncludes(tabs, 'name="profile"', "hidden Profile tab route registration");
assertIncludes(tabs, "href: null", "Profile hidden from bottom navigation");
assertNotIncludes(tabs, "Admin", "normal bottom navigation");
assertNotIncludes(tabs, "My List", "bottom navigation label");
assertNotIncludes(tabs, "title: 'Library'", "bottom navigation label");
assertNotIncludes(tabs, "title: 'Profile'", "normal bottom navigation label");
assertIncludes(iconSymbol, "'play.circle.fill': 'live-tv'", "Live bottom-nav icon");

assertIncludes(liveTab, "heroHeader", "Live screen Hero header pattern");
assertIncludes(liveTab, "compactActionCard", "Live screen Compact action cards pattern");
assertIncludes(liveTab, "actionRow", "Live screen Action rows pattern");
assertIncludes(liveTab, "statusPill", "Live screen Status pills pattern");
assertIncludes(liveTab, "choiceChip", "Live screen Choice chips pattern");
assertIncludes(liveTab, "disclosureCard", "Live screen Progressive disclosure pattern");
assertIncludes(liveTab, "emptyState", "Live screen Empty state pattern");
assertIncludes(liveTab, "Start or join a people-first live room.", "Live Watch-Party user copy");
assertIncludes(liveTab, "Use a room code for an existing content-first Watch-Party Live room.", "Watch-Party Live user copy");
assertIncludes(liveTab, "Choose a title or creator video first, then start Watch-Party Live from the player.", "Browse Titles user copy");
assertIncludes(liveTab, "Paid Watch-Party Seat Passes stay in Party Waiting Room to Party Room, not Live Stage.", "Party Room separation");
assertIncludes(liveTab, "requireLiveFirstPremium", "Live tab Premium/runtime preflight");
assertIncludes(liveTab, 'params: { mode: "live", source: "bottom-live-tab" }', "Live tab route mapping");
assertIncludes(liveTab, "CHILLYWOOD_BACKGROUND_SOURCE", "Live tab Chi'llywood background");
[
  "This opens the existing Live Waiting Room",
  "keeps Live Stage ownership unchanged",
  "New Watch-Party Live rooms still start from a title",
  "Browse titles first, then start Watch-Party Live from the title or Player when access is allowed",
].forEach((needle) => assertNotIncludes(liveTab, needle, "Live screen user copy"));

assertIncludes(profileTab, "Profile is your social identity", "Profile/Platform separation");
assertIncludes(profileTab, "Platform and Platform Studio stay separate", "Profile tab creator surface separation");
assertIncludes(libraryTab, "My Library", "Library screen header");
assertIncludes(libraryTab, "Saved titles, watch progress, followed Platforms, and saved replays live here.", "Library saved scope copy");
assertNotIncludes(libraryTab, "creator-owned draft", "viewer Library must not become creator Content Library");
assertIncludes(libraryTab, "readMergedWatchProgress", "Library backed continue watching");
assertIncludes(libraryTab, "readFollowedChannelUserIds", "Library backed followed Platforms");
assertIncludes(libraryTab, "CHILLYWOOD_BACKGROUND_SOURCE", "Library Chi'llywood background");
assertIncludes(explore, "Search titles, public people, Platforms, creator videos, Originals, events, and replays.", "Explore backed scope copy");
assertIncludes(explore, "EXPLORE_SEARCH_SCOPES", "Explore search scope list");
assertIncludes(explore, 'label: "People"', "Explore People search scope");
assertIncludes(explore, 'label: "Originals"', "Explore Originals search scope");
assertIncludes(explore, 'testID="explore-typeahead-results"', "Explore typeahead results");
assertIncludes(explore, "EXPLORE_SEARCH_DEBOUNCE_MS", "Explore debounced search");
assertIncludes(explore, "searchPublicPeople", "Explore public people search source");
assertIncludes(explore, 'testID="explore-people-search-section"', "Explore People results section");
assertIncludes(explore, "readRankedPublicDiscoveryFeedItems({ surface: \"home\"", "Explore ranked public discovery feed source");
assertIncludes(explore, "readLatestPublicCreatorVideos", "Explore public creator video source");
assertIncludes(explore, "readCreatorVideos(RACHI_OFFICIAL_ACCOUNT.userId", "Explore Rachi Originals source");
assertIncludes(explore, "No public replays yet", "Explore honest replay empty state");
assertIncludes(explore, "Search Chi'llywood", "Explore unified search copy");
assertIncludes(explore, "CHILLYWOOD_BACKGROUND_SOURCE", "Explore Chi'llywood fallback background");
["fake", "mock row", "sample row", "dummy row"].forEach((needle) => {
  assertNotIncludes(explore, needle, "Explore backed data surface");
  assertNotIncludes(libraryTab, needle, "Library backed data surface");
});
assertIncludes(home, 'accessibilityLabel="Open your Profile"', "Home Profile affordance");
assertIncludes(homeRoute, '<Redirect href="/(tabs)" />', "Home user-facing route alias");
assertIncludes(libraryRoute, '<Redirect href="/(tabs)/my-list" />', "Library user-facing route alias");
assertIncludes(home, 'testID="main-tab-home-profile-entry"', "Home top Profile entry test id");
assertIncludes(home, 'testID="main-tab-home-settings-action"', "Home top Settings test id");
assertIncludes(home, 'pathname: "/profile/[userId]"', "Home top Profile route");
assertIncludes(home, "CHILLYWOOD_BACKGROUND_SOURCE", "Home branded background");
assertIncludes(home, "homeHeroWrap", "Home cinematic hero wrapper");
assertIncludes(home, 'testID="home-branded-hero"', "Home branded hero fallback");
assertIncludes(home, 'testID="home-continue-watching-hero"', "Home Continue Watching hero");
assertIncludes(home, 'testID="home-continue-watching-hero-action"', "Home Continue Watching hero action");
assertIncludes(home, "const continueWatchingHeroItem = canShowContinueWatching ? continueCandidates[0] ?? null : null", "Home hero reads only eligible Continue Watching candidates");
assertIncludes(home, "HOME_CONTINUE_MIN_POSITION_MILLIS = 10_000", "Home Continue Watching minimum watch threshold");
assertIncludes(home, "HOME_CONTINUE_COMPLETION_THRESHOLD = 0.94", "Home Continue Watching completion threshold");
assertIncludes(home, "isEligibleContinueWatchingProgress", "Home Continue Watching eligibility helper");
assertIncludes(home, "position < HOME_CONTINUE_MIN_POSITION_MILLIS", "Home tiny progress excluded");
assertIncludes(home, "position / duration < HOME_CONTINUE_COMPLETION_THRESHOLD", "Home completed titles excluded");
assertIncludes(home, "isAvailableContinueWatchingTitle", "Home Continue Watching title availability helper");
assertIncludes(home, "HOME_CONTINUE_BLOCKED_TITLE_STATUSES", "Home blocked title status set");
assertIncludes(home, "HOME_CONTINUE_BLOCKED_ACCESS_RULES", "Home blocked access rule set");
assertIncludes(home, "getContinueLastWatchedAt", "Home last watched sort helper");
assertIncludes(home, "return bLastWatchedAt - aLastWatchedAt", "Home Continue Watching most recent sort");
assertIncludes(home, "getContinueWatchingProgressPercent", "Home Continue Watching progress bar helper");
assertIncludes(explore, 'surface="explore"', "Explore top Profile/Settings entry");
assertIncludes(liveTab, 'surface="live"', "Live top Profile/Settings entry");
assertIncludes(libraryTab, 'surface="library"', "Library top Profile/Settings entry");
assertIncludes(mainTabTopBar, 'testID={`main-tab-${surface}-profile-entry`}', "shared top Profile entry");
assertIncludes(mainTabTopBar, 'testID={`main-tab-${surface}-settings-action`}', "shared top Settings entry");
["Top Picks", "Favorites", "Latest Public Uploads", "Platforms You Follow"].forEach((needle) => {
  assertNotIncludes(home, needle, "Home redundant bottom-tab section cleanup");
});
assertNotIncludes(home, '|| "Browse"', "Home Browse rail fallback");
assertNotIncludes(home, 'railKey === "browse"', "Home Browse rail");
assertNotIncludes(home, 'railKey === "top_picks"', "Home Top Picks rail");
assertNotIncludes(home, 'railKey === "favorites"', "Home Favorites rail");
assertNotIncludes(home, "spotlightItem", "Home random title spotlight");
assertNotIncludes(home, "programmedHeroItem", "Home latest/programmed title hero fallback");
assertNotIncludes(home, "latestTitles[0] ?? null", "Home latest title hero fallback");
assertNotIncludes(home, 'testID="home-discovery-pulse"', "Home dashboard first card");
assertNotIncludes(home, "discoveryPulse", "Home dashboard first-card styles");
assertNotIncludes(home, ["Your night", " at a glance"].join(""), "Home old dashboard first-card copy");
assertNotIncludes(home, 'testID="home-continue-watching-section"', "Home compact Continue Watching rail");
assertNotIncludes(home, 'testID="home-continue-watching-card"', "Home compact Continue Watching rail card");
assertNotIncludes(home, "Loading tonight's picks", "Home title-picks loading copy");
assertNotIncludes(home, "readMyListIds", "Home saved/favorites data source");
assertIncludes(player, "type PlayerSurfaceMode", "Player surface mode type");
assertIncludes(player, "resolvePlayerSurfaceMode", "Player surface mode resolver");
assertIncludes(player, '"watch-party-live-shared"', "Player Watch-Party Live shared mode");
assertIncludes(player, '"standalone-creator-video"', "Player creator video mode");
assertIncludes(player, 'surfaceLabel="Watch-Party Live"', "Player Watch-Party Live surface label");
assertIncludes(player, "Audio Mix", "Player Watch-Party Live audio mix label");
assertIncludes(player, "This room belongs to Live Watch-Party, not Watch-Party Live.", "Player live naming split");
assertIncludes(player, "Open Party Room", "Player Party Room compatibility action");
assertIncludes(watchPartyIndex, "HOST PREFLIGHT", "Watch-Party host preflight");
assertIncludes(watchPartyIndex, "Live Watch-Party", "Watch-Party Live/Live Watch-Party label split");
assertIncludes(watchPartyIndex, "Watch-Party Live", "Watch-Party Live label");

assertIncludes(masterVision, "Watch-Party Live", "locked Watch-Party Live label");
assertIncludes(masterVision, "Live Watch-Party", "locked Live Watch-Party label");
assertIncludes(masterVision, "Party Room", "locked Party Room label");
assertIncludes(architectureRules, "Public Platform surface: `/channel/[userId]`", "route compatibility doctrine");
assertIncludes(roomBlueprint, "Party Room must not hand off to Live Stage", "Party Room route separation");

[
  "Viewer mode",
  "Creator mode",
  "Owner/Admin mode",
  "Home / Explore / Live / Library",
  "top Profile/avatar entry",
  "Watch-Party Live = content/player-driven watch-together flow",
  "Live Watch-Party = people-first live room",
  "Party Room = canonical room shell",
  "Platform Studio stays out of normal viewer bottom navigation",
].forEach((needle) => assertIncludes(navDoc, needle, "navigation terminology map"));

[
  "Mini Platform",
  "mini platform",
  "Open your channel",
  "manage your channel",
  "Channel customization",
  "Profile / Channel",
].forEach((needle) => {
  [
    ["app/(tabs)/index.tsx", home],
    ["app/(tabs)/live.tsx", liveTab],
    ["app/(tabs)/profile.tsx", profileTab],
    ["app/(tabs)/my-list.tsx", libraryTab],
    ["app/(tabs)/explore.tsx", explore],
    ["app/(tabs)/_layout.tsx", tabs],
  ].forEach(([label, source]) => assertNotIncludes(source, needle, label));
});

if (process.exitCode) {
  process.exit();
}

console.log("Navigation terminology policy guard passed.");
