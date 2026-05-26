#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const fail = (message) => {
  console.error(`Content rights policy guard failed: ${message}`);
  process.exitCode = 1;
};
const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};
const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const profile = read("app/profile/[userId].tsx");
const studio = read("app/channel-settings.tsx");
const watchPartyStart = read("app/watch-party/index.tsx");
const watchPartyRoute = read("app/watch-party/[partyId].tsx");
const liveStageRoute = read("app/watch-party/live-stage/[partyId].tsx");
const rightsHelper = read("_lib/contentRights.ts");
const rightsControl = read("components/content-rights/rights-disclosure-control.tsx");
const migration = read("supabase/migrations/202605260007_content_rights_disclosures.sql");
const dmcaDocs = read("docs/legal/COPYRIGHT_DMCA_POLICY.md");
const clipDocs = read("docs/CLIP_STUDIO.md");

const combinedRightsSurface = [
  studio,
  watchPartyStart,
  rightsHelper,
  rightsControl,
  migration,
  dmcaDocs,
  clipDocs,
].join("\n");

[
  "content_rights_disclosures",
  "record_content_rights_disclosure",
  "contains_third_party_content",
  "contains_third_party_music",
  "Contains third-party content",
  "Contains third-party music",
  "Clear disclosure",
  "This disclosure does not confirm permission or licensing. Reports and takedowns can still apply.",
  "does not grant copyright clearance",
  "does not override DMCA",
  "surface: \"creator_video\"",
  "surface: \"clip_studio\"",
  "surface: room.roomType === \"live\" ? \"live_watch_party\" : \"watch_party_live\"",
  "targetType: room.roomType === \"live\" ? \"live_room\" : \"watch_party_room\"",
].forEach((needle) => assertIncludes(combinedRightsSurface, needle, "lightweight rights disclosure contract"));

[
  "CREATOR_UPLOAD_ACKNOWLEDGEMENT",
  "rights_acknowledgement_missing",
  "Confirm creator rights before",
  "Confirm the creator rights acknowledgement",
  "I don't own rights",
  "I don't own content",
  "I don't own music",
  "This protects you",
  "This makes it legal",
].forEach((needle) => assertNotIncludes(`${studio}\n${rightsControl}\n${watchPartyStart}`, needle, "creator-facing rights UI"));

assertIncludes(profile, `<Text style={styles.actionBtnText}>Platform</Text>`, "Profile top Platform action");
assertNotIncludes(profile, `{ key: "content", label: "Platform" }`, "duplicate bottom Profile Platform tab");
assertNotIncludes(`${profile}\n${studio}\n${watchPartyStart}\n${watchPartyRoute}\n${liveStageRoute}`, "Mini Platform", "user-facing Mini Platform copy");
assertNotIncludes(watchPartyRoute, "issueLiveKitToken", "Watch-Party Live token issuer behavior");
assertNotIncludes(liveStageRoute, "issueLiveKitToken", "Live Watch-Party token issuer behavior");

if (process.exitCode) process.exit(process.exitCode);
console.log("Content rights policy guard passed.");
