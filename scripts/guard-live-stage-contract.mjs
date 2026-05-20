import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Live Stage contract guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing.`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not be present.`);
};

const assertBefore = (source, firstNeedle, secondNeedle, label) => {
  const firstIndex = source.indexOf(firstNeedle);
  const secondIndex = source.indexOf(secondNeedle);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex > secondIndex) fail(label);
};

const appLayout = readSource("app/_layout.tsx");
const liveStage = readSource("app/watch-party/live-stage/[partyId].tsx");
const player = readSource("app/player/[id].tsx");
const watchPartyIndex = readSource("app/watch-party/index.tsx");
const partyRoom = readSource("app/watch-party/[partyId].tsx");

assertIncludes(appLayout, '<Stack.Screen name="watch-party/live-stage/index" />', "Live Stage index route registration");
assertIncludes(appLayout, '<Stack.Screen name="watch-party/live-stage/[partyId]" />', "Live Stage party route registration");
assertIncludes(liveStage, "export default function WatchPartyLiveStageScreen", "Live Stage canonical screen owner");
assertIncludes(watchPartyIndex, 'import WatchPartyLiveStageScreen from "./live-stage/[partyId]";', "Live waiting room embedded Live Stage owner import");
assertIncludes(watchPartyIndex, 'const liveStageRoute = `/watch-party/live-stage${queryString ? `?${queryString}` : ""}`;', "Live waiting room handoff route");
assertIncludes(partyRoom, 'pathname: "/watch-party/live-stage/[partyId]"', "Party Room Go Live route remains explicit");
assertNotIncludes(player, "WatchPartyLiveStageScreen", "Player must not import or merge the Live Stage screen");
assertNotIncludes(player, 'pathname: "/watch-party/live-stage/[partyId]"', "Player must not route directly into Live Stage");
assertNotIncludes(player, "watch-party/live-stage/[partyId]", "Player must not own Live Stage route strings");

assertIncludes(liveStage, "Live Stage surface lock: preserve docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md.", "Live Stage approved layout lock marker");
assertIncludes(liveStage, "Do not visually change routes, comments, controls, player, composer, labels, or member tiles here without explicit approval.", "Live Stage no-redesign marker");
assertIncludes(liveStage, "Live First must not render the Chi'lly Party Members box; Live Watch-Party owns that deck.", "Live First / Live Watch-Party ownership marker");
assertIncludes(liveStage, "Layout lock: visible Live Stage comments stay in this dock", "Live Stage comments dock lock");
assertIncludes(liveStage, "Layout lock: preserve the people-first Chi'lly Party Members grid structure", "Live Watch-Party member grid layout lock");
assertIncludes(liveStage, '{"Chi\'lly Party Members"}', "Live Watch-Party member deck label");
assertIncludes(liveStage, "const LIVE_STAGE_REMOTE_GRID_COLUMNS = 3;", "Live Stage participant grid column lock");
assertIncludes(liveStage, "const LIVE_STAGE_REMOTE_GRID_VISIBLE_ROWS = 2;", "Live Stage visible row lock");

assertIncludes(liveStage, 'testID="live-stage-comment-input"', "Live Stage comment composer test marker");
assertIncludes(liveStage, 'testID="live-stage-comment-send"', "Live Stage comment send test marker");
assertIncludes(liveStage, 'testID="live-stage-reaction-picker-button"', "Live Stage reaction picker test marker");
assertIncludes(liveStage, 'testID="live-stage-mode-live"', "Live First mode toggle test marker");
assertIncludes(liveStage, 'testID="live-stage-mode-hybrid"', "Live Watch-Party mode toggle test marker");
assertBefore(
  liveStage,
  "renderStageOverlayUtilitySheets()",
  "renderStageLowerDock()",
  "Live Stage overlay utility sheets must stay above the lower dock in the approved stage shell.",
);
assertIncludes(liveStage, "communityCardParticipants = useMemo", "Live Stage participant visibility owner");
assertIncludes(
  liveStage,
  "if (!participant.userId || participant.userId === currentUserParticipantId) return false;",
  "Live Stage member deck should only remove the local/current participant from member cards",
);
assertIncludes(
  liveStage,
  "if (participantState.isRemoved) return false;",
  "Live Stage member deck should only remove explicitly removed participants",
);
assertNotIncludes(liveStage, "proof-live-stage-host-0001", "Live Stage route must not contain proof host identities");
assertNotIncludes(liveStage, "proof-live-stage-viewer-0001", "Live Stage route must not contain proof viewer identities");

if (process.exitCode) process.exit();
console.log("Live Stage contract guard passed.");
