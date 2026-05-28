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
const iconSymbol = read("components/ui/icon-symbol.tsx");
const masterVision = read("MASTER_VISION.md");
const architectureRules = read("ARCHITECTURE_RULES.md");
const roomBlueprint = read("ROOM_BLUEPRINT.md");
const navDoc = read("docs/NAVIGATION_TERMINOLOGY_MAP.md");

[
  "title: 'Home'",
  "title: 'Explore'",
  "title: 'Live'",
  "title: 'Library'",
  "title: 'Profile'",
].forEach((label) => assertIncludes(tabs, label, "bottom navigation"));

assertNotIncludes(tabs, "Admin", "normal bottom navigation");
assertNotIncludes(tabs, "My List", "bottom navigation label");
assertIncludes(iconSymbol, "'play.circle.fill': 'live-tv'", "Live bottom-nav icon");
assertIncludes(iconSymbol, "'person.crop.circle.fill': 'person'", "Profile bottom-nav icon");

assertIncludes(liveTab, "heroHeader", "Live screen Hero header pattern");
assertIncludes(liveTab, "compactActionCard", "Live screen Compact action cards pattern");
assertIncludes(liveTab, "actionRow", "Live screen Action rows pattern");
assertIncludes(liveTab, "statusPill", "Live screen Status pills pattern");
assertIncludes(liveTab, "choiceChip", "Live screen Choice chips pattern");
assertIncludes(liveTab, "disclosureCard", "Live screen Progressive disclosure pattern");
assertIncludes(liveTab, "emptyState", "Live screen Empty state pattern");
assertIncludes(liveTab, "Start or join a people-first live room.", "Live Watch-Party user copy");
assertIncludes(liveTab, "Enter a room code or start from content.", "Watch-Party Live user copy");
assertIncludes(liveTab, "Pick something first, then watch together.", "Find Content user copy");
assertIncludes(liveTab, "Party Room stays separate", "Party Room separation");
assertIncludes(liveTab, "requireLiveFirstPremium", "Live tab Premium/runtime preflight");
assertIncludes(liveTab, 'params: { mode: "live", source: "bottom-live-tab" }', "Live tab route mapping");
[
  "This opens the existing Live Waiting Room",
  "keeps Live Stage ownership unchanged",
  "New Watch-Party Live rooms still start from a title",
  "Browse titles first, then start Watch-Party Live from the title or Player when access is allowed",
].forEach((needle) => assertNotIncludes(liveTab, needle, "Live screen user copy"));

assertIncludes(profileTab, "Profile is your social identity", "Profile/Platform separation");
assertIncludes(profileTab, "Platform and Platform Studio stay separate", "Profile tab creator surface separation");
assertIncludes(libraryTab, "Library", "Library label");
assertIncludes(libraryTab, "Other Library sections will appear only when real saved items exist.", "no fake Library sections");
assertIncludes(explore, "Search titles here.", "Explore current scope copy");
assertIncludes(explore, "unified discovery rolls out", "Explore future plan copy");
assertIncludes(home, 'accessibilityLabel="Open your Profile"', "Home Profile affordance");

assertIncludes(masterVision, "Watch-Party Live", "locked Watch-Party Live label");
assertIncludes(masterVision, "Live Watch-Party", "locked Live Watch-Party label");
assertIncludes(masterVision, "Party Room", "locked Party Room label");
assertIncludes(architectureRules, "Public Platform surface: `/channel/[userId]`", "route compatibility doctrine");
assertIncludes(roomBlueprint, "Party Room must not hand off to Live Stage", "Party Room route separation");

[
  "Viewer mode",
  "Creator mode",
  "Owner/Admin mode",
  "Home / Explore / Live / Library / Profile",
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
