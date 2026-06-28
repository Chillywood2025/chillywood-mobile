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

const doc = read("docs/release/CROSS_LANE_ACTUAL_USER_PRODUCT_QA_SWEEP.md");
const actualUserStandard = read("docs/release/ACTUAL_USER_PROOF_STANDARD.md");
const participantGrid = read("components/communication/communication-participant-grid.tsx");
const inRoomPanel = read("components/communication/in-room-communication-panel.tsx");
const roomHeader = read("components/communication/communication-room-header.tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const packageJson = read("package.json");

[
  "Cross-Lane Actual-User Product QA Sweep: Closed / Partial / Blocked",
  "Verdict: Partial.",
  "Out-of-scope is not an excuse to ignore visible user-facing problems",
  "Proof scripts passing is not enough",
  "Diagnostic/backend proof is not actual-user proof",
  "If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed",
  "Small safe visible issues were fixed where found",
  "Risky or larger issues were documented instead of hidden",
  "No auth/RLS/Premium/chat/account-status/staff permission weakening happened",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
  "Actual-user installed-app proof result: Partial.",
].forEach((needle) => requireText("cross-lane QA doc", doc, needle));

[
  "Audit Scope",
  "Artifacts Reviewed",
  "Screenshots XML Logs Reviewed",
  "Proof Docs Scripts Reviewed",
  "User-Facing Issues Found",
  "Admin Moderator Owner Facing Issues Found",
  "Proof-Label Issues Found",
  "Fixes Made",
  "Issues Not Fixed And Why",
  "Remaining Launch Blockers",
  "Actual-User Proof Classification",
  "Safety Confirmation",
  "Next Action",
].forEach((needle) => requireText("cross-lane QA sections", doc, needle));

[
  "Fixed now",
  "Must fix before launch",
  "Should fix before launch",
  "Human review",
  "Can wait",
  "Not a bug / expected behavior",
].forEach((needle) => requireText("cross-lane QA classifications", doc, needle));

[
  "Chi'lly Chat video call local/remote video behavior",
  "fullscreen RTC aspect fit",
  "app-wide incoming-call status",
  "Live Watch-Party waiting-room path",
  "Live host participant action sheet",
  "Live seat approve/deny/mute/remove behavior",
  "Watch-Party participant join/sync/leave state",
  "Owner/Admin/Moderator Command Center",
  "Admin Search",
  "reporting/moderation queue",
  "content takedown",
  "account restriction",
  "legal/DMCA",
  "Premium",
  "creator money",
  "public routes",
  "auth routes",
  "creator routes",
].forEach((needle) => requireText("cross-lane QA scope", doc, needle));

[
  "/tmp/codex-remote-attachments/019efc95-a8df-7f30-aaae-e71949180bb0/9b817405-529a-40b3-956d-935948e834dd/1-Photo-1.jpg",
  "/tmp/app-chat-call-remote-video-live-action-ux-sweep-20260627-204906/README.md",
  "/tmp/app-actual-user-chat-call-and-live-closure-20260627-201748/README.md",
  "/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/",
  "/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/",
  "docs/release/OWNER_ADMIN_MODERATOR_PROOF_TRUTH_AUDIT.md",
].forEach((needle) => requireText("cross-lane QA reviewed artifacts", doc, needle));

[
  "A feature is not Closed for launch, tester readiness, or mass usage unless it is proved through the same path an actual installed-app user would use.",
  "Diagnostic proof may support a claim. It cannot close the actual user journey by itself.",
].forEach((needle) => requireText("actual-user proof standard", actualUserStandard, needle));

[
  "if (participant.streamURL) return participant.micOn ? \"Video connected\"",
  "const hasVideoStream = !!participant.streamURL;",
  "const showVideo = !!RTCView && hasVideoStream;",
  "hasVideoStream ? \"Video connecting\"",
].forEach((needle) => requireText("participant grid source", participantGrid, needle));

requireText("in-room communication panel", inRoomPanel, "{participantCount} in call");
requireText("communication room header", roomHeader, "{participantCount} in room");
requireText("live stage screen", liveStage, "const showHeroRemoteVideo = !heroParticipantIsCurrentUser && !!RTCView && !!heroMediaParticipant?.streamURL;");
requireText("live stage screen", liveStage, "const showRemoteLiveVideo = !isCurrentUser && !!RTCView && !!mediaParticipant?.streamURL;");

[
  "proof:cross-lane-actual-user-product-qa-sweep",
  "guard:cross-lane-actual-user-product-qa-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("Cross-lane actual-user product QA sweep proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Cross-lane actual-user product QA sweep proof passed.");
console.log("- reviewed artifacts, user/admin findings, proof-label findings, fixes, blockers, and safety wording are documented.");
console.log("- RTC remote-video/source-copy guardrails are present.");
