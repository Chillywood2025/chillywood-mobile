#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Critical UX polish policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const filesToScanForEntities = [
  "app/(auth)/login.tsx",
  "app/(auth)/signup.tsx",
  "app/(tabs)/index.tsx",
  "app/admin.tsx",
  "app/channel/[userId].tsx",
  "app/channel-settings.tsx",
  "app/chat/[threadId].tsx",
  "app/chat/index.tsx",
  "app/chilly-circle.tsx",
  "app/copyright-report.tsx",
  "app/player/[id].tsx",
  "app/profile/[userId].tsx",
  "app/settings.tsx",
  "app/subscribe.tsx",
  "app/title/[id].tsx",
  "app/watch-party/live-stage/[partyId].tsx",
  "app/watch-party/[partyId].tsx",
  "components/ads/NativeAdSlot.tsx",
  "components/communication/in-room-communication-panel.tsx",
  "components/legal/legal-policy-viewer.tsx",
  "components/live/live-effects-sheet.tsx",
  "components/system/root-error-boundary.tsx",
  "components/system/runtime-unavailable-screen.tsx",
  "components/system/support-screen.tsx",
];

for (const file of filesToScanForEntities) {
  const source = read(file);
  assertNotIncludes(source, "&apos;", file);
  assertNotIncludes(source, "&#39;", file);
}

const userFacingErrors = read("_lib/userFacingErrors.ts");
assertIncludes(userFacingErrors, "getUserFacingErrorMessage", "shared user-facing error helper");
assertIncludes(userFacingErrors, "This account does not have permission", "permission-safe error copy");
assertIncludes(userFacingErrors, "Sign in again", "auth-safe error copy");
assertIncludes(userFacingErrors, "Check your connection", "network-safe error copy");

const rootBoundary = read("components/system/root-error-boundary.tsx");
const rootLayout = read("app/_layout.tsx");
assertIncludes(rootBoundary, "errorName: error.name || \"Error\"", "root boundary analytics");
assertNotIncludes(rootBoundary, "defaultSummary={`Runtime issue: ${error.message}`}", "root boundary feedback summary");
assertNotIncludes(rootBoundary, "message: error.message", "root boundary analytics");
assertIncludes(rootLayout, "SENSITIVE_ROUTE_PARAM_NAMES.has(normalizedKey)", "auth redirect sensitive param filter");
assertIncludes(rootLayout, "normalizedKey.includes(\"token\")", "auth redirect token param filter");

const settings = read("app/settings.tsx");
const profile = read("app/profile/[userId].tsx");
const support = read("components/system/support-screen.tsx");
const copyrightReport = read("app/copyright-report.tsx");
const platformStudio = read("app/channel-settings.tsx");
const player = read("app/player/[id].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const liveEffectsSheet = read("components/live/live-effects-sheet.tsx");
const nativeAdSlot = read("components/ads/NativeAdSlot.tsx");
const monetization = read("_lib/monetization.ts");
const premiumWatchPartyAccess = read("_lib/premiumWatchPartyAccess.ts");
const spectatorAccess = read("_lib/spectatorAccess.ts");
const mediaStorage = read("_lib/mediaStorage.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const liveKitTokenContract = read("_lib/livekit/token-contract.ts");
const legalPolicies = read("legal/policies.mjs");
const legalSiteBuild = read("public-site/legal-site/build.mjs");

for (const [label, source] of [
  ["Settings", settings],
  ["Profile", profile],
  ["Support", support],
  ["Copyright report", copyrightReport],
  ["Platform Studio", platformStudio],
]) {
  assertIncludes(source, "getUserFacingErrorMessage", `${label} sanitized error usage`);
}

assertNotIncludes(settings, "Alert.alert(\"Log Out\", error.message)", "Settings logout raw error alert");
assertNotIncludes(settings, "setPasswordNotice(error.message)", "Settings password raw error notice");
assertNotIncludes(support, "error instanceof Error ? error.message : \"Try again in a moment.\"", "Support raw feedback error");
assertNotIncludes(copyrightReport, "error instanceof Error ? error.message : \"Unable to submit this copyright report right now.\"", "Copyright raw submit error");

const normalUserCopyChecks = [
  ["Live effects sheet", liveEffectsSheet, [
    "CHI’LLYFECTS FOUNDATION",
    "does not process the outgoing camera track",
    "Real processing is still a later lane",
  ]],
  ["Live Stage", liveStage, [
    "LiveKit server unavailable",
    "LiveKit join unavailable",
    "No healthy LiveKit server heartbeat",
    "does not process the outgoing LiveKit camera track",
    "selectable as a foundation only",
  ]],
  ["Native ad slot", nativeAdSlot, [
    "Ad placeholder",
    "Native/feed placement foundation",
    "No real ad is loaded",
  ]],
  ["Player", player, [
    "provider proof",
    "This upload could not be loaded from storage",
    "does not process the outgoing LiveKit camera track",
  ]],
  ["Platform Studio creator copy", platformStudio, [
    "creator storage",
    "Percent progress is not backed",
    "backed metadata",
    "landed audience schema",
    "schema truth",
    "provider proof",
    "No money rows returned",
    "No digital sales rows yet",
    "No tips rows yet",
    "No Watch-Party seat rows yet",
    "No paid content rows yet",
    "No merch rows yet",
    "No payout rows yet",
    "No verified ledger rows yet",
    "ledger rows",
    "raw payloads",
    "not provider-backed",
    "not wired",
  ]],
  ["Premium copy", monetization, [
    "Premium proof is being rechecked",
    "RevenueCat proof is rechecked",
    "trusted entitlement truth",
  ]],
  ["Premium live copy", premiumWatchPartyAccess, [
    "temporarily open for proof",
  ]],
  ["Spectator copy", spectatorAccess, [
    "broadcast proof exists",
  ]],
  ["Media upload copy", mediaStorage, [
    "Media storage",
    "incomplete upload contract",
  ]],
  ["Creator video copy", creatorVideos, [
    "Creator storage",
    "Storage global and bucket limits",
    "Creator media storage",
  ]],
  ["LiveKit token copy", liveKitTokenContract, [
    "backend token endpoint",
    "token issuance failed",
    "LiveKit token requests require",
  ]],
];

for (const [label, source, forbiddenPhrases] of normalUserCopyChecks) {
  for (const phrase of forbiddenPhrases) {
    assertNotIncludes(source, phrase, `${label} normal-user technical copy`);
  }
}

for (const phrase of [
  "approved backend deletion",
  "magic instant wipe",
  "service-role credentials",
  "Profile, Channel",
  "channel display",
  "Channel setup",
  "public channel",
  "token request metadata",
  "Supabase",
]) {
  assertNotIncludes(legalPolicies, phrase, "Public legal policy normal-user technical copy");
}
assertIncludes(
  legalPolicies,
  "approved deletion or de-identification process",
  "Account deletion production copy",
);
assertIncludes(legalSiteBuild, "[\"channel\", \"Platform\"]", "Public DMCA Platform option label");
assertNotIncludes(
  legalSiteBuild,
  "Public DMCA form disabled: Supabase public URL or public anon key is not configured for this static build.",
  "Public DMCA unavailable copy",
);
assertNotIncludes(
  legalSiteBuild,
  "Attachment upload token was not returned for this case.",
  "Public DMCA attachment copy",
);

if (process.exitCode) process.exit(process.exitCode);

console.log("Critical UX polish policy guard passed.");
