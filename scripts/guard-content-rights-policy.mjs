#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
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
const spectatorRoute = read("app/spectate/[itemId].tsx");
const rightsHelper = read("_lib/contentRights.ts");
const migration = read("supabase/migrations/202605260007_content_rights_disclosures.sql");
const dmcaDocs = read("docs/legal/COPYRIGHT_DMCA_POLICY.md");
const clipDocs = read("docs/CLIP_STUDIO.md");
const spectatorDocs = read("docs/SPECTATOR_CHILD_ROOM_FLOW.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const productDoctrine = read("PRODUCT_DOCTRINE.md");
const roomBlueprint = read("ROOM_BLUEPRINT.md");

const before = (source, marker) => source.includes(marker) ? source.slice(0, source.indexOf(marker)) : source;
const section = (source, start, end) => {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return source;
  const fromStart = source.slice(startIndex);
  const endIndex = fromStart.indexOf(end);
  return endIndex === -1 ? fromStart : fromStart.slice(0, endIndex);
};
const currentRightsDocs = [
  before(currentState, "May 26, 2026 Weekly Repo Documentation Audit"),
  before(nextTask, "## Previous Recommended Lane"),
  section(productDoctrine, "## Lightweight Rights Disclosure", "## Monetization Core"),
  section(roomBlueprint, "Visible Rights Disclosure UI", "## Feature Maturity Model"),
  section(clipDocs, "## Rights Disclosure Placement", "##"),
  before(spectatorDocs, "## Child Room Linking"),
  section(dmcaDocs, "Creator Rights Disclosure is separate", "Operational status:"),
].join("\n");

const rightsContractSurface = [
  rightsHelper,
  migration,
  dmcaDocs,
  clipDocs,
  spectatorDocs,
  currentState,
  nextTask,
  productDoctrine,
  roomBlueprint,
].join("\n");

[
  "content_rights_disclosures",
  "record_content_rights_disclosure",
  "contains_third_party_content",
  "contains_third_party_music",
  "Visible Rights Disclosure UI is disabled for now",
  "Backend disclosure helpers/tables are dormant",
  "Terms, Community Guidelines, Report/Copyright flow, DMCA/takedown, repeat-infringer policy, and moderation/admin removal",
  "Clip Studio and creator-video upload/publish do not show visible Rights UI",
  "Watch-Party Live waiting room",
  "Watch-Party Live Party Room",
  "Live Watch-Party waiting room",
  "Live Watch-Party Live Room / Live Stage",
  "Spectator",
  "does not grant copyright clearance",
  "does not override DMCA",
].forEach((needle) => assertIncludes(rightsContractSurface, needle, "content rights disclosure contract"));

const noRightsSurfaces = [
  ["Clip Studio/content upload", studio],
  ["Watch-Party waiting room", watchPartyStart],
  ["Watch-Party Live Party Room", watchPartyRoute],
  ["Live Watch-Party Live Room / Live Stage", liveStageRoute],
  ["Spectator", spectatorRoute],
];

[
  "CREATOR_UPLOAD_ACKNOWLEDGEMENT",
  "rights_acknowledgement_missing",
  "Confirm creator rights before",
  "Confirm the creator rights acknowledgement",
  "I don't own rights",
  "This protects you",
  "This makes it legal",
  "This protects",
  "makes it legal",
  "Contains third-party content",
  "Contains third-party music",
  "Add a note",
  "Clear disclosure",
  "RightsDisclosureControl",
  "ContentRightsDisclosure",
  "contentRightsDisclosure",
  "clipRightsDisclosure",
  "roomRightsDisclosure",
  "liveStageRightsDisclosure",
  "recordCreatorVideoRightsDisclosure",
  "recordClipRightsDisclosure",
  "recordRoomRightsDisclosure",
  "recordLiveStageRightsDisclosure",
  "rightsInlineRow",
  "rightsDisclosureRow",
  "hostRightsRow",
  "stageUtilityRightsRow",
  "rights-disclosure",
  "I don’t own this content",
  "I don’t own this music",
  "I don’t own this content or music",
  "Use this if your upload includes content or music",
  "Use this if your live or watch party includes content or music",
  "This does not confirm permission. Reports and takedowns can still apply.",
].forEach((needle) => {
  for (const [label, source] of noRightsSurfaces) {
    assertNotIncludes(source, needle, `${label} visible Rights UI`);
  }
});

if (existsSync(path.join(root, "components/content-rights/rights-disclosure-control.tsx"))) {
  fail("visible Rights Disclosure component must not exist while the UI is disabled.");
}

[
  "active rooms",
  "active room",
  "active-room",
  "inside active",
].forEach((needle) => assertNotIncludes(currentRightsDocs, needle, "current Rights docs product naming"));

[
  "I don’t own this content",
  "I don’t own this music",
  "I don’t own this content or music",
  "Contains third-party content",
  "Contains third-party music",
  "Use this if your live or watch party includes content or music",
].forEach((needle) => assertNotIncludes(currentRightsDocs, needle, "current Rights docs disabled-UI copy"));

assertIncludes(profile, `<Text style={styles.actionBtnText}>Platform</Text>`, "Profile top Platform action");
assertNotIncludes(profile, `{ key: "content", label: "Platform" }`, "duplicate bottom Profile Platform tab");
assertNotIncludes(`${profile}\n${studio}\n${watchPartyStart}\n${watchPartyRoute}\n${liveStageRoute}`, "Mini Platform", "user-facing Mini Platform copy");
assertNotIncludes(watchPartyRoute, "issueLiveKitToken", "Watch-Party Live token issuer behavior");
assertNotIncludes(liveStageRoute, "issueLiveKitToken", "Live Watch-Party token issuer behavior");

if (process.exitCode) process.exit(process.exitCode);
console.log("Content rights policy guard passed.");
