#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const doc = read("docs/release/CHAT_CALL_REMOTE_VIDEO_LIVE_ACTION_UX_SWEEP.md");
const standard = read("docs/release/ACTUAL_USER_PROOF_STANDARD.md");
const sessionHook = read("hooks/use-communication-room-session.ts");
const participantGrid = read("components/communication/communication-participant-grid.tsx");
const communicationPanel = read("components/communication/in-room-communication-panel.tsx");
const responsiveLayout = read("hooks/use-responsive-layout.ts");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const packageJson = read("package.json");

[
  "Actual-user proof is Closed only when Robert or a normal tester can reproduce the behavior",
  "Diagnostic proof may support a claim. It cannot close the actual user journey by itself.",
].forEach((needle) => requireText("actual-user proof standard", standard, needle));

[
  "Verdict: Partial.",
  "Primary issue result: Partial.",
  "Chi'lly Chat video call local video renders, but remote video does not appear.",
  "One device video is cut off",
  "Live Watch-Party participant action controls appear",
  "Root Cause",
  "Fix Applied",
  "Direct Chat video lower tile can sit under bottom controls",
  "Participant metadata card covers too much of video feed",
  "Responsive foundation added.",
  "Direct Chat video call layout adapts by dimensions and safe area.",
  "Adjacent UI / UX Issues Found",
  "Actual-user installed-app proof result: Partial.",
  "R3CXA0DS5JV",
  "Google Play-installed v61",
  "Direct Chat Android two-phone responsive video layout is Closed",
  "/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/",
  "No physical phone sideload was used.",
  "`chat_threads` RLS was not weakened.",
  "Premium gates were not bypassed or weakened.",
  "liveMoneyEnabled remains OFF.",
  "No provider mutation happened.",
  "No secrets/tokens/private data were committed or artifacted.",
].forEach((needle) => requireText("sweep doc", doc, needle));

[
  "delayedAudioFirstBind",
  "cameraOn: isSelf ? participant.cameraOn : participant.cameraOn || !!remoteStreamURL",
].forEach((needle) => requireText("communication room session hook", sessionHook, needle));

[
  'const videoObjectFit = "cover";',
  "objectFit={videoObjectFit}",
  "responsiveLayout.videoTileGap",
  "isFullscreen && participants.length === 2 && styles.tileFullscreenSplit",
  "position: \"relative\"",
].forEach((needle) => requireText("communication participant grid", participantGrid, needle));

[
  "useWindowDimensions",
  "useSafeAreaInsets",
  "getDeviceClass",
  "getSafeBottomControlPadding",
  "responsiveTileHeight",
  "foldableOrExpanded",
].forEach((needle) => requireText("responsive layout hook", responsiveLayout, needle));

[
  "const responsiveLayout = useResponsiveLayout();",
  "paddingBottom: responsiveLayout.safeBottomPadding",
  "minimumTouchTarget={responsiveLayout.minimumTouchTarget}",
].forEach((needle) => requireText("communication panel", communicationPanel, needle));

[
  "stageParticipantActionBusyId",
  "runStageParticipantAction",
  "Saving...",
  "collapseHostParticipantControls(participant.userId);",
  "stageParticipantActionBtnBusy",
].forEach((needle) => requireText("live stage screen", liveStage, needle));

[
  "proof:chat-call-remote-video-live-action-ux-sweep",
  "guard:chat-call-remote-video-live-action-ux-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("chat call remote video/live action UX sweep proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("chat call remote video/live action UX sweep proof passed.");
console.log("- source fixes, lane documentation, actual-user Partial status, and safety wording are present.");
