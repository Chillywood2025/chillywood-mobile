#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Profile production policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const profile = read("app/profile/[userId].tsx");
const profileFeedCard = read("components/ProfileSocialFeedCard.tsx");
const publicPlatform = read("app/channel/[userId].tsx");
const platformStudio = read("app/channel-settings.tsx");

assertIncludes(profile, `label: "Platform"`, "Profile tab labels");
assertIncludes(profile, `Preview Platform`, "owner public Platform preview action");
assertIncludes(profile, `params: { userId, preview: "public" }`, "owner public Platform preview route");
assertIncludes(profile, `Platform Studio`, "owner Platform Studio action");
assertIncludes(profile, `Chi'lly Chat`, "Profile Chi'lly Chat action");
assertIncludes(profile, `getOrCreateDirectThread`, "viewer Profile-to-Chi'lly Chat route");
assertIncludes(profile, `!appConfig.runtimeControls.chat_enabled`, "Chi'lly Chat runtime-control guard");
assertIncludes(profile, `accessibilityLabel="Attach to profile post"`, "Profile post attachment control");
assertIncludes(profile, `Creator videos belong in Platform Studio.`, "Profile composer creator-video handoff copy");
assertIncludes(profile, `isSelfProfile && post.visibility === "draft"`, "owner-only draft marker");
assertIncludes(profile, `isSelfProfile ? onPressPreviewPlatform : onPressViewChannel`, "Platform stat/empty-state owner preview split");
assertIncludes(publicPlatform, `const showOwnerControls = isOwner && !publicPreviewMode`, "public Platform owner-control preview guard");
assertIncludes(platformStudio, `router.push({ pathname: "/channel/[userId]", params: { userId: previewUserId, preview: "public" } })`, "Platform Studio public preview route");

[
  "Upload a creator video",
  "Upload Video",
  ">Upload<",
  "onPressUploadVideo",
  "uploadCreatorVideo",
  "Creator videos stay in Channel",
  "View Channel",
  "News Feed",
  "Mini Platform",
  "foundation rows",
  "not wired",
  "RPC",
  "backend not connected",
].forEach((forbidden) => {
  assertNotIncludes(profile, forbidden, "Profile route user-facing policy");
});

[
  ">Channel<",
  "View Channel",
  "YOUR CHANNEL",
  "PUBLIC CHANNEL",
].forEach((forbidden) => {
  assertNotIncludes(profileFeedCard, forbidden, "Profile social feed card user-facing policy");
});

if (process.exitCode) {
  process.exit();
}

console.log("Profile production policy guard passed.");
